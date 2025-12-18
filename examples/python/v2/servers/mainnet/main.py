import os
from typing import Any, Dict

import uvicorn
from cdp.x402 import create_facilitator_config
from dotenv import load_dotenv
from fastapi import FastAPI
from x402.fastapi import require_payment

# Load environment variables
load_dotenv()

# Get configuration from environment
# For Mainnet, we strictly use eip155:8453
NETWORK = "eip155:8453"
# You can also use "eip155:84532" (Base Sepolia) with facilitator if desired
ADDRESS = os.getenv("ADDRESS")
CDP_API_KEY_ID = os.getenv("CDP_API_KEY_ID")
CDP_API_KEY_SECRET = os.getenv("CDP_API_KEY_SECRET")

if not ADDRESS or not CDP_API_KEY_ID or not CDP_API_KEY_SECRET:
    raise ValueError(
        "Missing required environment variables (ADDRESS, CDP_API_KEY_ID, CDP_API_KEY_SECRET)"
    )

app = FastAPI()
facilitator_config = create_facilitator_config(CDP_API_KEY_ID, CDP_API_KEY_SECRET)

# Apply V2 payment middleware
app.middleware("http")(
    require_payment(
        path="/weather",
        price="$0.001",
        pay_to_address=ADDRESS,
        network=NETWORK,
        description="Real-time Weather Data (Mainnet)",
        mime_type="application/json",
        facilitator_config=facilitator_config,
    )
)

# Apply V2 payment middleware to premium routes
app.middleware("http")(
    require_payment(
        path="/premium/*",
        price="$0.01",
        pay_to_address=ADDRESS,
        network=NETWORK,
        description="Premium Mainnet Content",
        mime_type="application/json",
        facilitator_config=facilitator_config,
    )
)


@app.get("/weather")
async def get_weather() -> Dict[str, Any]:
    return {
        "report": {
            "weather": "sunny",
            "temperature": 72,
            "v2_compliant": True,
            "network": "base-mainnet",
        }
    }


@app.get("/premium/content")
async def get_premium_content() -> Dict[str, Any]:
    return {"content": "This is premium content on Base Mainnet", "status": "paid"}


if __name__ == "__main__":
    uvicorn.run(app, host="0.0.0.0", port=4021)
