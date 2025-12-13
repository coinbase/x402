import os
import asyncio
import logging
from typing import Any, Dict

from dotenv import load_dotenv
from fastapi import FastAPI, Request, Response
from fastapi.responses import JSONResponse
from x402.common import process_price_to_atomic_amount, x402_VERSION
from x402.exact import decode_payment
from x402.facilitator import FacilitatorClient, FacilitatorConfig
from x402.encoding import safe_base64_encode
from x402.common import find_matching_payment_requirements
from x402.types import (
    PaymentPayload,
    PaymentRequirements,
    Price,
    SupportedNetworks,
    TokenAmount,
    TokenAsset,
    EIP712Domain,
    x402PaymentRequiredResponse,
    SettleResponse,
)

# Load environment variables
load_dotenv()

# Configure logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

# Get configuration from environment
FACILITATOR_URL = os.getenv("FACILITATOR_URL")
PAY_TO_ADDRESS = os.getenv("PAY_TO_ADDRESS")

if not FACILITATOR_URL:
    raise ValueError("Missing required environment variable: FACILITATOR_URL")

if not PAY_TO_ADDRESS:
    raise ValueError("Missing required environment variable: PAY_TO_ADDRESS")


app = FastAPI(title="x402 Advanced Server Example")

# Initialize facilitator client
facilitator_config: FacilitatorConfig = {"url": FACILITATOR_URL}
facilitator = FacilitatorClient(facilitator_config)


class PaymentRequiredException(Exception):
    """Custom exception for payment required responses"""

    def __init__(self, error_data: dict):
        self.error_data = error_data
        super().__init__(error_data.get("error", "Payment required"))


@app.exception_handler(PaymentRequiredException)
async def payment_required_handler(request: Request, exc: PaymentRequiredException):
    """Handle payment required exceptions with proper 402 responses"""
    return JSONResponse(
        status_code=402,
        content=exc.error_data,
        headers={"Content-Type": "application/json"},
    )





def create_exact_payment_requirements(
    price: Price,
    network: SupportedNetworks,
    resource: str,
    description: str = "",
    mime_type: str = "application/json",
    max_timeout_seconds: int = 60,
) -> PaymentRequirements:
    """
    Creates payment requirements for a given price and network.

    This handles both USD string prices (e.g., "$0.001") and TokenAmount objects.

    Args:
        price: The price to be paid for the resource (USD string or TokenAmount)
        network: The blockchain network to use for payment
        resource: The resource being accessed
        description: Optional description of the payment
        mime_type: MIME type of the resource
        max_timeout_seconds: Maximum timeout for the payment

    Returns:
        PaymentRequirements object

    Raises:
        ValueError: If price format is invalid
    """
    try:
        max_amount_required, asset_address, eip712_domain = (
            process_price_to_atomic_amount(price, network)
        )
    except Exception as e:
        raise ValueError(f"Invalid price: {price}. Error: {e}")

    return PaymentRequirements(
        scheme="exact",
        network=network,
        max_amount_required=max_amount_required,
        resource=resource,
        description=description,
        mime_type=mime_type,
        pay_to=str(PAY_TO_ADDRESS),
        max_timeout_seconds=max_timeout_seconds,
        asset=asset_address,
        output_schema=None,
        extra=eip712_domain,
    )


async def verify_payment(
    request: Request,
    payment_requirements: list[PaymentRequirements],
) -> bool:
    """
    Verifies a payment and raises PaymentRequiredException if invalid.

    Args:
        request: The FastAPI request object
        payment_requirements: List of payment requirements to verify against

    Returns:
        True if payment is valid

    Raises:
        PaymentRequiredException: If payment is required or invalid
    """
    x_payment = request.headers.get("X-PAYMENT")
    if not x_payment:
        error_data = x402PaymentRequiredResponse(
            x402_version=x402_VERSION,
            error="X-PAYMENT header is required",
            accepts=payment_requirements,
        ).model_dump(by_alias=True)
        raise PaymentRequiredException(error_data)

    try:
        decoded_payment_dict = decode_payment(x_payment)
        decoded_payment_dict["x402Version"] = x402_VERSION
        decoded_payment = PaymentPayload(**decoded_payment_dict)
    except Exception as e:
        error_data = x402PaymentRequiredResponse(
            x402_version=x402_VERSION,
            error=str(e) or "Invalid or malformed payment header",
            accepts=payment_requirements,
        ).model_dump(by_alias=True)
        raise PaymentRequiredException(error_data)

    try:
        selected_payment_requirement = find_matching_payment_requirements(
            payment_requirements, decoded_payment
        ) or payment_requirements[0]
        verify_response = await facilitator.verify(
            decoded_payment, selected_payment_requirement
        )
        if not verify_response.is_valid:
            error_data = x402PaymentRequiredResponse(
                x402_version=x402_VERSION,
                error=verify_response.invalid_reason or "Payment verification failed",
                accepts=payment_requirements,
            ).model_dump(by_alias=True)
            raise PaymentRequiredException(error_data)
    except Exception as e:
        error_data = x402PaymentRequiredResponse(
            x402_version=x402_VERSION,
            error=str(e),
            accepts=payment_requirements,
        ).model_dump(by_alias=True)
        raise PaymentRequiredException(error_data)

    return True


def settle_response_header(response: SettleResponse) -> str:
    """
    Creates a settlement response header.

    This is the Python equivalent of the TypeScript settleResponseHeader function.
    It base64 encodes the settlement response for use in the X-PAYMENT-RESPONSE header.

    Args:
        response: The settlement response from the facilitator

    Returns:
        A base64 encoded string containing the settlement response
    """
    return safe_base64_encode(response.model_dump_json(by_alias=True))


# Delayed settlement example endpoint
@app.get("/delayed-settlement")
async def delayed_settlement(request: Request) -> Dict[str, Any]:
    """
    Demonstrates asynchronous payment processing.
    Returns the weather data immediately without waiting for payment settlement.
    Processes payment asynchronously in the background.
    """
    resource = str(request.url)
    payment_requirements = [
        create_exact_payment_requirements(
            price="$0.001",
            network="base-sepolia",
            resource=resource,
            description="Access to weather data (async)",
        )
    ]

    await verify_payment(request, payment_requirements)

    # Return weather data immediately
    response_data = {
        "report": {
            "weather": "sunny",
            "temperature": 70,
        }
    }

    # Process payment asynchronously in the background
    async def process_payment_async():
        try:
            x_payment = request.headers.get("X-PAYMENT")
            if not x_payment:
                logger.error("X-PAYMENT header missing in async processing")
                return

            decoded_payment_dict = decode_payment(x_payment)
            decoded_payment = PaymentPayload(**decoded_payment_dict)

            settle_response = await facilitator.settle(
                decoded_payment, payment_requirements[0]
            )
            response_header = settle_response_header(settle_response)

            # In a real application, you would store this response header
            # and associate it with the payment for later verification
            logger.info(f"Payment settled: {response_header}")
        except Exception as e:
            logger.error(f"Payment settlement failed: {e}")
            # In a real application, you would handle the failed payment
            # by marking it for retry or notifying the user

    # Start background task
    asyncio.create_task(process_payment_async())

    return response_data


# Dynamic price example endpoint
@app.get("/dynamic-price")
async def dynamic_price(request: Request, response: Response) -> Dict[str, Any]:
    """
    Shows how to implement variable pricing based on request parameters.
    Accepts a 'multiplier' query parameter to adjust the base price.
    """
    # Use query params, body, or external factors to determine pricing
    multiplier = int(request.query_params.get("multiplier", "1"))
    # Adjust pricing based on impact from inputs
    base_price = 0.001
    dynamic_price_value = base_price * multiplier

    resource = str(request.url)
    payment_requirements = [
        create_exact_payment_requirements(
            price=f"${dynamic_price_value}",
            network="base-sepolia",
            resource=resource,
            description="Access to weather data",
        )
    ]

    await verify_payment(request, payment_requirements)

    # Process payment synchronously
    x_payment = request.headers.get("X-PAYMENT")
    if not x_payment:
        raise ValueError("X-PAYMENT header is required")

    decoded_payment_dict = decode_payment(x_payment)
    decoded_payment = PaymentPayload(**decoded_payment_dict)

    settle_response = await facilitator.settle(decoded_payment, payment_requirements[0])
    response_header = settle_response_header(settle_response)

    # Set the payment response header
    response.headers["X-PAYMENT-RESPONSE"] = response_header

    # Return the weather data
    return {
        "report": {
            "success": "sunny",
            "temperature": 70,
        }
    }


# Multiple payment requirements example endpoint
@app.get("/multiple-payment-requirements")
async def multiple_payment_requirements(
    request: Request, response: Response
) -> Dict[str, Any]:
    """
    Illustrates how to accept multiple payment options.
    Allows clients to pay using different assets (e.g., USDC or custom tokens).
    """
    resource = str(request.url)

    # Payment requirements is a list. You can mix and match tokens, prices, and networks.
    payment_requirements = [
        # Option 1: USD price (automatically converts to USDC)
        create_exact_payment_requirements(
            price="$0.001",
            network="base",
            resource=resource,
            description="Access to weather data (USDC)",
        ),
        # Option 2: Specific token amount
        create_exact_payment_requirements(
            price=TokenAmount(
                amount="1000",
                asset=TokenAsset(
                    address="0x036CbD53842c5426634e7929541eC2318f3dCF7e",  # USDC on Base Sepolia
                    decimals=6,
                    eip712=EIP712Domain(name="USDC", version="2"),
                ),
            ),
            network="base-sepolia",
            resource=resource,
            description="Access to weather data (Custom Token)",
        ),
    ]

    await verify_payment(request, payment_requirements)

    # Process payment synchronously
    x_payment = request.headers.get("X-PAYMENT")
    if not x_payment:
        raise ValueError("X-PAYMENT header is required")

    decoded_payment_dict = decode_payment(x_payment)
    decoded_payment = PaymentPayload(**decoded_payment_dict)

    # Find the matching payment requirement
    selected_payment_requirement = find_matching_payment_requirements(
        payment_requirements, decoded_payment
    ) or payment_requirements[0]

    settle_response = await facilitator.settle(
        decoded_payment, selected_payment_requirement
    )
    response_header = settle_response_header(settle_response)

    # Set the payment response header
    response.headers["X-PAYMENT-RESPONSE"] = response_header

    # Return the weather data
    return {
        "report": {
            "success": "sunny",
            "temperature": 70,
        }
    }


if __name__ == "__main__":
    import uvicorn

    uvicorn.run(app, host="0.0.0.0", port=4021)
