import os
from typing import Any, Dict

from dotenv import load_dotenv
from fastapi import FastAPI
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles
from x402.fastapi.middleware import require_payment
from x402.types import PaywallConfig

# Load environment variables
load_dotenv()

# Get configuration from environment
NETWORK = os.getenv("NETWORK", "base-sepolia")
ADDRESS = os.getenv("ADDRESS")
CDP_CLIENT_KEY = os.getenv("CDP_CLIENT_KEY")

if not ADDRESS:
    raise ValueError("Missing required environment variables")

app = FastAPI()

# Mount static files directory
app.mount("/static", StaticFiles(directory="static"), name="static")

# Apply payment middleware to browser-accessible paywalled routes
app.middleware("http")(
    require_payment(
        price="$0.01",
        pay_to_address=ADDRESS,
        path="/premium/*",
        network=NETWORK,
        paywall_config=PaywallConfig(
            cdp_client_key=CDP_CLIENT_KEY or "",
            app_name="x402 Python Example",
            app_logo="/static/x402.png",
        ),
    )
)

@app.get("/premium/content")
async def get_premium_content() -> FileResponse:
    return FileResponse("static/premium.html")


if __name__ == "__main__":
    import uvicorn

    uvicorn.run(app, host="0.0.0.0", port=4021)
