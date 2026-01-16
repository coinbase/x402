import os

from dotenv import load_dotenv
from fastapi import FastAPI
from pydantic import BaseModel
from pprint import pprint

from x402.extensions.bazaar import (
    OutputConfig,
    bazaar_resource_server_extension,
    declare_discovery_extension,
)
from x402.http import FacilitatorConfig, HTTPFacilitatorClient, PaymentOption
from x402.http.middleware.fastapi import PaymentMiddlewareASGI
from x402.http.types import HTTPRequestContext, RouteConfig
from x402.mechanisms.evm.exact import ExactEvmServerScheme
from x402.mechanisms.svm.exact import ExactSvmServerScheme
from x402.schemas import AssetAmount, Network
from x402.server import x402ResourceServer

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

# Address lookup for dynamic pay-to
ADDRESS_LOOKUP: dict[str, str] = {
    "US": EVM_ADDRESS,
    "UK": EVM_ADDRESS,
    "CA": EVM_ADDRESS,
    "AU": EVM_ADDRESS,
    "NZ": EVM_ADDRESS,
    "IE": EVM_ADDRESS,
    "FR": EVM_ADDRESS,
}


# Dynamic pay-to function
def get_dynamic_pay_to(context: HTTPRequestContext) -> str:
    """
    Get dynamic pay-to address based on country

    Args:
        context: HTTPRequestContext containing adapter and request info

    Returns:
        Pay-to address string
    """
    country = context.adapter.get_query_param("country") or "US"
    return ADDRESS_LOOKUP.get(country, EVM_ADDRESS)


# Custom money parser for alternative tokens
def custom_money_parser(amount: float, network: str) -> AssetAmount | None:
    """
    Custom money parser for Gnosis Chain (xDai) using Wrapped XDAI.

    NOTE: Wrapped XDAI is not an EIP-3009 compliant token, and would fail
    the current ExactEvm implementation. This example is for demonstration purposes.

    Args:
        amount: Decimal amount (e.g., 1.50 for $1.50)
        network: Network identifier

    Returns:
        AssetAmount if network matches, None otherwise
    """
    if network == "eip155:100":  # Gnosis Chain
        return AssetAmount(
            amount=str(int(amount * 1e18)),
            asset="0xe91d153e0b41518a2ce8dd3d7944fa863463a97d",  # WXDAI
            extra={"token": "Wrapped XDAI"},
        )
    return None


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

# Register EVM scheme with custom money parser
evm_scheme = ExactEvmServerScheme()
evm_scheme.register_money_parser(custom_money_parser)
server.register(EVM_NETWORK, evm_scheme)
server.register(SVM_NETWORK, ExactSvmServerScheme())

# Register hooks
server.on_before_verify(lambda ctx: (print("\n=== Before verify ==="), pprint(vars(ctx))))
server.on_after_verify(lambda ctx: (print("\n=== After verify ==="), pprint(vars(ctx))))
server.on_verify_failure(lambda ctx: (print("\n=== Verify failure ==="), pprint(vars(ctx))))
server.on_before_settle(lambda ctx: (print("\n=== Before settle ==="), pprint(vars(ctx))))
server.on_after_settle(lambda ctx: (print("\n=== After settle ==="), pprint(vars(ctx))))
server.on_settle_failure(lambda ctx: (print("\n=== Settle failure ==="), pprint(vars(ctx))))

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
            # add a bazaar discovery extension.
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
        description="Weather report with dynamic pricing",
        extensions={
            # add a bazaar discovery extension.
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
    # Dynamic pay-to: route payments to different addresses based on country
    "GET /weather-pay-to": RouteConfig(
        accepts=[
            PaymentOption(
                scheme="exact",
                pay_to=lambda context: get_dynamic_pay_to(context),
                price="$0.001",
                network=EVM_NETWORK,
            ),
        ],
        mime_type="application/json",
        description="Weather report with dynamic pay-to address",
    ),
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
async def get_weather_dynamic(city: str, tier: str = "standard") -> WeatherResponse:
    """
    Get weather report for a given city and tier, the price is dynamic based on the tier

    Args:
        city: City name
        tier: Tier name (standard or premium)

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


@app.get("/weather-pay-to")
async def get_weather_pay_to(city: str, country: str = "US") -> WeatherResponse:
    """
    Get weather report with dynamic pay-to address based on country.

    The pay-to address is dynamically determined based on the country parameter,
    allowing payments to be routed to different addresses.

    Args:
        city: City name
        country: Country code (US, UK, CA, AU, NZ, IE, FR)

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
