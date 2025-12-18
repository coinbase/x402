import os
from typing import Any, Dict

import uvicorn
from dotenv import load_dotenv
from fastapi import FastAPI
from x402.fastapi import require_payment
from x402.types import EIP712Domain, TokenAmount, TokenAsset

# You can run this with: export ADDRESS=0x... && uv run python main.py

load_dotenv()

ADDRESS = os.getenv("ADDRESS")

if not ADDRESS:
    raise ValueError("Missing required environment variables")

app = FastAPI()

# Apply V2 payment middleware to specific routes
app.middleware("http")(
    require_payment(
        path="/weather",
        price="$0.01",
        pay_to_address=ADDRESS,
        network="eip155:84532",  # Base Sepolia (CAIP-2 standard)
        description="V2 Weather Data",
        mime_type="application/json",
    )
)


@app.get("/weather")
async def get_weather() -> Dict[str, Any]:
    return {"report": {"weather": "sunny", "temperature": 72, "v2_compliant": True}}


# Apply V2 payment middleware to premium routes (Custom Token)
app.middleware("http")(
    require_payment(
        path="/premium/*",
        price=TokenAmount(
            amount="10000",  # 0.01 USDC (6 decimals)
            asset=TokenAsset(
                address="0x036CbD53842c5426634e7929541eC2318f3dCF7e",  # USDC on Base Sepolia
                decimals=6,
                eip712=EIP712Domain(name="USDC", version="2"),
            ),
        ),
        pay_to_address=ADDRESS,
        network="eip155:84532",
        description="V2 Premium Content",
        mime_type="application/json",
    )
)


@app.get("/premium/content")
async def get_premium_content() -> Dict[str, Any]:
    return {
        "content": "This is premium content (V2)",
        "access": "granted_via_custom_token",
    }


if __name__ == "__main__":
    uvicorn.run(app, host="0.0.0.0", port=4021)
