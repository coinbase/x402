import os
from typing import Any, Dict

from cdp.x402 import create_facilitator_config
from dotenv import load_dotenv
from fastapi import FastAPI
from x402.fastapi.middleware import require_payment

# Load environment variables
load_dotenv()


# Get configuration from environment
NETWORK = os.getenv("NETWORK", "base-sepolia")
ADDRESS = os.getenv("ADDRESS")
CDP_API_KEY_ID = os.getenv("CDP_API_KEY_ID")
CDP_API_KEY_SECRET = os.getenv("CDP_API_KEY_SECRET")

if not ADDRESS or not CDP_API_KEY_ID or not CDP_API_KEY_SECRET:
    raise ValueError("Missing required environment variables")

app = FastAPI()
facilitator_config = create_facilitator_config(CDP_API_KEY_ID, CDP_API_KEY_SECRET)

# Apply payment middleware to specific routes
app.middleware("http")(
    require_payment(
        price="$0.001",
        pay_to_address=ADDRESS,
        path="/weather",
        network=NETWORK,
        facilitator_config=facilitator_config,
    )
)

# Apply payment middleware to premium routes
app.middleware("http")(
    require_payment(
        price="$0.01",
        pay_to_address=ADDRESS,
        path="/premium/*",
        network=NETWORK,
        facilitator_config=facilitator_config,
    )
)


@app.get("/weather")
async def get_weather() -> Dict[str, Any]:
    return {
        "report": {
            "weather": "sunny",
            "temperature": 70,
        }
    }


@app.get("/premium/content")
async def get_premium_content() -> Dict[str, Any]:
    return {
        "content": "This is premium content",
    }


if __name__ == "__main__":
    import uvicorn

    uvicorn.run(app, host="0.0.0.0", port=4021)
