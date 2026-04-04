# Polygon Mainnet x402 Client Example

This example demonstrates how to use the x402 Python SDK to make payments on Polygon mainnet.

## Overview

Polygon mainnet support was recently added to x402 with native USDC support:
- **Network:** `eip155:137` (Polygon mainnet)
- **Asset:** USDC at `0x3c499c542cEF5E3811e1192ce70d8cC03d5c3359`
- **Transfer Method:** EIP-3009 `transferWithAuthorization`

## Prerequisites

1. **MATIC for gas fees**: Your wallet needs MATIC to pay gas on Polygon
2. **USDC balance**: Your wallet needs USDC on Polygon mainnet for payments
3. **RPC endpoint**: A Polygon mainnet RPC URL (see below for options)

## Setup

1. Install dependencies:
```bash
uv sync
```

2. Copy `.env-local` to `.env` and configure:
```bash
cp .env-local .env
```

3. Set environment variables:
```env
# Your private key (without 0x prefix)
PRIVATE_KEY=your_private_key_here

# Polygon mainnet RPC URL (choose one):
RPC_URL=https://polygon.llamarpc.com
# RPC_URL=https://polygon-mainnet.public.blastapi.io
# RPC_URL=https://rpc.ankr.com/polygon
# RPC_URL=https://polygon.blockpi.network/v1/rpc/public

# Target server to test payments against
TARGET_URL=https://api.example.com/paid-endpoint

# Payment amount in USDC (e.g., 0.001 = $0.001)
PAYMENT_AMOUNT=0.001
```

## Network Configuration

Polygon mainnet is preconfigured in the x402 Python SDK with these settings:

```python
"eip155:137": {
    "chain_id": 137,
    "default_asset": {
        "address": "0x3c499c542cEF5E3811e1192ce70d8cC03d5c3359",
        "name": "USD Coin", 
        "version": "2",
        "decimals": 6,
    }
}
```

## Usage Examples

### Basic Payment Example
```bash
python basic_payment.py
```

Shows how to:
- Initialize x402 client for Polygon mainnet
- Make a payment using USDC
- Handle 402 Payment Required responses
- Retry with payment signature

### Balance Check Example  
```bash
python check_balance.py
```

Shows how to:
- Check MATIC balance for gas fees
- Check USDC balance for payments
- Display balances in human-readable format

### Multi-Network Comparison
```bash
python compare_networks.py
```

Shows how to:
- Compare the same payment across Base and Polygon
- Handle different gas costs and confirmation times
- Choose optimal network based on cost/speed

## Key Differences from Base

### Gas Costs
- **Base**: Uses ETH for gas, typically 0.001-0.01 ETH (~$3-30)
- **Polygon**: Uses MATIC for gas, typically 0.01-0.1 MATIC (~$0.01-0.10)

**Winner: Polygon** (much lower gas costs)

### Confirmation Times
- **Base**: ~2 seconds (L2 based on Ethereum)
- **Polygon**: ~2-5 seconds (Proof-of-Stake consensus)

**Winner: Base** (slightly faster, but both are fast)

### USDC Contract
- **Base**: `0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913`
- **Polygon**: `0x3c499c542cEF5E3811e1192ce70d8cC03d5c3359`

Both use the same EIP-3009 `transferWithAuthorization` method.

## Common Issues & Solutions

### Insufficient MATIC Balance
```
Error: insufficient funds for gas
```
**Solution**: Get MATIC from:
- [Polygon Bridge](https://wallet.polygon.technology/polygon/bridge)
- [QuickSwap](https://quickswap.exchange/)
- CEX withdrawal (Binance, Coinbase, etc.)

### Insufficient USDC Balance
```  
Error: insufficient balance
```
**Solution**: Get USDC on Polygon from:
- [Polygon Bridge](https://wallet.polygon.technology/polygon/bridge) (bridge from Ethereum)
- [Stargate](https://stargate.finance/) (cross-chain swap)
- CEX withdrawal directly to Polygon

### RPC Rate Limits
```
Error: rate limit exceeded
```
**Solution**: 
- Use multiple RPC endpoints in rotation
- Get a dedicated RPC key from Ankr, QuickNode, or Alchemy
- Add delays between requests

### Transaction Not Found
```
Error: transaction not found
```
**Solution**:
- Polygon occasionally has block reorganizations
- Wait longer for transaction confirmation
- Check transaction on [PolygonScan](https://polygonscan.com/)

## Cost Analysis

For a $0.001 USDC payment:

| Cost Component | Base | Polygon |
|----------------|------|---------|
| Payment Amount | $0.001 | $0.001 |
| Gas Fee | ~$0.02 | ~$0.002 |
| **Total Cost** | **$0.021** | **$0.003** |

**Savings on Polygon: ~85% lower total cost**

## When to Use Polygon vs Base

### Use Polygon When:
- ✅ Cost is the primary concern
- ✅ Making many small micropayments
- ✅ Users already have MATIC/USDC on Polygon
- ✅ Longer confirmation times (2-5s) are acceptable

### Use Base When:
- ✅ Speed is critical (2s confirmations)
- ✅ Users prefer Coinbase ecosystem
- ✅ Higher payment amounts where gas % is minimal
- ✅ Need maximum ecosystem support

## Resources

- [Polygon Documentation](https://docs.polygon.technology/)
- [PolygonScan Explorer](https://polygonscan.com/)
- [Polygon Bridge](https://wallet.polygon.technology/polygon/bridge)
- [x402 Documentation](https://docs.x402.org/)
- [USDC on Polygon](https://polygonscan.com/token/0x3c499c542cef5e3811e1192ce70d8cc03d5c3359)