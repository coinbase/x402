# Arbitrum Chain Support for x402

## Summary

This specification defines how x402 protocol supports Arbitrum One and Arbitrum Sepolia networks. Arbitrum is an optimistic rollup solution that provides Ethereum compatibility with reduced gas costs and faster transaction confirmation times while maintaining EVM compatibility.

## Network Identifiers

### Arbitrum One (Mainnet)
- **Network ID**: `arbitrum-one`
- **Chain ID**: 42161 (0xA4B1)
- **RPC**: https://arb1.arbitrum.io/rpc
- **Block Explorer**: https://arbiscan.io
- **Native Currency**: ETH

### Arbitrum Sepolia (Testnet)
- **Network ID**: `arbitrum-sepolia` 
- **Chain ID**: 421614 (0x66EEE)
- **RPC**: https://sepolia-rollup.arbitrum.io/rpc
- **Block Explorer**: https://sepolia.arbiscan.io
- **Native Currency**: ETH

## Supported Assets

### USDC on Arbitrum One

**Native USDC** (Recommended)
- **Contract**: `0xaf88d065e77c8cc2239327c5edb3a432268e5831`
- **Symbol**: USDC
- **Decimals**: 6
- **Version**: "2" (for EIP-712 domain)
- **EIP-3009**: ✅ Supported
- **Name**: "USD Coin"

**Bridged USDC** (Legacy - Not Supported)
- **Contract**: `0xFF970A61A04b1cA14834A43f5dE4533eBDDB5CC8`
- **Symbol**: USDC.e  
- **EIP-3009**: ❌ Not supported (uses different EIP-712 structure)
- **Note**: This bridged version should NOT be used with x402

### USDC on Arbitrum Sepolia
- **Contract**: `0x75faf114eafb1BDbe2F0316DF893fd58CE46AA4d`
- **Symbol**: USDC
- **Decimals**: 6
- **Version**: "2"
- **EIP-3009**: ✅ Supported
- **Name**: "USD Coin"

## Scheme Support

Arbitrum supports the `exact` scheme for EVM chains with the following considerations:

### EIP-712 Domain Separator

Arbitrum uses the standard EIP-712 domain separator structure:

```solidity
keccak256(
    abi.encode(
        EIP712_DOMAIN_TYPEHASH,
        keccak256(bytes(name)),     // "USD Coin"
        keccak256(bytes(version)),  // "2"  
        chainId,                    // 42161 for mainnet, 421614 for sepolia
        verifyingContract           // USDC contract address
    )
)
```

### Gas Considerations

- Arbitrum has significantly lower gas costs than Ethereum mainnet
- L2 gas pricing model uses compressed data costs
- Transactions typically confirm within 2-3 seconds
- Gas estimation should account for L2-specific pricing

## Implementation Notes

1. **Only Native USDC**: x402 implementations MUST use Native USDC contracts, not bridged USDC.e
2. **EVM Compatibility**: Standard EVM exact scheme implementation applies without modification
3. **Chain ID Verification**: Signatures must include correct Arbitrum chain ID
4. **RPC Reliability**: Use reliable RPC endpoints; consider fallback URLs for production

## Security Considerations

### Asset Verification
- Always verify USDC contract addresses match the official Native USDC contracts
- Reject any payments using bridged USDC.e contracts
- Verify EIP-3009 support before accepting payments

### Chain Verification  
- Verify chain ID in all EIP-712 signatures
- Ensure facilitator is connected to correct Arbitrum network
- Validate block confirmations appropriate for transaction value

### Bridge Risk Mitigation
- Native USDC eliminates bridge risk compared to bridged alternatives
- Monitor for any USDC contract upgrades or changes

## Example X-Payment Header

```json
{
  "x402Version": 1,
  "scheme": "exact", 
  "network": "arbitrum-one",
  "payload": {
    "signature": "0x2d6a7588d6acca505cbf0d9a4a227e0c52c6c34008c8e8986a1283259764173608a2ce6496642e377d6da8dbbf5836e9bd15092f9ecab05ded3d6293af148b571c",
    "authorization": {
      "from": "0x857b06519E91e3A54538791bDbb0E22373e36b66",
      "to": "0x209693Bc6afc0C5328bA36FaF03C514EF312287C", 
      "value": "10000",
      "validAfter": "1740672089",
      "validBefore": "1740672154",
      "nonce": "0xf3746613c2d920b5fdabc0856f2aeb2d4f88ee6037b8cc5d04a71a4462f13480"
    }
  }
}
```

## Use Cases

- **AI API Payments**: Lower gas costs make micro-payments for AI/ML API calls economically viable
- **Content Monetization**: Fast confirmation times enable real-time content access payments  
- **Gaming**: Sub-second transaction times suitable for in-game micropayments
- **DeFi Integration**: Native USDC enables seamless integration with Arbitrum DeFi protocols

## Appendix

### Network Configuration

Facilitators should configure Arbitrum networks as follows:

```typescript
const ARBITRUM_NETWORKS = {
  'arbitrum-one': {
    chainId: 42161,
    rpcUrl: 'https://arb1.arbitrum.io/rpc',
    usdcContract: '0xaf88d065e77c8cc2239327c5edb3a432268e5831',
    schemes: ['exact']
  },
  'arbitrum-sepolia': {
    chainId: 421614, 
    rpcUrl: 'https://sepolia-rollup.arbitrum.io/rpc',
    usdcContract: '0x75faf114eafb1BDbe2F0316DF893fd58CE46AA4d',
    schemes: ['exact']
  }
};
```

### Testing Recommendations

1. Test signature verification with Arbitrum chain IDs
2. Verify gas estimation accuracy on L2  
3. Test settlement timing and confirmation requirements
4. Validate error handling for bridged USDC rejection
5. Test facilitator failover between RPC endpoints