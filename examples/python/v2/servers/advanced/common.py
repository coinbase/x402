import base64
import json
import logging
import os
from typing import Optional

from dotenv import load_dotenv
from fastapi import FastAPI, Request
from fastapi.responses import JSONResponse
from x402.common import (
    find_matching_payment_requirements,
    process_price_to_atomic_amount,
    x402_VERSION,
)
from x402.encoding import safe_base64_decode, safe_base64_encode
from x402.facilitator import FacilitatorClient, FacilitatorConfig
from x402.types import (
    PaymentPayload,
    PaymentRequirements,
    Price,
    ResourceInfo,
    SettleResponse,
    SupportedNetworks,
    x402PaymentRequiredResponse,
)

# Load environment variables
load_dotenv()

# Configure logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

# Get configuration from environment
FACILITATOR_URL = os.getenv("FACILITATOR_URL")
PAY_TO_ADDRESS = (
    os.getenv("PAY_TO_ADDRESS") or "0x5e898416f9e6f63121c8f01c64ef4989ce948485"
)
# Keys for mainnet usage if needed
CDP_API_KEY_ID = os.getenv("CDP_API_KEY_ID")
CDP_API_KEY_SECRET = os.getenv("CDP_API_KEY_SECRET")

# Initialize facilitator client
facilitator_config: FacilitatorConfig = (
    {"url": FACILITATOR_URL} if FACILITATOR_URL else {}
)
# If using CDP keys (Mainnet), you would configure this:
# facilitator_config = create_facilitator_config(CDP_API_KEY_ID, CDP_API_KEY_SECRET)

facilitator = FacilitatorClient(facilitator_config)


class PaymentRequiredException(Exception):
    """Custom exception for payment required responses"""

    def __init__(self, error_data: dict):
        self.error_data = error_data
        super().__init__(error_data.get("error", "Payment required"))


def setup_exception_handlers(app: FastAPI):
    @app.exception_handler(PaymentRequiredException)
    async def payment_required_handler(request: Request, exc: PaymentRequiredException):
        """Handle payment required exceptions with proper 402 responses and V2 Headers"""

        # V2: The body follows x402PaymentRequiredResponse structure
        response_data = exc.error_data

        # V2: Also set the PAYMENT-REQUIRED header (base64 of json)
        req_json = json.dumps(response_data)
        b64_req = base64.b64encode(req_json.encode("utf-8")).decode("utf-8")

        return JSONResponse(
            status_code=402,
            content=response_data,
            headers={"Content-Type": "application/json", "PAYMENT-REQUIRED": b64_req},
        )


def create_exact_payment_requirements(
    price: Price,
    network: SupportedNetworks,
    mime_type: str = "application/json",
    max_timeout_seconds: int = 60,
    pay_to: Optional[str] = None,
) -> PaymentRequirements:
    """
    Creates payment requirements for a given price and network.
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
        amount=str(max_amount_required),
        pay_to=pay_to or str(PAY_TO_ADDRESS),
        max_timeout_seconds=max_timeout_seconds,
        asset=asset_address,
        extra=eip712_domain,
    )


async def verify_payment(
    request: Request,
    payment_requirements: list[PaymentRequirements],
    resource_info: ResourceInfo,  # V2 needs this explicitly
) -> bool:
    """
    Verifies a payment and raises PaymentRequiredException if invalid.
    """
    # V2: Header is PAYMENT-SIGNATURE
    payment_header = request.headers.get("PAYMENT-SIGNATURE")

    if not payment_header:
        # Construct V2 Error Response
        error_data = x402PaymentRequiredResponse(
            x402_version=x402_VERSION,
            error="PAYMENT-SIGNATURE header is required",
            accepts=payment_requirements,
            resource=resource_info,
        ).model_dump(by_alias=True)
        raise PaymentRequiredException(error_data)

    try:
        # V2: Decode base64 header
        payment_dict = json.loads(safe_base64_decode(payment_header))
        payment = PaymentPayload(**payment_dict)
    except Exception as e:
        error_data = x402PaymentRequiredResponse(
            x402_version=x402_VERSION,
            error=str(e) or "Invalid or malformed payment header",
            accepts=payment_requirements,
            resource=resource_info,
        ).model_dump(by_alias=True)
        raise PaymentRequiredException(error_data)

    try:
        selected_payment_requirement = (
            find_matching_payment_requirements(payment_requirements, payment)
            or payment_requirements[0]
        )

        verify_response = await facilitator.verify(
            payment, selected_payment_requirement
        )

        if not verify_response.is_valid:
            error_data = x402PaymentRequiredResponse(
                x402_version=x402_VERSION,
                error=verify_response.invalid_reason or "Payment verification failed",
                accepts=payment_requirements,
                resource=resource_info,
            ).model_dump(by_alias=True)
            raise PaymentRequiredException(error_data)

        # Attach to request for settlement usage
        request.state.payment = payment
        request.state.selected_requirement = selected_payment_requirement

    except Exception as e:
        error_data = x402PaymentRequiredResponse(
            x402_version=x402_VERSION,
            error=str(e),
            accepts=payment_requirements,
            resource=resource_info,
        ).model_dump(by_alias=True)
        raise PaymentRequiredException(error_data)

    return True


def settle_response_header(response: SettleResponse) -> str:
    """
    Creates a settlement response header (base64 encoded).
    """
    return safe_base64_encode(response.model_dump_json(by_alias=True))
