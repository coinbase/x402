# x402 SVM Mechanism

Solana implementation of the x402 payment protocol using the **Exact** payment scheme with SPL Token transfers.

## Installation

```bash
uv add x402[svm]
```

## Overview

Three components for handling x402 payments on Solana:

- **Client** (`ExactSvmClientScheme`) - Creates signed token transfer transactions
- **Server** (`ExactSvmServerScheme`) - Builds payment requirements, parses prices
- **Facilitator** (`ExactSvmFacilitatorScheme`) - Verifies transactions, completes and submits

## Quick Start

### Client

```python
from x402 import x402Client
from x402.mechanisms.svm.exact import ExactSvmScheme
from x402.mechanisms.svm import KeypairSigner
from solders.keypair import Keypair

keypair = Keypair.from_base58_string("...")
signer = KeypairSigner(keypair)

client = x402Client()
client.register("solana:*", ExactSvmScheme(signer=signer))

payload = await client.create_payment_payload(payment_required)
```

### Server

```python
from x402 import x402ResourceServer
from x402.mechanisms.svm.exact import ExactSvmServerScheme

server = x402ResourceServer(facilitator_client)
server.register("solana:*", ExactSvmServerScheme())
```

### Facilitator

```python
from x402 import x402Facilitator
from x402.mechanisms.svm.exact import ExactSvmFacilitatorScheme
from x402.mechanisms.svm import FacilitatorKeypairSigner

signer = FacilitatorKeypairSigner(keypair, rpc_client)

facilitator = x402Facilitator()
facilitator.register(
    ["solana:5eykt4UsFv8P8NJdTREpY1vzqKqZKvdp"],  # Mainnet
    ExactSvmFacilitatorScheme(wallet=signer),
)
```

## Exports

### `x402.mechanisms.svm.exact`

| Export | Description |
|--------|-------------|
| `ExactSvmScheme` | Client scheme (alias for `ExactSvmClientScheme`) |
| `ExactSvmClientScheme` | Client-side transaction creation |
| `ExactSvmServerScheme` | Server-side requirement building |
| `ExactSvmFacilitatorScheme` | Facilitator verification/settlement |
| `register_exact_svm_client()` | Helper to register client |
| `register_exact_svm_server()` | Helper to register server |
| `register_exact_svm_facilitator()` | Helper to register facilitator |

### `x402.mechanisms.svm`

| Export | Description |
|--------|-------------|
| `ClientSvmSigner` | Protocol for client signers |
| `FacilitatorSvmSigner` | Protocol for facilitator signers |
| `KeypairSigner` | Client signer using Solana keypair |
| `FacilitatorKeypairSigner` | Facilitator signer with RPC client |
| `NETWORK_CONFIGS` | Network configuration mapping |
| `V1_NETWORKS` | List of V1 network names |

## Supported Networks

**V2 Networks** (CAIP-2 format):
- `solana:5eykt4UsFv8P8NJdTREpY1vzqKqZKvdp` - Mainnet Beta
- `solana:EtWTRABZaYq6iMfeYKouRu166VU2xqa1` - Devnet
- `solana:4uhcVJyU9pJkvQyS88uRDiswHXSCkY3z` - Testnet
- `solana:*` - Wildcard (all Solana networks)

**V1 Networks** (legacy names):
- `solana` - Mainnet
- `solana-devnet` - Devnet
- `solana-testnet` - Testnet

## Asset Support

Supports SPL Token and Token-2022:
- USDC (primary)
- Any SPL token with associated token accounts
- Automatic token program detection (Token vs Token-2022)

## Technical Details

### Transaction Structure

The Exact scheme creates a partially-signed transaction:

1. Compute budget instructions (unit limit + price)
2. SPL Token `TransferChecked` instruction
3. Client signs payer portion
4. Facilitator completes signature and submits

### Associated Token Accounts

Automatic ATA derivation for source and destination addresses.

