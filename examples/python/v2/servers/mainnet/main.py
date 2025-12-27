import os
from datetime import UTC, datetime

import uvicorn
from dotenv import load_dotenv
from fastapi import FastAPI
from x402 import x402ResourceServer
from x402.http import HTTPFacilitatorClient
from x402.http.middleware.fastapi import payment_middleware
from x402.mechanisms.evm.exact import ExactEvmServerScheme

# Import our helper to connect with the Coinbase Facilitator (CDP)
from cdp_facilitator import create_facilitator_config

# Load environment variables from .env
load_dotenv()

# Initialize FastAPI app
app = FastAPI()

# The Ethereum address where you want to receive USDC payments (Base Mainnet)
ADDRESS = os.getenv("ADDRESS")

if not ADDRESS:
    raise ValueError("The ADDRESS variable is not set in your .env file")

# Set up the Facilitator connection.
# This requires your CDP credentials from the .env file to process Mainnet payments.
facilitator_config = create_facilitator_config()
facilitator_client = HTTPFacilitatorClient(facilitator_config)

# The Resource Server is the brain of x402 on the backend.
# It handles verifying that all incoming payments are valid.
server = x402ResourceServer(facilitator_client)

# Register support for 'exact' payments (EIP-3009) specifically on Base Mainnet
server.register("eip155:8453", ExactEvmServerScheme())

# Initialize the resource server
server.initialize()

# Define protected routes and their pricing here.
# For this example, we're protecting '/protected' for a symbolic 1 cent.
routes = {
    "GET /protected": {
        "accepts": {
            "scheme": "exact",
            "payTo": ADDRESS,
            "price": "$0.01",
            "network": "eip155:8453",
        }
    },
}


# This middleware intercepts requests to the routes defined above.
# If a valid payment isn't detected, it automatically responds with a 402 error
# and provides instructions on how the client should pay.
@app.middleware("http")
async def x402_payment_middleware(request, call_next):
    return await payment_middleware(routes, server)(request, call_next)


@app.get("/protected")
async def protected_route():
    return {
        "message": "Access granted! Welcome to the premium content.",
        "timestamp": datetime.now(UTC).isoformat().replace("+00:00", "Z"),
    }


if __name__ == "__main__":
    uvicorn.run(app, host="0.0.0.0", port=4021)
