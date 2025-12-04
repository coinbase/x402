# Solana x402 Server Example

This example demonstrates how to create a FastAPI server that accepts x402 payments on Solana.

## Setup

1. Install dependencies:

```bash
uv sync
# or
pip install -r requirements.txt
```

2. Create a `.env` file with your Solana address:

```bash
SOLANA_ADDRESS=your_solana_address
PORT=4021
```

## Run

```bash
uv run main.py
# or
python main.py
```

The server will start on `http://localhost:4021`

## Endpoints

- `GET /` - Public endpoint (no payment required)
- `GET /protected-svm` - Protected endpoint requiring $0.001 USDC payment on Solana Devnet
- `GET /health` - Health check

## How it Works

1. Client makes a request to `/protected-svm`
2. Server responds with `402 Payment Required` and payment requirements
3. Client creates a Solana transaction with the required USDC amount
4. Client signs the transaction and sends it in the `X-PAYMENT` header
5. Server verifies the transaction with the facilitator
6. Facilitator signs as fee payer and submits to Solana
7. Server returns the protected content

## Payment Flow

```
Client -> Server: GET /protected-svm
Server -> Client: 402 with payment requirements
Client -> Client: Create & sign Solana transaction
Client -> Server: GET /protected-svm + X-PAYMENT header
Server -> Facilitator: Verify transaction
Facilitator -> Solana: Submit transaction
Server -> Client: 200 with content + X-PAYMENT-RESPONSE
```

## Environment Variables

- `SOLANA_ADDRESS`: Your Solana address to receive payments (required)
- `PORT`: Server port (default: 4021)
- `SVM_FEE_PAYER_ADDRESS`: Optional fee payer address (defaults to SOLANA_ADDRESS)

## Testing

You can test with curl:

```bash
# Get payment requirements
curl -i http://localhost:4021/protected-svm

# Response will be 402 with payment requirements in JSON
```

Or use the Python client example from `examples/python/clients/solana/`
