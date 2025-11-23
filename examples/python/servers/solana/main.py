"""Example x402 FastAPI server for Solana payments."""

import os
from fastapi import FastAPI, Request
from fastapi.responses import JSONResponse
from x402.fastapi import require_payment
from dotenv import load_dotenv

load_dotenv()

app = FastAPI(title="x402 Solana Payment Example")

# Get Solana address from environment
SOLANA_ADDRESS = os.getenv("SOLANA_ADDRESS")
if not SOLANA_ADDRESS:
    raise ValueError("SOLANA_ADDRESS environment variable must be set")

print(f"Server receiving payments at: {SOLANA_ADDRESS}")


@app.get("/")
async def root():
    """Public endpoint - no payment required."""
    return {
        "message": "x402 Solana Payment Server",
        "endpoints": {
            "/": "Public - no payment",
            "/protected-svm": "Protected - requires $0.001 USDC payment on Solana Devnet",
        },
    }


@app.get("/protected-svm")
@require_payment(
    price="$0.001",  # $0.001 USDC
    pay_to_address=SOLANA_ADDRESS,
    network="solana-devnet",
    description="Access to premium content on Solana",
    path="/protected-svm",
)
async def protected_svm_endpoint(request: Request):
    """Protected endpoint requiring Solana payment."""
    return {
        "message": "Successfully accessed protected Solana endpoint!",
        "content": "This is premium content accessible via x402 payment on Solana",
        "payment": {
            "network": "solana-devnet",
            "amount": "0.001 USDC",
        },
    }


@app.get("/health")
async def health():
    """Health check endpoint."""
    return {"status": "healthy"}


if __name__ == "__main__":
    import uvicorn

    port = int(os.getenv("PORT", "4021"))
    print(f"Starting server on http://localhost:{port}")
    uvicorn.run(app, host="0.0.0.0", port=port)

