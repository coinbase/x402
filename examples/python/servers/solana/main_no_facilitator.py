"""Example x402 FastAPI server for Solana payments WITHOUT facilitator.

In this mode:
- Client creates and fully signs the transaction (No facilitator needed as both token owner and fee payer)
- Server validates the transaction locally (no remote facilitator)
- Server submits the signed transaction to Solana
"""

import os
import base64
import json
from fastapi import FastAPI, Request
from fastapi.responses import JSONResponse
from dotenv import load_dotenv

from x402.common import process_price_to_atomic_amount, x402_VERSION
from x402.encoding import safe_base64_decode
from x402.types import (
    PaymentPayload,
    PaymentRequirements,
    x402PaymentRequiredResponse,
)
from x402.svm.transaction import decode_transaction
from solana.rpc.api import Client
from solana.rpc.types import TxOpts
from solana.rpc.commitment import Confirmed

load_dotenv()

app = FastAPI(title="x402 Solana Payment Example (No Facilitator)")

# Server configuration
PAY_TO_ADDRESS = os.getenv("PAY_TO_ADDRESS")
CLIENT_ADDRESS = os.getenv("CLIENT_ADDRESS")

if not PAY_TO_ADDRESS:
    raise ValueError("PAY_TO_ADDRESS environment variable must be set")
if not CLIENT_ADDRESS:
    raise ValueError("CLIENT_ADDRESS environment variable must be set")

# Solana RPC client
solana_client = Client("https://api.devnet.solana.com")


@app.get("/")
async def root():
    """Public endpoint - no payment required."""
    return {
        "message": "x402 Solana Payment Server (No Facilitator)",
        "endpoints": {
            "/": "Public - no payment",
            "/protected-svm": "Protected - requires $0.001 USDC payment on Solana Devnet",
        },
    }


@app.get("/protected-svm")
async def protected_svm_endpoint(request: Request):
    """Protected endpoint requiring Solana payment."""

    payment_header = request.headers.get("X-PAYMENT", "")

    # If no payment, return 402
    if not payment_header:
        max_amount_required, asset_address, _ = process_price_to_atomic_amount(
            "$0.001", "solana-devnet"
        )

        payment_requirements = PaymentRequirements(
            scheme="exact",
            network="solana-devnet",
            asset=asset_address,
            max_amount_required=max_amount_required,
            resource=str(request.url),
            description="Access to premium content on Solana",
            mime_type="",
            pay_to=PAY_TO_ADDRESS,
            max_timeout_seconds=60,
            output_schema={
                "input": {"type": "http", "method": "GET", "discoverable": True},
                "output": None,
            },
            # Client will be the fee payer
            extra={"feePayer": CLIENT_ADDRESS},
        )

        response_data = x402PaymentRequiredResponse(
            x402_version=x402_VERSION,
            accepts=[payment_requirements],
            error="No X-PAYMENT header provided",
        ).model_dump(by_alias=True)

        return JSONResponse(content=response_data, status_code=402)

    # Decode payment
    try:
        payment_dict = json.loads(safe_base64_decode(payment_header))
        payment = PaymentPayload(**payment_dict)
    except Exception as e:
        print(f"❌ Invalid payment: {e}")
        return JSONResponse(
            content={"error": "Invalid payment header"}, status_code=400
        )

    # Validate payment
    if payment.network != "solana-devnet" or payment.scheme != "exact":
        return JSONResponse(
            content={"error": "Invalid network or scheme"}, status_code=400
        )

    # Decode transaction
    try:
        # payment.payload is an ExactSvmPaymentPayload object
        tx = decode_transaction(payment.payload.transaction)

        print(f"\n📋 Received payment transaction:")
        print(f"   Instructions: {len(tx.message.instructions)}")
        print(f"   Fee payer: {tx.message.account_keys[0]}")

        # Validate structure
        if len(tx.message.instructions) != 3:
            return JSONResponse(
                content={"error": f"Invalid transaction: expected 3 instructions"},
                status_code=400,
            )

        # Check signatures
        valid_sigs = sum(1 for sig in tx.signatures if not all(b == 0 for b in bytes(sig)))
        if valid_sigs == 0:
            return JSONResponse(
                content={"error": "Transaction not signed"}, status_code=400
            )

        print(f"   Signatures: {valid_sigs}")
        print(f"✅ Transaction validated locally")

    except Exception as e:
        print(f"❌ Validation error: {e}")
        return JSONResponse(
            content={"error": f"Invalid transaction: {str(e)}"}, status_code=400
        )

    # Submit transaction to blockchain
    try:
        print(f"\n🚀 Submitting to Solana devnet...")

        result = solana_client.send_transaction(
            tx, opts=TxOpts(skip_preflight=True, preflight_commitment=Confirmed)
        )

        signature = str(result.value)
        explorer_url = f"https://explorer.solana.com/tx/{signature}?cluster=devnet"

        print(f"✅ Transaction submitted!")
        print(f"   Signature: {signature}")
        print(f"   Explorer: {explorer_url}")

        # Create settlement response
        settlement = {
            "success": True,
            "transaction": signature,
            "network": "solana-devnet",
            "payer": str(tx.message.account_keys[0]),
        }

        settlement_header = base64.b64encode(
            json.dumps(settlement).encode("utf-8")
        ).decode("utf-8")

        return JSONResponse(
            content={
                "message": "Successfully accessed protected Solana endpoint!",
                "content": "This is premium content accessible via x402 payment on Solana",
                "payment": {
                    "network": "solana-devnet",
                    "amount": "0.001 USDC",
                    "transaction": signature,
                    "explorer": explorer_url,
                },
            },
            headers={"X-PAYMENT-RESPONSE": settlement_header},
        )

    except Exception as e:
        print(f"❌ Submission error: {e}")
        import traceback
        traceback.print_exc()
        return JSONResponse(
            content={"error": f"Failed to submit transaction: {str(e)}"},
            status_code=500,
        )


@app.get("/health")
async def health():
    return {"status": "healthy"}


if __name__ == "__main__":
    import uvicorn

    port = int(os.getenv("PORT", "4021"))
    print(f"\n🌐 Starting server on http://localhost:{port}")
    print(f"📝 No facilitator - transactions submitted directly to Solana\n")
    uvicorn.run(app, host="0.0.0.0", port=port)
