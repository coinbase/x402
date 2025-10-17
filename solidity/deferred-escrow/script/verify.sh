#!/bin/bash

# Script to verify deployed contracts on Basescan/Etherscan
# Usage: ./verify.sh [network]
# Example: ./verify.sh base-sepolia

NETWORK=${1:-base-sepolia}

# Contract address (same on all chains due to Safe Singleton Factory)
ESCROW_ADDRESS="0xF1308b39EdB10E5163581C1f8D0Bf8E26404A11f"

echo "Verifying contracts on $NETWORK..."
echo ""

# Verify DeferredPaymentEscrow
echo "Verifying DeferredPaymentEscrow at $ESCROW_ADDRESS..."
forge verify-contract \
    --chain $NETWORK \
    --num-of-optimizations 200 \
    --compiler-version v0.8.30 \
    --constructor-args $(cast abi-encode "constructor(uint256)" 86400) \
    $ESCROW_ADDRESS \
    src/DeferredPaymentEscrow.sol:DeferredPaymentEscrow

echo ""
echo "Verification complete!"
echo ""
echo "View verified contract:"
echo "- DeferredPaymentEscrow: https://sepolia.basescan.org/address/$ESCROW_ADDRESS#code"
