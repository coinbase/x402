# Troubleshooting Guide

This directory contains troubleshooting documentation for common x402 integration issues.

## Available Guides

### Facilitator Issues

- [**CDP Facilitator Memo Compatibility**](./cdp-facilitator-memo-compatibility.md) - Resolving issues where CDP facilitator rejects Solana transactions with Memo instructions added by the Python SDK

## General Troubleshooting Tips

### Payment Verification Failures

1. **Check network compatibility** - Ensure your facilitator supports the target network
2. **Verify addresses** - Confirm wallet addresses are correct for the target network
3. **Check token support** - Ensure the payment token is supported on the network
4. **Review logs** - Check facilitator response details for specific error messages

### Transaction Settlement Issues

1. **Insufficient funds** - Verify the payer has sufficient balance for both payment and gas fees
2. **Network congestion** - Consider increasing gas prices during high network activity  
3. **Facilitator compatibility** - Some facilitators may have restrictions on transaction types

### SDK Integration Problems

1. **Version compatibility** - Ensure all x402 packages are on compatible versions
2. **Network configuration** - Verify RPC endpoints and network IDs are correctly configured
3. **Authentication** - Check that wallet private keys and addresses are correctly set

## Getting Help

- [x402 GitHub Issues](https://github.com/coinbase/x402/issues) - Report bugs and ask questions
- [x402 Ecosystem](https://www.x402.org/ecosystem) - Find compatible facilitators and services
- [Documentation](/docs) - Complete protocol and implementation documentation