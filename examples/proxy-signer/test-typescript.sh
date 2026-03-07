#!/usr/bin/env bash
# Test the proxy-signer example with the TypeScript client.
#
# Starts:  Java proxy server  →  x402 resource server  →  TypeScript client
# Logs:    .logs/java-server.log, .logs/resource-server.log
# Output:  Client output printed to stdout
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
LOG_DIR="$SCRIPT_DIR/.logs"
mkdir -p "$LOG_DIR"

# Kill any leftover processes from previous runs
for port in 8080 4021; do
  lsof -ti :"$port" 2>/dev/null | xargs kill -9 2>/dev/null || true
done

# Load shared .env
if [[ -f "$SCRIPT_DIR/.env" ]]; then
  set -a; source "$SCRIPT_DIR/.env"; set +a
fi

# Resolve GitHub credentials for GitHub Packages (CDP SDK).
if [[ -n "${GITHUB_USERNAME:-}" ]]; then
  export GITHUB_ACTOR="$GITHUB_USERNAME"
elif [[ -z "${GITHUB_ACTOR:-}" ]]; then
  if command -v gh &>/dev/null && gh auth token &>/dev/null; then
    export GITHUB_ACTOR="$(gh api user -q .login 2>/dev/null || echo "github-user")"
    export GITHUB_TOKEN="$(gh auth token 2>/dev/null || echo "")"
  fi
fi
export GITHUB_TOKEN="${GITHUB_TOKEN:-}"

if [[ -z "${GITHUB_ACTOR:-}" || -z "${GITHUB_TOKEN:-}" ]]; then
  echo "  ✗ GitHub credentials required to pull CDP SDK from GitHub Packages."
  echo "    Either:"
  echo "      • Add GITHUB_USERNAME and GITHUB_TOKEN to .env"
  echo "      • Or run: gh auth login"
  exit 1
fi

JAVA_PID="" EXPRESS_PID=""

cleanup() {
  echo ""
  echo "Shutting down..."
  [[ -n "$EXPRESS_PID" ]] && kill "$EXPRESS_PID" 2>/dev/null && wait "$EXPRESS_PID" 2>/dev/null || true
  [[ -n "$JAVA_PID" ]]    && kill "$JAVA_PID"    2>/dev/null && wait "$JAVA_PID"    2>/dev/null || true
  echo "Done."
}
trap cleanup EXIT

# ── 1. Start Java proxy server ──────────────────────────────────────────────

echo "▸ Starting Java proxy server..."
cd "$SCRIPT_DIR/java-server"

if [[ -f gradlew ]]; then
  ./gradlew run > "$LOG_DIR/java-server.log" 2>&1 &
else
  gradle run > "$LOG_DIR/java-server.log" 2>&1 &
fi
JAVA_PID=$!

echo "  Waiting for http://localhost:8080 ..."
for i in $(seq 1 60); do
  if curl -sf http://localhost:8080/evm/address > /dev/null 2>&1; then break; fi
  if ! kill -0 "$JAVA_PID" 2>/dev/null; then
    echo "  ✗ Java server exited early. Check $LOG_DIR/java-server.log"
    exit 1
  fi
  sleep 2
done
curl -sf http://localhost:8080/evm/address > /dev/null 2>&1 || {
  echo "  ✗ Java proxy server failed to start. Check $LOG_DIR/java-server.log"; exit 1
}
echo "  ✓ Java proxy server ready (pid $JAVA_PID)"

# ── 2. Fetch addresses from the proxy ───────────────────────────────────────

EVM_ADDRESS=$(curl -sf http://localhost:8080/evm/address | python3 -c "import sys,json; print(json.load(sys.stdin)['address'])")
SVM_ADDRESS=$(curl -sf http://localhost:8080/svm/address | python3 -c "import sys,json; print(json.load(sys.stdin)['address'])")
echo "  EVM address: $EVM_ADDRESS"
echo "  SVM address: $SVM_ADDRESS"

# ── 3. Start x402 resource server ───────────────────────────────────────────

echo "▸ Starting x402 resource server..."
cd "$SCRIPT_DIR/../../examples/typescript/servers/express"

EVM_ADDRESS="$EVM_ADDRESS" \
SVM_ADDRESS="$SVM_ADDRESS" \
FACILITATOR_URL="${FACILITATOR_URL:-https://x402.org/facilitator}" \
  npx tsx index.ts > "$LOG_DIR/resource-server.log" 2>&1 &
EXPRESS_PID=$!

echo "  Waiting for http://localhost:4021 ..."
for i in $(seq 1 30); do
  if curl -sf -o /dev/null -w '' http://localhost:4021/weather 2>/dev/null; then break; fi
  if curl -s -o /dev/null -w '%{http_code}' http://localhost:4021/weather 2>/dev/null | grep -q '402'; then break; fi
  if ! kill -0 "$EXPRESS_PID" 2>/dev/null; then
    echo "  ✗ Resource server exited early. Check $LOG_DIR/resource-server.log"
    exit 1
  fi
  sleep 1
done
echo "  ✓ x402 resource server ready (pid $EXPRESS_PID)"

# ── 4. Run TypeScript client ────────────────────────────────────────────────

echo ""
echo "════════════════════════════════════════════════════════════"
echo "  Running TypeScript proxy-signer client"
echo "════════════════════════════════════════════════════════════"
echo ""

cd "$SCRIPT_DIR/typescript-client"

# Symlink node_modules from an existing workspace example so pnpm packages resolve
if [[ ! -d node_modules ]]; then
  ln -s "$(cd "$SCRIPT_DIR/../../examples/typescript/clients/fetch/node_modules" && pwd)" node_modules
fi

PROXY_SIGNER_URL="${PROXY_SIGNER_URL:-http://localhost:8080}" \
RESOURCE_SERVER_URL="${RESOURCE_SERVER_URL:-http://localhost:4021}" \
ENDPOINT_PATH="${ENDPOINT_PATH:-/weather}" \
  npx tsx index.ts
