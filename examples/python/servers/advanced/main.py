import os

from dotenv import load_dotenv
from fastapi import FastAPI
from pydantic import BaseModel

from x402.http import FacilitatorConfig, HTTPFacilitatorClient, PaymentOption
from x402.http.middleware.fastapi import PaymentMiddlewareASGI
from x402.http.types import RouteConfig, HTTPRequestContext
from x402.mechanisms.evm.exact import ExactEvmServerScheme
from x402.mechanisms.svm.exact import ExactSvmServerScheme
from x402.schemas import Network
from x402.server import x402ResourceServer
from x402.extensions.bazaar import declare_discovery_extension, bazaar_resource_server_extension, OutputConfig

from hooks import before_verify_hook, after_verify_hook, on_verify_failure_hook, before_settle_hook, after_settle_hook, on_settle_failure_hook

load_dotenv()

# Config
EVM_ADDRESS = os.getenv("EVM_ADDRESS")
SVM_ADDRESS = os.getenv("SVM_ADDRESS")
EVM_NETWORK: Network = "eip155:84532"  # Base Sepolia
SVM_NETWORK: Network = "solana:EtWTRABZaYq6iMfeYKouRu166VU2xqa1"  # Solana Devnet
FACILITATOR_URL = os.getenv("FACILITATOR_URL", "https://www.x402.org/facilitator")

if not EVM_ADDRESS or not SVM_ADDRESS:
    raise ValueError("Missing required environment variables")


# Weather data for response
WEATHER_DATA = {
    "San Francisco": {
        "weather": "sunny",
        "temperature": 70,
    },
    "New York": {
        "weather": "cloudy",
        "temperature": 55,
    },
}

# Dynamic price function
def get_dynamic_price(context: HTTPRequestContext) -> str:
    """
    Get dynamic price based on tier

    Args:
        context: HTTPRequestContext containing adapter and request info

    Returns:
        Price string
    """
    tier = context.adapter.get_query_param("tier") or "standard"
    return "$0.005" if tier == "premium" else "$0.001"


# Response schemas
class WeatherReport(BaseModel):
    weather: str
    temperature: int


class WeatherResponse(BaseModel):
    report: WeatherReport


class PremiumContentResponse(BaseModel):
    content: str


# App
app = FastAPI()

# x402 Middleware
facilitator = HTTPFacilitatorClient(FacilitatorConfig(url=FACILITATOR_URL))
server = x402ResourceServer(facilitator)
server.register(EVM_NETWORK, ExactEvmServerScheme())
server.register(SVM_NETWORK, ExactSvmServerScheme())

# Register hooks
server.on_before_verify(before_verify_hook)
server.on_after_verify(after_verify_hook)
server.on_verify_failure(on_verify_failure_hook)
server.on_before_settle(before_settle_hook)
server.on_after_settle(after_settle_hook)
server.on_settle_failure(on_settle_failure_hook)

# Register extensions
server.register_extension(bazaar_resource_server_extension)

routes = {
    # a first way to pay for the weather report, it's a string
    "GET /weather": RouteConfig(
        accepts=[
            PaymentOption(
                scheme="exact",
                pay_to=EVM_ADDRESS,
                price="$0.01",
                network=EVM_NETWORK,
            ),
            PaymentOption(
                scheme="exact",
                pay_to=SVM_ADDRESS,
                price="$0.01",
                network=SVM_NETWORK,
            ),
        ],
        mime_type="application/json",
        description="Weather report",
        extensions={
            **declare_discovery_extension(
                input = {
                    "city": "San Francisco",
                },
                input_schema = {
                    "properties": {
                        "city": {"type": "string"},
                    },
                    "required": ["city"],
                },
                output=OutputConfig(
                    example = {
                        "weather": "sunny",
                        "temperature": 70,
                    },
                    schema = {
                        "properties": {
                            "weather": {"type": "string"},
                            "temperature": {"type": "number"},
                        },
                        "required": ["weather", "temperature"],
                    },
                )
            )
        },
    ),
    "GET /weather-dynamic": RouteConfig(
        accepts=[
            PaymentOption(
                scheme="exact",
                pay_to=EVM_ADDRESS,
                price=lambda context: get_dynamic_price(context),
                network=EVM_NETWORK,
            ),
            PaymentOption(
                scheme="exact",
                pay_to=SVM_ADDRESS,
                price=lambda context: get_dynamic_price(context),
                network=SVM_NETWORK,
            ),
        ],
        mime_type="application/json",
        description="Weather report",
        extensions={
            **declare_discovery_extension(
                input = {
                    "city": "San Francisco",
                },
                input_schema = {
                    "properties": {
                        "city": {"type": "string"},
                    },
                    "required": ["city"],
                },
                output=OutputConfig(
                    example = {
                        "weather": "sunny",
                        "temperature": 70,
                    },
                    schema = {
                        "properties": {
                            "weather": {"type": "string"},
                            "temperature": {"type": "number"},
                        },
                        "required": ["weather", "temperature"],
                    },
                )
            )
        },
    )
}
app.add_middleware(PaymentMiddlewareASGI, routes=routes, server=server)


# Routes
@app.get("/health")
async def health_check() -> dict[str, str]:
    return {"status": "ok"}

@app.get("/weather")
async def get_weather(city: str) -> WeatherResponse:
    """
    Get weather report for a given city

    Args:
        city: City name

    Returns:
        WeatherResponse
    """
    weather_report = WeatherReport(
        weather=WEATHER_DATA[city]["weather"], 
        temperature=WEATHER_DATA[city]["temperature"])

    return WeatherResponse(report=weather_report)


@app.get("/weather-dynamic")
async def get_weather_dynamic(city: str, tier: str) -> WeatherResponse:
    """
    Get weather report for a given city and tier, the price is dynamic based on the tier

    Args:
        city: City name
        tier: Tier name

    Returns:
        WeatherResponse
    """
    weather_data = WEATHER_DATA.get(city, {"weather": "sunny", "temperature": 70})
    return WeatherResponse(
        report=WeatherReport(
            weather=weather_data["weather"],
            temperature=weather_data["temperature"]
        )
    )



if __name__ == "__main__":
    import uvicorn

    uvicorn.run(app, host="0.0.0.0", port=4021)
