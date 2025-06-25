import base64
import json
from typing import Any, Callable, Dict, Optional

from fastapi import Request
from fastapi.responses import JSONResponse
from pydantic import validate_call

from x402.common import process_price_to_atomic_amount, x402_VERSION
from x402.encoding import safe_base64_decode
from x402.facilitator import FacilitatorClient
from x402.path import path_is_match
from x402.types import (
    PaymentPayload,
    PaymentRequirements,
    Price,
    x402PaymentRequiredResponse,
)


@validate_call
def require_payment(
    price: Price,
    pay_to_address: str,
    path: str | list[str] = "*",
    description: str = "",
    mime_type: str = "",
    max_deadline_seconds: int = 60,
    output_schema: Any = None,
    facilitator_config: Optional[Dict[str, Any]] = None,
    network: str = "base-sepolia",
    resource: Optional[str] = None,
):
    """Generate a FastAPI middleware that gates payments for an endpoint.

    Args:
        price (Price): Payment price. Can be:
            - Money: USD amount as string/int (e.g., "$3.10", 0.10, "0.001") - defaults to USDC
            - TokenAmount: Custom token amount with asset information
        pay_to_address (str): Ethereum address to receive the payment
        path (str | list[str], optional): Path to gate with payments. Defaults to "*" for all paths.
        description (str, optional): Description of what is being purchased. Defaults to "".
        mime_type (str, optional): MIME type of the resource. Defaults to "".
        max_deadline_seconds (int, optional): Maximum time allowed for payment. Defaults to 60.
        output_schema (Any, optional): JSON schema for the response. Defaults to None.
        facilitator_config (Optional[Dict[str, Any]], optional): Configuration for the payment facilitator.
            If not provided, defaults to the public x402.org facilitator.
        network (str, optional): Ethereum network ID. Defaults to "base-sepolia" (Base Sepolia testnet).
        resource (Optional[str], optional): Resource URL. Defaults to None (uses request URL).

    Returns:
        Callable: FastAPI middleware function that checks for valid payment before processing requests
    """

    try:
        max_amount_required, asset_address, eip712_domain = (
            process_price_to_atomic_amount(price, network)
        )
    except Exception as e:
        raise ValueError(f"Invalid price: {price}. Error: {e}")

    facilitator = FacilitatorClient(facilitator_config)

    async def middleware(request: Request, call_next: Callable):
        # Skip if the path is not the same as the path in the middleware
        if not path_is_match(path, request.url.path):
            return await call_next(request)

        # Get resource URL if not explicitly provided
        resource_url = resource or str(request.url)

        # Ensure output_schema and extra are objects, not null
        output_schema_obj = {} if output_schema is None else output_schema

        # Construct payment details
        payment_requirements = [
            PaymentRequirements(
                scheme="exact",
                network=network,
                asset=asset_address,
                max_amount_required=max_amount_required,
                resource=resource_url,
                description=description,
                mime_type=mime_type,
                pay_to=pay_to_address,
                max_timeout_seconds=max_deadline_seconds,
                output_schema=output_schema_obj,
                extra=eip712_domain,
            )
        ]

        def x402_response(error: str):
            return JSONResponse(
                content=x402PaymentRequiredResponse(
                    x402_version=x402_VERSION,
                    accepts=payment_requirements,
                    error=error,
                ).model_dump(by_alias=True),
                status_code=402,
            )

        # Check for payment header
        payment_header = request.headers.get("X-PAYMENT", "")

        if payment_header == "":  # Return JSON response for API requests
            # TODO: add support for html paywall
            return x402_response("No X-PAYMENT header provided")

        # Decode payment header
        try:
            payment_dict = json.loads(safe_base64_decode(payment_header))
            payment = PaymentPayload(**payment_dict)
        except Exception as e:
            return x402_response(f"Invalid payment header format: {str(e)}")

        # Find matching payment requirements
        selected_payment_requirements = next(
            (
                req
                for req in payment_requirements
                if req.scheme == payment.scheme and req.network == payment.network
            ),
            None,
        )

        if not selected_payment_requirements:
            return x402_response("No matching payment requirements found")

        # Verify payment
        verify_response = await facilitator.verify(
            payment, selected_payment_requirements
        )

        if not verify_response.is_valid:
            return x402_response("Invalid payment: " + verify_response.invalid_reason)

        request.state.payment_details = selected_payment_requirements
        request.state.verify_response = verify_response

        # Process the request
        response = await call_next(request)

        # Early return without settling if the response is not a 2xx
        if response.status_code < 200 or response.status_code >= 300:
            return response

        # Settle the payment
        try:
            settle_response = await facilitator.settle(
                payment, selected_payment_requirements
            )
            if settle_response.success:
                response.headers["X-PAYMENT-RESPONSE"] = base64.b64encode(
                    settle_response.model_dump_json().encode("utf-8")
                ).decode("utf-8")
            else:
                return x402_response("Settle failed: " + settle_response.error)
        except Exception:
            return x402_response("Settle failed")

        return response

    return middleware
