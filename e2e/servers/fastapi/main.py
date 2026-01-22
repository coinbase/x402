"""FastAPI e2e test server using x402 v2 SDK."""

import os
import signal
import sys
import asyncio
from typing import Any, Dict

from dotenv import load_dotenv
from fastapi import FastAPI, HTTPException
from fastapi.responses import JSONResponse

# Import from new x402 package
from x402 import x402ResourceServer
from x402.http import FacilitatorConfig, HTTPFacilitatorClient
from x402.http.middleware.fastapi import payment_middleware
from x402.mechanisms.evm.exact import (
    ExactEvmServerScheme,
    register_exact_evm_server,
)
from x402.mechanisms.svm.exact import register_exact_svm_server
from x402.extensions.bazaar import (
    bazaar_resource_server_extension,
    declare_discovery_extension,
    OutputConfig,
)

# Load environment variables
load_dotenv()

# Get configuration from environment
EVM_ADDRESS = os.getenv("EVM_PAYEE_ADDRESS")
SVM_ADDRESS = os.getenv("SVM_PAYEE_ADDRESS")
PORT = int(os.getenv("PORT", "4021"))
FACILITATOR_URL = os.getenv("FACILITATOR_URL")

if not EVM_ADDRESS:
    print("Error: Missing required environment variable EVM_PAYEE_ADDRESS")
    sys.exit(1)

if not SVM_ADDRESS:
    print("Error: Missing required environment variable SVM_PAYEE_ADDRESS")
    sys.exit(1)

# Network configurations (CAIP-2 format)
EVM_NETWORK = "eip155:84532"  # Base Sepolia
SVM_NETWORK = "solana:EtWTRABZaYq6iMfeYKouRu166VU2xqa1"  # Solana Devnet

app = FastAPI()

# Create HTTP facilitator client
if FACILITATOR_URL:
    print(f"Using remote facilitator at: {FACILITATOR_URL}")
    config = FacilitatorConfig(url=FACILITATOR_URL)
    facilitator = HTTPFacilitatorClient(config)
else:
    print("Using default facilitator")
    facilitator = HTTPFacilitatorClient()

# Create resource server
server = x402ResourceServer(facilitator)

# Register EVM and SVM exact schemes
register_exact_evm_server(server, EVM_NETWORK)
register_exact_svm_server(server, SVM_NETWORK)

# Register Bazaar discovery extension
server.register_extension(bazaar_resource_server_extension)

# Define routes with payment requirements
routes = {
    "GET /protected": {
        "accepts": {
            "scheme": "exact",
            "payTo": EVM_ADDRESS,
            "price": "$0.001",
            "network": EVM_NETWORK,
        },
        "extensions": {
            **declare_discovery_extension(
                output=OutputConfig(
                    example={
                        "message": "Access granted to protected resource",
                        "timestamp": "2024-01-01T00:00:00Z",
                    },
                    schema={
                        "properties": {
                            "message": {"type": "string"},
                            "timestamp": {"type": "string"},
                        },
                        "required": ["message", "timestamp"],
                    },
                )
            ),
        },
    },
    "GET /protected-2": {
        "accepts": {
            "scheme": "exact",
            "payTo": EVM_ADDRESS,
            "price": "$0.001",  # 0.001 USDC
            "network": EVM_NETWORK,
        },
        "extensions": {
            **declare_discovery_extension(
                output=OutputConfig(
                    example={
                        "message": "Access granted to protected resource #2",
                        "timestamp": "2024-01-01T00:00:00Z",
                    },
                    schema={
                        "properties": {
                            "message": {"type": "string"},
                            "timestamp": {"type": "string"},
                        },
                        "required": ["message", "timestamp"],
                    },
                )
            ),
        },
    },
    "GET /protected-svm": {
        "accepts": {
            "scheme": "exact",
            "payTo": SVM_ADDRESS,
            "price": "$0.001",
            "network": SVM_NETWORK,
        },
        "extensions": {
            **declare_discovery_extension(
                output=OutputConfig(
                    example={
                        "message": "Access granted to SVM protected resource",
                        "timestamp": "2024-01-01T00:00:00Z",
                    },
                    schema={
                        "properties": {
                            "message": {"type": "string"},
                            "timestamp": {"type": "string"},
                        },
                        "required": ["message", "timestamp"],
                    },
                )
            ),
        },
    },
}


# Apply payment middleware
@app.middleware("http")
async def x402_payment_middleware(request, call_next):
    return await payment_middleware(routes, server)(request, call_next)


# Global flag to track if server should accept new requests
shutdown_requested = False


@app.get("/protected")
async def protected_endpoint() -> Dict[str, Any]:
    """Protected endpoint that requires payment."""
    if shutdown_requested:
        raise HTTPException(status_code=503, detail="Server shutting down")

    return {
        "message": "Access granted to protected resource",
        "timestamp": "2024-01-01T00:00:00Z",
    }


@app.get("/protected-2")
async def protected_endpoint_2() -> Dict[str, Any]:
    """Protected endpoint that requires ERC20 payment."""
    if shutdown_requested:
        raise HTTPException(status_code=503, detail="Server shutting down")

    return {
        "message": "Access granted to protected resource #2",
        "timestamp": "2024-01-01T00:00:00Z",
    }


@app.get("/protected-svm")
async def protected_svm_endpoint() -> Dict[str, Any]:
    """Protected endpoint that requires SVM (Solana) payment."""
    if shutdown_requested:
        raise HTTPException(status_code=503, detail="Server shutting down")

    return {
        "message": "Access granted to SVM protected resource",
        "timestamp": "2024-01-01T00:00:00Z",
    }


@app.get("/health")
async def health_check() -> Dict[str, Any]:
    """Health check endpoint."""
    return {
        "status": "healthy",
        "timestamp": "2024-01-01T00:00:00Z",
        "server": "fastapi",
    }


@app.post("/close")
async def close_server() -> Dict[str, Any]:
    """Graceful shutdown endpoint."""
    global shutdown_requested
    shutdown_requested = True

    # Schedule server shutdown after response
    async def delayed_shutdown():
        await asyncio.sleep(0.1)
        os.kill(os.getpid(), signal.SIGTERM)

    asyncio.create_task(delayed_shutdown())

    return {
        "message": "Server shutting down gracefully",
        "timestamp": "2024-01-01T00:00:00Z",
    }


def signal_handler(signum, frame):
    """Handle shutdown signals gracefully."""
    print("Received shutdown signal, exiting...")
    sys.exit(0)


if __name__ == "__main__":
    # Set up signal handlers for graceful shutdown
    signal.signal(signal.SIGTERM, signal_handler)
    signal.signal(signal.SIGINT, signal_handler)

    import uvicorn

    print(f"Starting FastAPI server on port {PORT}")
    print(f"EVM address: {EVM_ADDRESS}")
    print(f"SVM address: {SVM_ADDRESS}")
    print(f"EVM Network: {EVM_NETWORK}")
    print(f"SVM Network: {SVM_NETWORK}")
    print(f"Using facilitator: {FACILITATOR_URL}")
    print("Server listening on port", PORT)

    uvicorn.run(app, host="0.0.0.0", port=PORT, log_level="warning")
