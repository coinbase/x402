import base64
import fnmatch
import json
import re
from typing import Any, Callable, Optional

from fastapi import Request
from fastapi.responses import JSONResponse
from pydantic import validate_call

from x402.chains import get_chain_id, get_token_name, get_token_version
from x402.common import parse_money, x402_VERSION
from x402.facilitator import FacilitatorClient
from x402.types import PaymentPayload, PaymentRequirements, x402PaymentRequiredResponse
from x402.encoding import safe_base64_decode


def get_usdc_address(chain_id: int | str) -> str:
    """Get the USDC contract address for a given chain ID"""
    if isinstance(chain_id, str):
        chain_id = int(chain_id)
    if chain_id == 84532:  # Base Sepolia testnet
        return "0x036CbD53842c5426634e7929541eC2318f3dCF7e"
    elif chain_id == 8453:  # Base mainnet
        return "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913"
    raise ValueError(f"Unsupported chain ID: {chain_id}")


def _path_is_match(path: str | list[str], request_path: str) -> bool:
    """
    Check if request path matches the specified path pattern(s).

    Supports:
    - Exact matching: "/api/users"
    - Glob patterns: "/api/users/*", "/api/*/profile"
    - Regex patterns (prefix with 'regex:'): "regex:^/api/users/\d+$"
    - List of any of the above
    """

    def single_path_match(pattern: str) -> bool:
        # Regex pattern
        if pattern.startswith("regex:"):
            regex_pattern = pattern[6:]  # Remove 'regex:' prefix
            return bool(re.match(regex_pattern, request_path))

        # Glob pattern (contains * or ?)
        elif "*" in pattern or "?" in pattern:
            return fnmatch.fnmatch(request_path, pattern)

        # Exact match
        else:
            return pattern == request_path

    if isinstance(path, str):
        return single_path_match(path)
    elif isinstance(path, list):
        return any(single_path_match(p) for p in path)

    return False


@validate_call
def require_payment(
    amount: str | int,
    pay_to_address: str,
    path: str | list[str] = "*",
    asset: str = "",
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

    if asset == "":
        asset = get_usdc_address(get_chain_id(network_id))

    try:
        parsed_amount = parse_money(amount, asset, network_id)
    except Exception as e:
        raise ValueError(
            f"Invalid amount: {amount}. Must be in the form '$3.10', 0.10, '0.001'. Error: {e}"
        )

    facilitator = FacilitatorClient(facilitator_url)

    async def middleware(request: Request, call_next: Callable):
        # Skip if the path is not the same as the path in the middleware
        if not _path_is_match(path, request.url.path):
            return await call_next(request)

        # Get resource URL if not explicitly provided
        resource_url = resource or str(request.url)

        # Ensure output_schema and extra are objects, not null
        output_schema_obj = {} if output_schema is None else output_schema

        # Get token name and version for EIP-712 signing
        chain_id = get_chain_id(network_id)
        token_name = get_token_name(chain_id, asset)
        token_version = get_token_version(chain_id, asset)

        # Construct payment details
        payment_requirements = [
            PaymentRequirements(
                scheme="exact",
                network=network_id,
                asset=asset,
                max_amount_required=str(parsed_amount),
                resource=resource_url,
                description=description,
                mime_type=mime_type,
                pay_to=pay_to_address,
                max_timeout_seconds=max_deadline_seconds,
                output_schema=output_schema_obj,
                extra={
                    "name": token_name,
                    "version": token_version,
                },
            )
        ]

        def x402_response(error: str):
            return JSONResponse(
                content=x402PaymentRequiredResponse(
                    x402_version=x402_VERSION,
                    accepts=payment_requirements,
                    error=error,
                ).model_dump(),
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
