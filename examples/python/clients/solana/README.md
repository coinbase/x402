# Solana x402 Client Example

This example demonstrates how to use the x402 Python SDK to make payments on Solana.

## Setup

1. Install dependencies:

```bash
uv sync
# or
pip install -r requirements.txt
```

2. Create a `.env` file with your Solana private key:

```bash
SOLANA_PRIVATE_KEY=your_base58_private_key
SERVER_URL=http://localhost:4021
```

3. Fund your Solana address with:
   - Devnet SOL (for transaction fees): https://faucet.solana.com/
   - Devnet USDC: Use a Solana devnet faucet or transfer from another wallet

## Run

```bash
uv run main.py
# or
python main.py
```

## How it Works

1. Loads Solana keypair from environment variable
2. Creates an httpx client with x402 payment hooks
3. Makes a request to a protected endpoint
4. x402 automatically:
   - Detects 402 Payment Required response
   - Creates and signs a Solana transaction
   - Retries the request with payment header
   - Receives and displays the response

## Token Support

This example uses USDC on Solana Devnet:

- Mint: `4zMMC9srt5Ri5X14GAgXhaHii3GnPAEERYPJgZJDncDU`
- Decimals: 6

## Generating a Keypair

You can generate a new Solana keypair using:

```python
from x402.svm import generate_keypair
import base58

keypair = generate_keypair()
print(f"Address: {keypair.address}")
print(f"Private Key (base58): {base58.b58encode(bytes(keypair.keypair)).decode()}")
```
