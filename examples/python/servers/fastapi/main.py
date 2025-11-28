import os
from typing import Any, Dict

from dotenv import load_dotenv
from fastapi import FastAPI, Request
from fastapi.responses import JSONResponse
from slowapi import Limiter
from slowapi.util import get_remote_address
from slowapi.errors import RateLimitExceeded
from x402.fastapi.middleware import require_payment
from x402.types import EIP712Domain, TokenAmount, TokenAsset

# Load environment variables
load_dotenv()

# Get configuration from environment
ADDRESS = os.getenv("ADDRESS")

if not ADDRESS:
    raise ValueError("Missing required environment variables")

# Initialize rate limiter
limiter = Limiter(key_func=get_remote_address)

app = FastAPI()
app.state.limiter = limiter

@app.exception_handler(RateLimitExceeded)
async def rate_limit_exceeded_handler(request: Request, exc: RateLimitExceeded) -> JSONResponse:
    return JSONResponse(status_code=429, content={"error": "Rate limit exceeded"})

# Apply payment middleware to specific routes
app.middleware("http")(
    require_payment(
        path="/weather",
        price="$0.001",
        pay_to_address=ADDRESS,
        network="base-sepolia",
    )
)

# Apply payment middleware to premium routes
app.middleware("http")(
    require_payment(
        path="/premium/*",
        price=TokenAmount(
            amount="10000",
            asset=TokenAsset(
                address="0x036CbD53842c5426634e7929541eC2318f3dCF7e",
                decimals=6,
                eip712=EIP712Domain(name="USDC", version="2"),
            ),
        ),
        pay_to_address=ADDRESS,
        network="base-sepolia",
    )
)


@app.get("/weather")
@limiter.limit("10/minute")
async def get_weather(request) -> Dict[str, Any]:
    return {
        "report": {
            "weather": "sunny",
            "temperature": 70,
        }
    }


@app.get("/premium/content")
@limiter.limit("5/minute")
async def get_premium_content(request) -> Dict[str, Any]:
    return {
        "content": "This is premium content",
    }


if __name__ == "__main__":
    import uvicorn

    uvicorn.run(app, host="0.0.0.0", port=4021)
