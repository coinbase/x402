#!/bin/bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "${SCRIPT_DIR}/../.." && pwd)"
SKIP_SETUP=false

for arg in "$@"; do
  case "$arg" in
    --skip-setup)
      SKIP_SETUP=true
      ;;
    *)
      echo "Unknown argument: $arg"
      echo "Usage: bash regtest/lightning/run-tests.sh [--skip-setup]"
      exit 1
      ;;
  esac
done

if [ "$SKIP_SETUP" = false ]; then
  bash "${SCRIPT_DIR}/setup.sh"
fi

cd "${REPO_ROOT}/python/x402"

if command -v uv >/dev/null 2>&1; then
  uv run pytest tests/integrations/test_lightning.py -v
  exit 0
fi

if [ -x ".venv/bin/python" ]; then
  .venv/bin/python -m pytest tests/integrations/test_lightning.py -v
  exit 0
fi

python3 -m pytest tests/integrations/test_lightning.py -v
