import base64
from decimal import Decimal
from typing import Optional, Any, Callable
from fastapi import Request
from fastapi.responses import HTMLResponse, JSONResponse
from pydantic import validate_call

from x402.chains import get_chain_id, get_token_decimals
from x402.common import parse_money
from x402.types import PaymentRequirements, PaymentRequiredResponse
from x402.facilitator import FacilitatorClient


def get_usdc_address(chain_id: int) -> str:
    """Get the USDC contract address for a given chain ID"""
    if chain_id == 84532:  # Base Sepolia testnet
        return "0x036CbD53842c5426634e7929541eC2318f3dCF7e"
    elif chain_id == 8453:  # Base mainnet
        return "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913"
    raise ValueError(f"Unsupported chain ID: {chain_id}")


@validate_call
def require_payment(
    amount: str | int,
    pay_to_address: str,
    path: str | list[str] = "*",
    description: str = "",
    mime_type: str = "",
    max_deadline_seconds: int = 60,
    output_schema: Any = None,
    facilitator_url: str = "https://x402.org/facilitator",
    network_id: str = "84532",
    resource: Optional[str] = None,
):
    """Generate a FastAPI middleware that gates payments for an endpoint.
    Note:
        FastAPI doesn't support path matching when applying middleware, path can either be "*" or an exact path or list of paths.
            ex: "*", "/foo", ["/foo", "/bar"]
    Args:
        amount (str | int): Payment amount in USD (e.g. "$3.10", 0.10, "0.001" or 10000 as units of token)
        pay_to_address (str): Ethereum pay_to_address to receive the payment
        path (str | list[str], optional): Path to gate with payments. Defaults to "*" for all paths.
        description (str, optional): Description of what is being purchased. Defaults to "".
        mime_type (str, optional): MIME type of the resource. Defaults to "".
        max_deadline_seconds (int, optional): Maximum time allowed for payment. Defaults to 60.
        output_schema (Any, optional): JSON schema for the response. Defaults to None.
        facilitator_url (str, optional): URL of the payment facilitator. Defaults to "https://x402.org/facilitator".
        network_id (str, optional): Ethereum network ID. Defaults to "84532" (Base Sepolia testnet).
        custom_paywall_html (str, optional): Custom HTML to show when payment is required. Defaults to "".
        resource (Optional[str], optional): Resource URL. Defaults to None (uses request URL).
    Returns:
        Callable: FastAPI middleware function that checks for valid payment before processing requests
    """

    try:
        parsed_amount = parse_money(amount)
    except Exception:
        raise ValueError(
            f"Invalid amount: {amount}. Must be in the form '$3.10', 0.10, '0.001'"
        )

    facilitator = FacilitatorClient(facilitator_url)

    async def middleware(request: Request, call_next: Callable):
        # Skip if the path is not the same as the path in the middleware
        if path != "*":
            if isinstance(path, str):
                if path != request.url.path:
                    return await call_next(request)
            elif isinstance(path, list):
                if request.url.path not in path:
                    return await call_next(request)

        # Get resource URL if not explicitly provided
        resource_url = resource or str(request.url)

        # Construct payment details
        payment_details = PaymentRequirements(
            scheme="exact",
            network=network_id,
            max_amount_required=str(parsed_amount),
            resource=resource_url,
            description=description,
            mime_type=mime_type,
            pay_to=pay_to_address,
            max_timeout_seconds=max_deadline_seconds,
            output_schema=output_schema,
            extra=None,
        )

        # Check for payment header
        payment = request.headers.get("X-PAYMENT", "")

        if payment == "":  # Return JSON response for API requests
            # TODO: add support for html paywall

            return JSONResponse(
                content=PaymentRequiredResponse(
                    paymentDetails=payment_details,
                    error="X-PAYMENT header is required",
                ).model_dump(),
                status_code=402,
            )

        # Verify payment

        verify_response = await facilitator.verify(payment, payment_details)

        if not verify_response.is_valid:
            return JSONResponse(
                content=PaymentRequiredResponse(
                    paymentDetails=payment_details,
                    error="Invalid payment: " + verify_response.invalid_reason,
                ).model_dump(),
                status_code=402,
            )

        # Process the request
        response = await call_next(request)

        # Early return without settling if the response is not a 2xx
        if response.status_code < 200 or response.status_code >= 300:
            return response

        # Settle the payment
        try:
            settle_response = await facilitator.settle(payment, payment_details)
            if settle_response.success:
                response.headers["X-PAYMENT-RESPONSE"] = base64.b64encode(
                    settle_response.model_dump_json().encode("utf-8")
                ).decode("utf-8")
            else:
                return JSONResponse(
                    content=PaymentRequiredResponse(
                        paymentDetails=payment_details,
                        error="Settle failed: " + settle_response.error,
                    ).model_dump(),
                    status_code=402,
                )
        except Exception as e:
            print(e)
            return JSONResponse(
                content={
                    "error": str(e),
                    "paymentDetails": payment_details.model_dump(),
                },
                status_code=402,
            )

        return response

    return middleware
