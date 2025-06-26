import base64
import json
from typing import Any, Dict, Optional, Union
from flask import Flask, request, g
from x402.path import path_is_match
from x402.types import (
    Price,
    PaymentPayload,
    PaymentRequirements,
    x402PaymentRequiredResponse,
)
from x402.common import process_price_to_atomic_amount, x402_VERSION
from x402.encoding import safe_base64_decode
from x402.facilitator import FacilitatorClient


class ResponseWrapper:
    """Wrapper to capture response status and headers for settlement logic."""

    def __init__(self, start_response):
        self.start_response = start_response
        self.status_code = None
        self.headers = []
        self.body = []

    def __call__(self, status, headers, exc_info=None):
        self.status_code = int(status.split()[0])
        self.headers = headers
        return self.start_response(status, headers, exc_info)

    def add_header(self, name, value):
        """Add a header to the response."""
        self.headers.append((name, value))


class PaymentMiddleware:
    """
    Flask middleware for x402 payment requirements.
    Allows multiple registrations with different path patterns and configurations.

    Usage:
        middleware = PaymentMiddleware(app)
        middleware.add(path="/weather", price="$0.001", pay_to_address="0x...")
        middleware.add(path="/premium/*", price=TokenAmount(...), pay_to_address="0x...")
    """

    def __init__(self, app: Flask):
        self.app = app
        self.middleware_configs = []

    def add(
        self,
        price: Price,
        pay_to_address: str,
        path: Union[str, list[str]] = "*",
        description: str = "",
        mime_type: str = "",
        max_deadline_seconds: int = 60,
        output_schema: Any = None,
        facilitator_config: Optional[Dict[str, Any]] = None,
        network: str = "base-sepolia",
        resource: Optional[str] = None,
    ):
        """
        Add a payment middleware configuration.

        Args:
            price (Price): Payment price (USD or TokenAmount)
            pay_to_address (str): Ethereum address to receive payment
            path (str | list[str], optional): Path(s) to protect. Defaults to "*".
            description (str, optional): Description of the resource
            mime_type (str, optional): MIME type of the resource
            max_deadline_seconds (int, optional): Max time for payment
            output_schema (Any, optional): JSON schema for response
            facilitator_config (dict, optional): Facilitator config
            network (str, optional): Network ID
            resource (str, optional): Resource URL
        """
        config = {
            "price": price,
            "pay_to_address": pay_to_address,
            "path": path,
            "description": description,
            "mime_type": mime_type,
            "max_deadline_seconds": max_deadline_seconds,
            "output_schema": output_schema,
            "facilitator_config": facilitator_config,
            "network": network,
            "resource": resource,
        }
        self.middleware_configs.append(config)

        # Apply the middleware to the app
        self._apply_middleware()

    def _apply_middleware(self):
        """Apply all middleware configurations to the Flask app."""
        # Create the middleware chain
        current_wsgi_app = self.app.wsgi_app

        for config in self.middleware_configs:
            middleware = self._create_middleware(config, current_wsgi_app)
            current_wsgi_app = middleware

        self.app.wsgi_app = current_wsgi_app

    def _create_middleware(self, config: Dict[str, Any], next_app):
        """Create a WSGI middleware function for the given configuration."""

        # Process price configuration (same as FastAPI)
        try:
            max_amount_required, asset_address, eip712_domain = (
                process_price_to_atomic_amount(config["price"], config["network"])
            )
        except Exception as e:
            raise ValueError(f"Invalid price: {config['price']}. Error: {e}")

        facilitator = FacilitatorClient(config["facilitator_config"])

        def middleware(environ, start_response):
            # Create Flask request context
            with self.app.request_context(environ):
                # Skip if the path is not the same as the path in the middleware
                if not path_is_match(config["path"], request.path):
                    return next_app(environ, start_response)

                # Get resource URL if not explicitly provided
                resource_url = config["resource"] or request.url

                # Ensure output_schema and extra are objects, not null
                output_schema_obj = (
                    {} if config["output_schema"] is None else config["output_schema"]
                )

                # Construct payment details
                payment_requirements = [
                    PaymentRequirements(
                        scheme="exact",
                        network=config["network"],
                        asset=asset_address,
                        max_amount_required=max_amount_required,
                        resource=resource_url,
                        description=config["description"],
                        mime_type=config["mime_type"],
                        pay_to=config["pay_to_address"],
                        max_timeout_seconds=config["max_deadline_seconds"],
                        output_schema=output_schema_obj,
                        extra=eip712_domain,
                    )
                ]

                def x402_response(error: str):
                    """Create a 402 response with payment requirements."""
                    response_data = x402PaymentRequiredResponse(
                        x402_version=x402_VERSION,
                        accepts=payment_requirements,
                        error=error,
                    ).model_dump(by_alias=True)

                    status = "402 Payment Required"
                    headers = [
                        ("Content-Type", "application/json"),
                        ("Content-Length", str(len(json.dumps(response_data)))),
                    ]

                    start_response(status, headers)
                    return [json.dumps(response_data).encode("utf-8")]

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
                        if req.scheme == payment.scheme
                        and req.network == payment.network
                    ),
                    None,
                )

                if not selected_payment_requirements:
                    return x402_response("No matching payment requirements found")

                # Verify payment (async call in sync context)
                import asyncio

                try:
                    loop = asyncio.new_event_loop()
                    asyncio.set_event_loop(loop)
                    verify_response = loop.run_until_complete(
                        facilitator.verify(payment, selected_payment_requirements)
                    )
                finally:
                    loop.close()

                if not verify_response.is_valid:
                    return x402_response(
                        "Invalid payment: " + verify_response.invalid_reason
                    )

                # Store payment details in Flask g object
                g.payment_details = selected_payment_requirements
                g.verify_response = verify_response

                # Create response wrapper to capture status and headers
                response_wrapper = ResponseWrapper(start_response)

                # Process the request
                response = next_app(environ, response_wrapper)

                # Check if response is successful (2xx status code)
                if (
                    response_wrapper.status_code >= 200
                    and response_wrapper.status_code < 300
                ):
                    # Settle the payment for successful responses
                    try:
                        loop = asyncio.new_event_loop()
                        asyncio.set_event_loop(loop)
                        settle_response = loop.run_until_complete(
                            facilitator.settle(payment, selected_payment_requirements)
                        )

                        if settle_response.success:
                            # Add settlement response header
                            settlement_header = base64.b64encode(
                                settle_response.model_dump_json().encode("utf-8")
                            ).decode("utf-8")
                            response_wrapper.add_header(
                                "X-PAYMENT-RESPONSE", settlement_header
                            )
                        else:
                            # If settlement fails, we can't return a new response since headers are already sent
                            # Just log the error and continue with the original response
                            print(f"Settle failed: {settle_response.error_reason}")
                    except Exception as e:
                        # Log the error but don't try to return a new response
                        print(f"Settle failed: {str(e)}")
                    finally:
                        loop.close()

                return response

        return middleware
