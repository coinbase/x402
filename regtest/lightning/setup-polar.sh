#!/bin/bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
OUTPUT_ENV_FILE="${SCRIPT_DIR}/.env.lightning"
POLAR_NETWORKS_DIR="${POLAR_NETWORKS_DIR:-$HOME/.polar/networks}"

if ! command -v jq >/dev/null 2>&1; then
  echo "Error: jq is required. Install jq and retry."
  exit 1
fi

if [ ! -d "$POLAR_NETWORKS_DIR" ]; then
  echo "Error: Polar networks directory not found: $POLAR_NETWORKS_DIR"
  echo "Start Polar and create a regtest network with alice/bob nodes first."
  exit 1
fi

normalize_name() {
  echo "$1" | tr '[:upper:]' '[:lower:]'
}

find_network_json() {
  local network_dir="$1"
  local candidate=""
  for candidate in "$network_dir/network.json" "$network_dir/config.json" "$network_dir/polar-network.json"; do
    if [ -f "$candidate" ]; then
      echo "$candidate"
      return 0
    fi
  done
  return 1
}

read_rest_port_from_json() {
  local json_file="$1"
  local node_name="$2"
  jq -r --arg node "$node_name" '
    def node_name: ((.name // .alias // .id // "") | ascii_downcase);
    [
      .. | objects
      | select(node_name == ($node | ascii_downcase))
      | (.ports.rest // .ports.restPort // .restPort // .rest_port // empty)
      | tostring
    ] | map(select(length > 0)) | first // ""
  ' "$json_file"
}

resolve_rest_port() {
  local network_dir="$1"
  local node_name="$2"
  local json_file=""
  local rest_port=""

  if json_file="$(find_network_json "$network_dir")"; then
    rest_port="$(read_rest_port_from_json "$json_file" "$node_name")"
  fi

  if [ -z "$rest_port" ]; then
    if [ "$node_name" = "alice" ]; then
      rest_port="8081"
    elif [ "$node_name" = "bob" ]; then
      rest_port="8082"
    fi
  fi

  echo "$rest_port"
}

resolve_first_network_dir() {
  local first=""
  for first in "$POLAR_NETWORKS_DIR"/*; do
    if [ -d "$first" ]; then
      echo "$first"
      return 0
    fi
  done
  return 1
}

POLAR_NETWORK_DIR="${POLAR_NETWORK_DIR:-}"
if [ -z "$POLAR_NETWORK_DIR" ]; then
  if ! POLAR_NETWORK_DIR="$(resolve_first_network_dir)"; then
    echo "Error: No Polar networks found in $POLAR_NETWORKS_DIR"
    exit 1
  fi
fi

if [ ! -d "$POLAR_NETWORK_DIR" ]; then
  echo "Error: Polar network directory not found: $POLAR_NETWORK_DIR"
  exit 1
fi

ALICE_NAME="${LND_ALICE_NODE_NAME:-alice}"
BOB_NAME="${LND_BOB_NODE_NAME:-bob}"
ALICE_NODE_DIR="$POLAR_NETWORK_DIR/volumes/lnd/$(normalize_name "$ALICE_NAME")"
BOB_NODE_DIR="$POLAR_NETWORK_DIR/volumes/lnd/$(normalize_name "$BOB_NAME")"

ALICE_TLS_CERT_PATH="$ALICE_NODE_DIR/tls.cert"
ALICE_MACAROON_PATH="$ALICE_NODE_DIR/data/chain/bitcoin/regtest/admin.macaroon"
BOB_TLS_CERT_PATH="$BOB_NODE_DIR/tls.cert"
BOB_MACAROON_PATH="$BOB_NODE_DIR/data/chain/bitcoin/regtest/admin.macaroon"

if [ ! -f "$ALICE_TLS_CERT_PATH" ] || [ ! -f "$ALICE_MACAROON_PATH" ]; then
  echo "Error: Could not find Alice TLS cert or macaroon under $ALICE_NODE_DIR"
  exit 1
fi

if [ ! -f "$BOB_TLS_CERT_PATH" ] || [ ! -f "$BOB_MACAROON_PATH" ]; then
  echo "Error: Could not find Bob TLS cert or macaroon under $BOB_NODE_DIR"
  exit 1
fi

ALICE_REST_PORT="$(resolve_rest_port "$POLAR_NETWORK_DIR" "$(normalize_name "$ALICE_NAME")")"
BOB_REST_PORT="$(resolve_rest_port "$POLAR_NETWORK_DIR" "$(normalize_name "$BOB_NAME")")"

if [ -z "$ALICE_REST_PORT" ] || [ -z "$BOB_REST_PORT" ]; then
  echo "Error: Could not determine LND REST ports from Polar config."
  echo "Set LND_ALICE_REST_HOST and LND_BOB_REST_HOST manually in .env.lightning."
  exit 1
fi

ALICE_REST_HOST="https://127.0.0.1:${ALICE_REST_PORT}"
BOB_REST_HOST="https://127.0.0.1:${BOB_REST_PORT}"

cat > "$OUTPUT_ENV_FILE" <<EOF
X402_LIGHTNING_LND_INTEGRATION=1
POLAR_NETWORK_DIR=$POLAR_NETWORK_DIR
LND_ALICE_REST_HOST=$ALICE_REST_HOST
LND_ALICE_TLS_CERT_PATH=$ALICE_TLS_CERT_PATH
LND_ALICE_MACAROON_PATH=$ALICE_MACAROON_PATH
LND_BOB_REST_HOST=$BOB_REST_HOST
LND_BOB_TLS_CERT_PATH=$BOB_TLS_CERT_PATH
LND_BOB_MACAROON_PATH=$BOB_MACAROON_PATH
EOF

echo "Wrote $OUTPUT_ENV_FILE"
echo ""
echo "Sanity checks:"
echo "  Alice REST: $ALICE_REST_HOST"
echo "  Bob REST:   $BOB_REST_HOST"
echo ""

if command -v curl >/dev/null 2>&1; then
  ALICE_MACAROON_HEX="$(xxd -p -c 1000 "$ALICE_MACAROON_PATH" | tr -d '\n')"
  BOB_MACAROON_HEX="$(xxd -p -c 1000 "$BOB_MACAROON_PATH" | tr -d '\n')"

  if curl --silent --show-error --fail \
    --cacert "$ALICE_TLS_CERT_PATH" \
    --header "Grpc-Metadata-macaroon: $ALICE_MACAROON_HEX" \
    "$ALICE_REST_HOST/v1/getinfo" >/dev/null; then
    echo "  Alice getinfo: OK"
  else
    echo "  Alice getinfo: FAILED (is node running?)"
  fi

  if curl --silent --show-error --fail \
    --cacert "$BOB_TLS_CERT_PATH" \
    --header "Grpc-Metadata-macaroon: $BOB_MACAROON_HEX" \
    "$BOB_REST_HOST/v1/getinfo" >/dev/null; then
    echo "  Bob getinfo:   OK"
  else
    echo "  Bob getinfo:   FAILED (is node running?)"
  fi

  ALICE_CHANNEL_COUNT="$(curl --silent --show-error --fail \
    --cacert "$ALICE_TLS_CERT_PATH" \
    --header "Grpc-Metadata-macaroon: $ALICE_MACAROON_HEX" \
    "$ALICE_REST_HOST/v1/channels" | jq -r '.channels | length')"
  if [ "${ALICE_CHANNEL_COUNT:-0}" -gt 0 ]; then
    echo "  Alice channels: ${ALICE_CHANNEL_COUNT}"
  else
    echo "  Alice channels: 0 (open a channel alice <-> bob before running tests)"
  fi
else
  echo "  curl not found; skipping live node checks"
fi

echo ""
echo "Run Layer 3 tests with:"
echo "  cd python/x402"
echo "  uv run pytest tests/integrations/test_lightning.py -v"
