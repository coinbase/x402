#!/bin/bash

# Run Python Solana E2E Tests
# This script makes it easy to run the full e2e test suite

set -e

echo "======================================================================"
echo "  Solana E2E Test Runner"
echo "======================================================================"
echo

# Check if .env exists
if [ ! -f ".env" ]; then
    echo "❌ No .env file found!"
    echo
    echo "Create a .env file with:"
    echo "  SOLANA_PRIVATE_KEY=your_base58_private_key"
    echo "  SOLANA_ADDRESS=your_solana_address"
    echo "  FEE_PAYER_PRIVATE_KEY=fee_payer_key  # Optional, for settlement test"
    echo "  RUN_SETTLEMENT_TEST=true  # Optional, enables actual blockchain txs"
    echo
    exit 1
fi

# Load .env
export $(grep -v '^#' .env | xargs)

echo "🔍 Configuration:"
echo "   Client Address: ${SOLANA_ADDRESS:-Not set}"
echo "   Settlement Test: ${RUN_SETTLEMENT_TEST:-false}"
echo

# Check wallet is funded
if [ -n "$SOLANA_ADDRESS" ]; then
    echo "💰 Checking wallet balance..."
    uv run pytest tests/test_svm_e2e.py::TestSVMEndToEnd::test_check_wallet_balance -v -s
    echo
fi

# Run tests
echo "🧪 Running E2E Tests..."
echo

if [ "$1" == "--settlement" ] || [ "$RUN_SETTLEMENT_TEST" == "true" ]; then
    echo "⚠️  Running WITH settlement test (will send real transaction)"
    echo
    export RUN_SETTLEMENT_TEST=true
    uv run pytest tests/test_svm_e2e.py -v -s
else
    echo "ℹ️  Running WITHOUT settlement test (no blockchain transactions)"
    echo "   To run with settlement: ./run_e2e_test.sh --settlement"
    echo
    uv run pytest tests/test_svm_e2e.py -v -s -m "not skipif"
fi

echo
echo "======================================================================"
echo "✅ Tests Complete!"
echo "======================================================================"

