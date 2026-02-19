# x402 Hypercore Mechanism

Hypercore L1 (Hyperliquid) implementation of the x402 payment protocol using the **Exact** payment scheme with API-based settlement.

## Installation

```bash
uv add x402[hypercore]
```

Note: Hypercore support uses standard Python dependencies (httpx, eth-account). No additional blockchain libraries required.

## Overview

Three components for handling x402 payments on Hypercore L1:

- **Client** (`ExactHypercoreClientScheme`) - Creates EIP-712 signed SendAsset actions
- **Server** (`ExactHypercoreServerScheme`) - Builds payment requirements, parses prices
- **Facilitator** (`ExactHypercoreFacilitatorScheme`) - Verifies signatures, submits to Hyperliquid API

## Quick Start

### Client

```python
from x402 import x402Client
from x402.mechanisms.hypercore.exact import ExactHypercoreScheme

# Implement signer with your preferred wallet
class HyperliquidSigner:
    async def sign_send_asset(self, action):
        # EIP-712 signing logic
        return {"r": "0x...", "s": "0x...", "v": 27}

signer = HyperliquidSigner()

client = x402Client()
client.register("hypercore:mainnet", ExactHypercoreScheme(signer=signer))

payload = await client.create_payment_payload(payment_required)
```

### Server

```python
from x402 import x402ResourceServer
from x402.mechanisms.hypercore.exact import ExactHypercoreServerScheme

server = x402ResourceServer(facilitator_client)
server.register("hypercore:mainnet", ExactHypercoreServerScheme())
```

### Facilitator

```python
from x402 import x402Facilitator
from x402.mechanisms.hypercore.exact import ExactHypercoreFacilitatorScheme
from x402.mechanisms.hypercore import HYPERLIQUID_API_MAINNET

facilitator = x402Facilitator()
facilitator.register(
    ["hypercore:mainnet", "hypercore:testnet"],
    ExactHypercoreFacilitatorScheme(api_url=HYPERLIQUID_API_MAINNET),
)
```

## Exports

### `x402.mechanisms.hypercore.exact`

| Export | Description |
|--------|-------------|
| `ExactHypercoreScheme` | Client scheme (alias for `ExactHypercoreClientScheme`) |
| `ExactHypercoreClientScheme` | Client-side payment creation |
| `ExactHypercoreServerScheme` | Server-side requirement building |
| `ExactHypercoreFacilitatorScheme` | Facilitator verification/settlement |
| `register_exact_hypercore_client()` | Helper to register client |
| `register_exact_hypercore_server()` | Helper to register server |
| `register_exact_hypercore_facilitator()` | Helper to register facilitator |

### `x402.mechanisms.hypercore`

| Export | Description |
|--------|-------------|
| `SCHEME_EXACT` | Scheme identifier ("exact") |
| `DEFAULT_USDB_TOKEN` | Default USDH token identifier |
| `NETWORK_MAINNET` | Mainnet network identifier |
| `NETWORK_TESTNET` | Testnet network identifier |
| `HYPERLIQUID_API_MAINNET` | Mainnet API endpoint |
| `HYPERLIQUID_API_TESTNET` | Testnet API endpoint |
| `MAX_NONCE_AGE_SECONDS` | Maximum nonce age (3600s) |
| Error constants | `ERR_INVALID_NETWORK`, `ERR_INSUFFICIENT_AMOUNT`, etc. |

## Supported Networks

**V2 Networks** (CAIP-2 format):
- `hypercore:mainnet` - Hyperliquid Mainnet
- `hypercore:testnet` - Hyperliquid Testnet
- `hypercore:*` - Wildcard (all Hypercore networks)

**V1 Networks**: Not supported

## Asset Support

Default asset:
- USDH (Hyperliquid USD) - Default token
- Format: `USDH:0x54e00a5988577cb0b0c9ab0cb6ef7f4b`
- Decimals: 6

### Custom Asset Configuration

Facilitators can configure custom assets using money parsers:

```python
from x402.mechanisms.hypercore.exact import ExactHypercoreScheme
from x402.schemas import AssetAmount

server = ExactHypercoreScheme()

# Register custom money parser for specific amounts or conditions
def custom_parser(amount: float, network: str) -> AssetAmount | None:
    if amount > 1000:
        # Use a different token for large amounts
        return AssetAmount(
            amount=str(int(amount * 1e18)),
            asset="CUSTOM:0x...",
            extra={"name": "Custom Token", "decimals": 18}
        )
    return None  # Use default USDH

server.register_money_parser(custom_parser)

# Multiple parsers can be registered - tried in order
def test_parser(amount: float, network: str) -> AssetAmount | None:
    if network == "hypercore:testnet" and amount < 0.10:
        return AssetAmount(
            amount=str(int(amount * 1e6)),
            asset="TEST:0x...",
            extra={"name": "Test Token", "decimals": 6}
        )
    return None

server.register_money_parser(test_parser)
```

**Parser Chain Behavior:**
1. Custom parsers are tried in registration order
2. First parser that returns non-None wins
3. If all return None, default USDH asset is used
4. This matches the EVM mechanism pattern exactly

## Technical Details

### API-Based Settlement

Unlike EVM/SVM chains, Hypercore L1 uses API-based settlement:

1. Client creates EIP-712 signed `SendAsset` action
2. Facilitator verifies signature and parameters
3. Facilitator submits action to Hyperliquid API (`/exchange` endpoint)
4. Facilitator queries ledger (`/info` endpoint) for transaction hash
5. Settlement completes without on-chain transaction from facilitator

**Key advantage**: Stateless facilitator with no gas fees.

### EIP-712 SendAsset Action

The Exact scheme uses EIP-712 signed actions:

```python
{
    "type": "sendAsset",
    "hyperliquidChain": "Mainnet",  # or "Testnet"
    "signatureChainId": "0x3e7",    # 999 in hex
    "destination": "0x...",          # Recipient (payTo)
    "sourceDex": "spot",
    "destinationDex": "spot",
    "token": "USDH:0x...",           # Asset identifier
    "amount": "1.000000",            # USD string (6 decimals)
    "fromSubAccount": "",            # Empty for main account
    "nonce": 1706123456789,          # Timestamp in milliseconds
}
```

### EIP-712 Domain

```python
{
    "name": "HyperliquidSignTransaction",
    "version": "1",
    "chainId": 999,
    "verifyingContract": "0x0000000000000000000000000000000000000000",
}
```

### Nonce Format

Unlike EVM sequential nonces, Hypercore uses **timestamp-based nonces**:

- Format: `int(time.time() * 1000)` (milliseconds since epoch)
- Freshness check: Must be within 1 hour (configurable)
- Uniqueness: Millisecond precision prevents collisions

### Transaction Hash Retrieval

After settlement, facilitator queries the ledger for transaction hash:

1. Wait 1.5 seconds for indexing
2. Query `userNonFundingLedgerUpdates` for payer address
3. Match by nonce and destination
4. Return transaction hash
5. Retry up to 2 times with 1-second delay

### Signature Recovery

Facilitator recovers payer address from EIP-712 signature to query ledger:

```python
# Recover using eth-account
encoded_data = encode_typed_data(full_message=typed_data)
account = Account.recover_message(encoded_data, signature=sig_bytes)
```

## Error Handling

| Error Code | Description |
|------------|-------------|
| `invalid_network` | Network is not `hypercore:mainnet` or `hypercore:testnet` |
| `invalid_action_type` | Action type is not `sendAsset` |
| `destination_mismatch` | Destination doesn't match `payTo` |
| `insufficient_amount` | Amount is less than required |
| `token_mismatch` | Token doesn't match required asset |
| `nonce_too_old` | Nonce is more than 1 hour old |
| `invalid_signature_structure` | Signature is missing r, s, or v |
| `settlement_failed` | Hyperliquid API returned error |

## Differences from EVM/SVM

| Feature | EVM/SVM | Hypercore |
|---------|---------|-----------|
| **Settlement** | On-chain transaction | API submission |
| **Facilitator** | Needs wallet + gas | Stateless (no wallet) |
| **Nonce** | Sequential | Timestamp-based |
| **Signature** | EIP-3009 / SPL | EIP-712 SendAsset |
| **Confirmation** | Block inclusion | Ledger query |
| **Gas Fees** | Yes | No |

## Examples

### With Registration Helper

```python
from x402 import x402Facilitator
from x402.mechanisms.hypercore.exact import register_exact_hypercore_facilitator
from x402.mechanisms.hypercore import HYPERLIQUID_API_MAINNET

facilitator = x402Facilitator()
register_exact_hypercore_facilitator(
    facilitator,
    api_url=HYPERLIQUID_API_MAINNET,
    networks=["hypercore:mainnet"],
)
```

### Price Parsing

```python
from x402.mechanisms.hypercore.exact import ExactHypercoreServerScheme

server = ExactHypercoreServerScheme()

# Parse various price formats
asset_amount = await server.parse_price("$0.01", "hypercore:mainnet")
# Returns: {"amount": "10000", "asset": "USDH:0x54e00a5988577cb0b0c9ab0cb6ef7f4b"}
```

### Testing with Mock Signer

```python
class MockHyperliquidSigner:
    async def sign_send_asset(self, action):
        # Mock signature for testing
        return {
            "r": "0x" + "00" * 32,
            "s": "0x" + "00" * 32,
            "v": 27,
        }
```
