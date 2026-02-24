"""x402 Python Facilitator for E2E Testing.

FastAPI-based facilitator service that verifies and settles payments
on-chain for the x402 protocol.

Supports:
- EVM networks (Base Sepolia) via web3.py
- SVM networks (Solana Devnet) via solders
- Bazaar discovery extension for resource cataloging
- V1 and V2 protocol versions

Run with: uv run uvicorn main:app --port 4022
"""

import os
import sys
from typing import Any

from dotenv import load_dotenv
from fastapi import FastAPI, HTTPException
from pydantic import BaseModel
from solders.keypair import Keypair

from x402 import x402Facilitator
from x402.extensions.bazaar import extract_discovery_info
from x402.mechanisms.evm import FacilitatorWeb3Signer
from x402.mechanisms.evm.exact import register_exact_evm_facilitator
from x402.mechanisms.svm import FacilitatorKeypairSigner
from x402.mechanisms.svm.exact import register_exact_svm_facilitator

from bazaar import BazaarCatalog

# Load environment variables
load_dotenv()

# Configuration
PORT = int(os.environ.get("PORT", "4022"))

# Initialize bazaar catalog
bazaar_catalog = BazaarCatalog()

# Validate required environment variables
if not os.environ.get("EVM_PRIVATE_KEY"):
    print("❌ EVM_PRIVATE_KEY environment variable is required")
    sys.exit(1)

if not os.environ.get("SVM_PRIVATE_KEY"):
    print("❌ SVM_PRIVATE_KEY environment variable is required")
    sys.exit(1)

# Initialize the EVM signer from private key
evm_rpc_url = os.environ.get("EVM_RPC_URL") or "https://sepolia.base.org"
evm_signer = FacilitatorWeb3Signer(
    private_key=os.environ["EVM_PRIVATE_KEY"],
    rpc_url=evm_rpc_url,
)
print(f"EVM Facilitator account: {evm_signer.get_addresses()[0]}")

# Initialize the SVM signer from private key
svm_keypair = Keypair.from_base58_string(os.environ["SVM_PRIVATE_KEY"])
svm_signer = FacilitatorKeypairSigner(svm_keypair)
print(f"SVM Facilitator account: {svm_signer.get_addresses()[0]}")


def _handle_after_verify(ctx: Any) -> None:
    """Handle after verify hook - extract discovery info and catalog."""
    print("✅ Payment verified")

    # Extract discovered resource from payment for bazaar catalog
    try:
        discovered = extract_discovery_info(
            ctx.payment_payload,
            ctx.requirements,
            validate=True,
        )

        if discovered:
            print(f"   📝 Discovered resource: {discovered.resource_url}")
            print(f"   📝 Method: {discovered.method}")
            print(f"   📝 X402Version: {discovered.x402_version}")

            # Convert discovery_info to dict for serialization
            discovery_info_dict = None
            if discovered.discovery_info:
                if hasattr(discovered.discovery_info, "model_dump"):
                    discovery_info_dict = discovered.discovery_info.model_dump(
                        by_alias=True, exclude_none=True
                    )
                else:
                    discovery_info_dict = discovered.discovery_info

            bazaar_catalog.catalog_resource(
                resource_url=discovered.resource_url,
                method=discovered.method,
                x402_version=discovered.x402_version,
                discovery_info=discovery_info_dict,
                payment_requirements=ctx.requirements.model_dump(by_alias=True)
                if hasattr(ctx.requirements, "model_dump")
                else ctx.requirements,
            )
            print("   ✅ Added to bazaar catalog")
    except Exception as err:
        print(f"   ⚠️  Failed to extract discovery info: {err}")


# Initialize the x402 Facilitator with EVM and SVM support
facilitator = (
    x402Facilitator()
    .on_before_verify(lambda ctx: print("Before verify", ctx))
    .on_after_verify(lambda ctx: _handle_after_verify(ctx))
    .on_verify_failure(lambda ctx: print("Verify failure", ctx))
    .on_before_settle(lambda ctx: print("Before settle", ctx))
    .on_after_settle(lambda ctx: print(f"🎉 Payment settled: {ctx.result.transaction}"))
    .on_settle_failure(lambda ctx: print("Settle failure", ctx))
)

# Register EVM schemes (V1 and V2)
register_exact_evm_facilitator(
    facilitator,
    evm_signer,
    networks="eip155:84532",  # Base Sepolia
    deploy_erc4337_with_eip6492=True,
)

# Register SVM schemes (V1 and V2)
register_exact_svm_facilitator(
    facilitator,
    svm_signer,
    networks="solana:EtWTRABZaYq6iMfeYKouRu166VU2xqa1",  # Devnet
)


# Pydantic models for request/response
class VerifyRequest(BaseModel):
    """Verify endpoint request body."""

    paymentPayload: dict
    paymentRequirements: dict


class SettleRequest(BaseModel):
    """Settle endpoint request body."""

    paymentPayload: dict
    paymentRequirements: dict


# Initialize FastAPI app
app = FastAPI(
    title="x402 Python Facilitator (E2E)",
    description="Verifies and settles x402 payments on-chain for e2e testing",
    version="2.0.0",
)


@app.post("/verify")
async def verify(request: VerifyRequest):
    """Verify a payment against requirements.

    Note: Payment tracking and bazaar discovery are handled by lifecycle hooks.

    Args:
        request: Payment payload and requirements to verify.

    Returns:
        VerifyResponse with isValid and payer (if valid) or invalidReason.
    """
    try:
        from x402.schemas import parse_payment_payload, parse_payment_requirements

        # Parse payload (auto-detects V1/V2) and requirements (based on payload version)
        payload = parse_payment_payload(request.paymentPayload)
        requirements = parse_payment_requirements(
            payload.x402_version, request.paymentRequirements
        )

        # Hooks will automatically:
        # - Track verified payment (on_after_verify)
        # - Extract and catalog discovery info (on_after_verify)
        response = await facilitator.verify(payload, requirements)

        return {
            "isValid": response.is_valid,
            "payer": response.payer,
            "invalidReason": response.invalid_reason,
        }
    except Exception as e:
        print(f"Verify error: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@app.post("/settle")
async def settle(request: SettleRequest):
    """Settle a payment on-chain.

    Note: Verification validation and cleanup are handled by lifecycle hooks.

    Args:
        request: Payment payload and requirements to settle.

    Returns:
        SettleResponse with success, transaction, network, and payer.
    """
    try:
        from x402.schemas import parse_payment_payload, parse_payment_requirements

        # Parse payload (auto-detects V1/V2) and requirements (based on payload version)
        payload = parse_payment_payload(request.paymentPayload)
        requirements = parse_payment_requirements(
            payload.x402_version, request.paymentRequirements
        )

        # Hooks will automatically:
        # - Validate payment was verified (on_before_settle - will abort if not)
        # - Check verification timeout (on_before_settle)
        # - Clean up tracking (on_after_settle / on_settle_failure)
        response = await facilitator.settle(payload, requirements)

        return {
            "success": response.success,
            "transaction": response.transaction,
            "network": response.network,
            "payer": response.payer,
            "errorReason": response.error_reason,
        }
    except Exception as e:
        print(f"Settle error: {e}")

        # Check if this was an abort from hook
        if "aborted" in str(e).lower() or "Settlement aborted" in str(e):
            # Return a proper SettleResponse instead of 500 error
            return {
                "success": False,
                "errorReason": str(e).replace("Settlement aborted: ", ""),
                "network": request.paymentPayload.get("accepted", {}).get(
                    "network", "unknown"
                ),
                "transaction": "",
                "payer": None,
            }

        raise HTTPException(status_code=500, detail=str(e))


@app.get("/supported")
async def supported():
    """Get supported payment kinds and extensions.

    Returns:
        SupportedResponse with kinds, extensions, and signers.
    """
    try:
        response = facilitator.get_supported()

        return {
            "kinds": [
                {
                    "x402Version": k.x402_version,
                    "scheme": k.scheme,
                    "network": k.network,
                    "extra": k.extra,
                }
                for k in response.kinds
            ],
            "extensions": response.extensions,
            "signers": response.signers,
        }
    except Exception as e:
        print(f"Supported error: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@app.get("/discovery/resources")
async def discovery_resources(limit: int = 100, offset: int = 0):
    """List all discovered resources from bazaar.

    Returns:
        Discovery response with x402Version, items, and pagination.
    """
    try:
        return bazaar_catalog.get_resources(limit, offset)
    except Exception as e:
        print(f"Discovery error: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@app.get("/health")
async def health():
    """Health check endpoint."""
    return {
        "status": "ok",
        "network": "eip155:84532",
        "facilitator": "python",
        "version": "2.0.0",
        "extensions": ["bazaar"],
        "discoveredResources": bazaar_catalog.get_count(),
    }


@app.post("/close")
async def close():
    """Graceful shutdown endpoint."""
    import asyncio

    print("Received shutdown request")

    async def shutdown():
        await asyncio.sleep(0.1)
        os._exit(0)

    asyncio.create_task(shutdown())
    return {"message": "Facilitator shutting down gracefully"}


if __name__ == "__main__":
    import uvicorn

    print(f"""
╔════════════════════════════════════════════════════════╗
║           x402 Python Facilitator (E2E)                ║
╠════════════════════════════════════════════════════════╣
║  Server:     http://localhost:{PORT}                       ║
║  Network:    eip155:84532                              ║
║  Address:    {evm_signer.get_addresses()[0]}  ║
║  Extensions: bazaar                                    ║
║                                                        ║
║  Endpoints:                                            ║
║  • POST /verify              (verify payment)          ║
║  • POST /settle              (settle payment)          ║
║  • GET  /supported           (get supported kinds)     ║
║  • GET  /discovery/resources (list discovered)         ║
║  • GET  /health              (health check)            ║
║  • POST /close               (shutdown server)         ║
╚════════════════════════════════════════════════════════╝
    """)

    # Log that facilitator is ready (needed for e2e test discovery)
    print("Facilitator listening")

    uvicorn.run(app, host="0.0.0.0", port=PORT, log_level="warning")
