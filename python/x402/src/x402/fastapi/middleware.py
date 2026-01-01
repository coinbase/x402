import asyncio
import base64
import json
import logging
from typing import Any, Callable, Optional, get_args, cast

from fastapi import Request
from fastapi.responses import JSONResponse, HTMLResponse

from x402.common import (
    process_price_to_atomic_amount,
    x402_VERSION,
    find_matching_payment_requirements,
)
from x402.encoding import safe_base64_decode
from x402.facilitator import FacilitatorClient, FacilitatorConfig
from x402.path import path_is_match
from x402.paywall import is_browser_request, get_paywall_html
from x402.types import (
    PaymentPayload,
    PaymentRequirements,
    Price,
    x402PaymentRequiredResponse,
    PaywallConfig,
    SupportedNetworks,
    HTTPInputSchema,
    PriceOrHook,
    StringOrHook,
)

logger = logging.getLogger(__name__)


async def _resolve_value(
    value: Any,
    request: Request,
    timeout: float = 5.0,
    field_name: str = "value",
) -> Any:
    """
    Resolve a value that could be a static value or an async hook.

    Args:
        value: Static value or async callable hook
        request: The incoming request object
        timeout: Maximum seconds to wait for hook execution (default: 5.0)
        field_name: Name of the field being resolved (for error messages)

    Returns:
        The resolved value

    Raises:
        asyncio.TimeoutError: If hook execution exceeds timeout
        ValueError: If hook returns invalid value
    """
    if callable(value):
        try:
            return await asyncio.wait_for(value(request), timeout=timeout)
        except asyncio.TimeoutError:
            logger.error(f"Hook for '{field_name}' timed out after {timeout}s")
            raise
        except Exception as e:
            logger.error(f"Hook for '{field_name}' failed: {e}")
            raise
    return value


def _validate_and_process_price(price: Price, network: str):
    """
    Validate and process a price into atomic amounts.

    Args:
        price: The price to validate and process
        network: The blockchain network

    Returns:
        Tuple of (max_amount_required, asset_address, eip712_domain)

    Raises:
        ValueError: If price is invalid
    """
    try:
        return process_price_to_atomic_amount(price, network)
    except Exception as e:
        raise ValueError(f"Invalid price: {price}. Error: {e}")


def require_payment(
    price: PriceOrHook,
    pay_to_address: str,
    path: str | list[str] = "*",
    description: StringOrHook = "",
    mime_type: str = "",
    max_deadline_seconds: int = 60,
    input_schema: Optional[HTTPInputSchema] = None,
    output_schema: Optional[Any] = None,
    discoverable: Optional[bool] = True,
    facilitator_config: Optional[FacilitatorConfig] = None,
    network: str = "base-sepolia",
    resource: Optional[StringOrHook] = None,
    paywall_config: Optional[PaywallConfig] = None,
    custom_paywall_html: Optional[str] = None,
):
    """Generate a FastAPI middleware that gates payments for an endpoint.

    This middleware supports both static payment requirements and dynamic requirements
    via async hooks that compute values at runtime based on the request context.

    Args:
        price: Payment price. Can be:
            - Static: Money (USD string/int like "$3.10", 0.10, "0.001") or TokenAmount
            - Dynamic: async def get_price(request: Request) -> Price
        pay_to_address (str): Ethereum address to receive the payment
        path (str | list[str], optional): Path to gate with payments. Defaults to "*" for all paths.
        description: Human-readable description. Can be:
            - Static: "Access to premium content"
            - Dynamic: async def get_description(request: Request) -> str
        mime_type (str, optional): MIME type of the resource. Defaults to "".
        max_deadline_seconds (int, optional): Maximum time allowed for payment. Defaults to 60.
        input_schema (Optional[HTTPInputSchema], optional): Schema for the request structure. Defaults to None.
        output_schema (Optional[Any], optional): Schema for the response. Defaults to None.
        discoverable (bool, optional): Whether the route is discoverable. Defaults to True.
        facilitator_config (Optional[Dict[str, Any]], optional): Configuration for the payment facilitator.
            If not provided, defaults to the public x402.org facilitator.
        network (str, optional): Ethereum network ID. Defaults to "base-sepolia" (Base Sepolia testnet).
        resource: Resource identifier. Can be:
            - Static: "https://example.com/resource"
            - Dynamic: async def get_resource(request: Request) -> str
            - None: defaults to request.url
        paywall_config (Optional[PaywallConfig], optional): Configuration for paywall UI customization.
            Includes options like cdp_client_key, app_name, app_logo, session_token_endpoint.
        custom_paywall_html (Optional[str], optional): Custom HTML to display for paywall instead of default.

    Returns:
        Callable: FastAPI middleware function that checks for valid payment before processing requests

    Raises:
        ValueError: If price or network configuration is invalid

    Example - Static pricing:
        >>> app.middleware("http")(
        ...     require_payment(
        ...         price="$1.00",
        ...         pay_to_address="0x...",
        ...         description="Access to API"
        ...     )
        ... )

    Example - Dynamic pricing:
        >>> async def get_price(request: Request) -> str:
        ...     if "premium" in request.url.path:
        ...         return "$10.00"
        ...     return "$1.00"
        >>>
        >>> app.middleware("http")(
        ...     require_payment(
        ...         price=get_price,
        ...         pay_to_address="0x...",
        ...         description="Dynamic content pricing"
        ...     )
        ... )

    Note:
        - Async hooks have a 5-second timeout by default
        - Hook failures return 500 Internal Server Error
        - Static prices are validated at middleware creation time
        - Dynamic prices are validated per-request
    """

    # Validate network is supported
    supported_networks = get_args(SupportedNetworks)
    if network not in supported_networks:
        raise ValueError(
            f"Unsupported network: {network}. Must be one of: {supported_networks}"
        )

    # Fail-fast for static price if it's not a hook
    if not callable(price):
        _validate_and_process_price(price, network)

    facilitator = FacilitatorClient(facilitator_config)

    # Cache which values are hooks for performance optimization
    is_price_hook = callable(price)
    is_description_hook = callable(description)
    is_resource_hook = callable(resource)

    async def middleware(request: Request, call_next: Callable):
        # Skip if the path is not the same as the path in the middleware
        if not path_is_match(path, request.url.path):
            return await call_next(request)

        # Resolve dynamic values with optimized conditional execution
        try:
            if is_price_hook:
                current_price = await _resolve_value(
                    price, request, field_name="price"
                )
            else:
                current_price = price

            if is_description_hook:
                current_description = await _resolve_value(
                    description, request, field_name="description"
                )
            else:
                current_description = description

            if is_resource_hook:
                current_resource = await _resolve_value(
                    resource, request, field_name="resource"
                )
            else:
                current_resource = resource or str(request.url)

            max_amount_required, asset_address, eip712_domain = (
                _validate_and_process_price(current_price, network)
            )
        except asyncio.TimeoutError:
            logger.error("Payment requirement hook timed out")
            return JSONResponse(
                status_code=500,
                content={"error": "Request timeout processing payment requirements"},
            )
        except Exception as e:
            logger.error(f"Failed to resolve payment requirements: {e}")
            return JSONResponse(
                status_code=500,
                content={
                    "error": "Internal server error resolving payment requirements"
                },
            )

        # Construct payment details
        payment_requirements = [
            PaymentRequirements(
                scheme="exact",
                network=cast(SupportedNetworks, network),
                asset=asset_address,
                max_amount_required=max_amount_required,
                resource=current_resource,
                description=current_description,
                mime_type=mime_type,
                pay_to=pay_to_address,
                max_timeout_seconds=max_deadline_seconds,
                # TODO: Rename output_schema to request_structure
                output_schema={
                    "input": {
                        "type": "http",
                        "method": request.method.upper(),
                        "discoverable": discoverable
                        if discoverable is not None
                        else True,
                        **(input_schema.model_dump() if input_schema else {}),
                    },
                    "output": output_schema,
                },
                extra=eip712_domain,
            )
        ]

        def x402_response(error: str):
            """Create a 402 response with payment requirements."""
            request_headers = dict(request.headers)
            status_code = 402

            if is_browser_request(request_headers):
                html_content = custom_paywall_html or get_paywall_html(
                    error, payment_requirements, paywall_config
                )
                headers = {"Content-Type": "text/html; charset=utf-8"}

                return HTMLResponse(
                    content=html_content,
                    status_code=status_code,
                    headers=headers,
                )
            else:
                response_data = x402PaymentRequiredResponse(
                    x402_version=x402_VERSION,
                    accepts=payment_requirements,
                    error=error,
                ).model_dump(by_alias=True)
                headers = {"Content-Type": "application/json"}

                return JSONResponse(
                    content=response_data,
                    status_code=status_code,
                    headers=headers,
                )

        # Check for payment header
        payment_header = request.headers.get("X-PAYMENT", "")

        if payment_header == "":
            return x402_response("No X-PAYMENT header provided")

        # Decode payment header
        try:
            payment_dict = json.loads(safe_base64_decode(payment_header))
            payment = PaymentPayload(**payment_dict)
        except Exception as e:
            logger.warning(
                f"Invalid payment header format from {request.client.host if request.client else 'unknown'}: {str(e)}"
            )
            return x402_response("Invalid payment header format")

        # Find matching payment requirements
        selected_payment_requirements = find_matching_payment_requirements(
            payment_requirements, payment
        )

        if not selected_payment_requirements:
            return x402_response("No matching payment requirements found")

        # Verify payment
        verify_response = await facilitator.verify(
            payment, selected_payment_requirements
        )

        if not verify_response.is_valid:
            error_reason = verify_response.invalid_reason or "Unknown error"
            return x402_response(f"Invalid payment: {error_reason}")

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
                    settle_response.model_dump_json(by_alias=True).encode("utf-8")
                ).decode("utf-8")
            else:
                return x402_response(
                    "Settle failed: "
                    + (settle_response.error_reason or "Unknown error")
                )
        except Exception:
            return x402_response("Settle failed")

        return response

    return middleware
