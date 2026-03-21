#!/bin/bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
COMPOSE_FILE="${SCRIPT_DIR}/docker-compose.yml"
ENV_FILE="${SCRIPT_DIR}/.env.lightning"
ALICE_DATA_DIR="${SCRIPT_DIR}/data/alice"
BOB_DATA_DIR="${SCRIPT_DIR}/data/bob"
ALICE_TLS_CERT_PATH="${ALICE_DATA_DIR}/tls.cert"
ALICE_MACAROON_PATH="${ALICE_DATA_DIR}/data/chain/bitcoin/regtest/admin.macaroon"
BOB_TLS_CERT_PATH="${BOB_DATA_DIR}/tls.cert"
BOB_MACAROON_PATH="${BOB_DATA_DIR}/data/chain/bitcoin/regtest/admin.macaroon"

dc() {
  docker compose -f "$COMPOSE_FILE" "$@"
}

lncli_cmd() {
  local service="$1"
  shift
  dc exec -T "$service" lncli --network=regtest --lnddir=/data "$@"
}

require_tool() {
  local tool="$1"
  if ! command -v "$tool" >/dev/null 2>&1; then
    echo "Error: missing required tool: $tool"
    exit 1
  fi
}

wait_for_eval() {
  local description="$1"
  local command="$2"
  local attempts="${3:-90}"
  local sleep_seconds="${4:-2}"

  for ((i=1; i<=attempts; i++)); do
    if eval "$command" >/dev/null 2>&1; then
      echo "  ${description}: ready"
      return 0
    fi
    sleep "$sleep_seconds"
  done

  echo "Error: timed out waiting for ${description}"
  return 1
}

json_get() {
  local expr="$1"
  python3 -c "import json,sys; data=json.load(sys.stdin); print(${expr})"
}

channel_count_cmd() {
  local service="$1"
  echo "lncli_cmd ${service} listchannels | python3 -c 'import json,sys; data=json.load(sys.stdin); sys.exit(0 if len(data.get(\"channels\", [])) > 0 else 1)'"
}

bob_outbound_liquidity_cmd() {
  echo "lncli_cmd bob listchannels | python3 -c 'import json,sys; data=json.load(sys.stdin); total=sum(int(c.get(\"local_balance\", \"0\")) for c in data.get(\"channels\", [])); sys.exit(0 if total > 0 else 1)'"
}

require_tool docker
require_tool python3

if ! docker info >/dev/null 2>&1; then
  echo "Error: docker daemon is not running."
  exit 1
fi

echo "Bringing up regtest stack (bitcoind + alice + bob)..."
dc up -d bitcoind alice bob

echo "Waiting for bitcoind..."
wait_for_eval \
  "bitcoind RPC" \
  "dc exec -T bitcoind bitcoin-cli -regtest -rpcuser=x402 -rpcpassword=x402pass -rpcport=43782 getblockchaininfo"

echo "Waiting for lnd nodes..."
wait_for_eval \
  "alice getinfo" \
  "lncli_cmd alice getinfo"
wait_for_eval \
  "bob getinfo" \
  "lncli_cmd bob getinfo"

wait_for_eval \
  "alice tls cert" \
  "[ -f \"$ALICE_TLS_CERT_PATH\" ]"
wait_for_eval \
  "alice macaroon" \
  "[ -f \"$ALICE_MACAROON_PATH\" ]"
wait_for_eval \
  "bob tls cert" \
  "[ -f \"$BOB_TLS_CERT_PATH\" ]"
wait_for_eval \
  "bob macaroon" \
  "[ -f \"$BOB_MACAROON_PATH\" ]"

echo "Funding alice wallet..."
ALICE_ADDRESS="$(lncli_cmd alice newaddress p2wkh | json_get "data['address']")"
dc exec -T bitcoind bitcoin-cli -regtest -rpcuser=x402 -rpcpassword=x402pass -rpcport=43782 \
  generatetoaddress 120 "$ALICE_ADDRESS" >/dev/null

wait_for_eval \
  "alice rpc ready" \
  "lncli_cmd alice listpeers"
wait_for_eval \
  "bob rpc ready" \
  "lncli_cmd bob listpeers"

echo "Opening alice -> bob channel..."
BOB_PUBKEY="$(lncli_cmd bob getinfo | json_get "data['identity_pubkey']")"
for _ in {1..20}; do
  if lncli_cmd alice connect "${BOB_PUBKEY}@bob:9735" >/dev/null 2>&1; then
    break
  fi
  sleep 2
done

ALICE_CHANNELS="$(lncli_cmd alice listchannels | json_get "len(data.get('channels', []))")"
if [ "$ALICE_CHANNELS" -eq 0 ]; then
  opened=false
  for _ in {1..30}; do
    if lncli_cmd alice openchannel --node_key="$BOB_PUBKEY" --local_amt=1000000 --push_amt=500000 >/dev/null 2>&1; then
      opened=true
      break
    fi
    sleep 2
  done
  if [ "$opened" = false ]; then
    echo "Error: failed to open alice -> bob channel after retries"
    exit 1
  fi
  dc exec -T bitcoind bitcoin-cli -regtest -rpcuser=x402 -rpcpassword=x402pass -rpcport=43782 \
    generatetoaddress 6 "$ALICE_ADDRESS" >/dev/null
fi

if ! eval "$(bob_outbound_liquidity_cmd)" >/dev/null 2>&1; then
  echo "Funding bob and opening bob -> alice outbound channel..."
  BOB_ADDRESS="$(lncli_cmd bob newaddress p2wkh | json_get "data['address']")"
  dc exec -T bitcoind bitcoin-cli -regtest -rpcuser=x402 -rpcpassword=x402pass -rpcport=43782 \
    generatetoaddress 120 "$BOB_ADDRESS" >/dev/null

  ALICE_PUBKEY="$(lncli_cmd alice getinfo | json_get "data['identity_pubkey']")"
  for _ in {1..20}; do
    if lncli_cmd bob connect "${ALICE_PUBKEY}@alice:9735" >/dev/null 2>&1; then
      break
    fi
    sleep 2
  done

  opened=false
  for _ in {1..30}; do
    if lncli_cmd bob openchannel --node_key="$ALICE_PUBKEY" --local_amt=300000 >/dev/null 2>&1; then
      opened=true
      break
    fi
    sleep 2
  done
  if [ "$opened" = false ]; then
    echo "Error: failed to open bob -> alice channel after retries"
    exit 1
  fi

  dc exec -T bitcoind bitcoin-cli -regtest -rpcuser=x402 -rpcpassword=x402pass -rpcport=43782 \
    generatetoaddress 6 "$BOB_ADDRESS" >/dev/null
fi

echo "Waiting for active channel..."
wait_for_eval "alice active channel" "$(channel_count_cmd alice)" 120 2
wait_for_eval "bob active channel" "$(channel_count_cmd bob)" 120 2
wait_for_eval "bob outbound liquidity" "$(bob_outbound_liquidity_cmd)" 120 2

cat > "$ENV_FILE" <<EOF
X402_LIGHTNING_LND_INTEGRATION=1
LND_ALICE_REST_HOST=https://127.0.0.1:18080
LND_ALICE_TLS_CERT_PATH=$ALICE_TLS_CERT_PATH
LND_ALICE_MACAROON_PATH=$ALICE_MACAROON_PATH
LND_BOB_REST_HOST=https://127.0.0.1:18081
LND_BOB_TLS_CERT_PATH=$BOB_TLS_CERT_PATH
LND_BOB_MACAROON_PATH=$BOB_MACAROON_PATH
EOF

echo "Wrote ${ENV_FILE}"
echo "Layer 3 environment is ready."
echo ""
echo "Run tests:"
echo "  bash regtest/lightning/run-tests.sh --skip-setup"
