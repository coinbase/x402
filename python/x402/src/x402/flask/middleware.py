import base64
import json
from typing import Any, Dict, Optional, Union, cast, get_args

from flask import Flask, g, request

from x402.common import (
    find_matching_payment_requirements,
    process_price_to_atomic_amount,
    x402_VERSION,
)
from x402.encoding import safe_base64_decode
from x402.facilitator import FacilitatorClient, FacilitatorConfig
from x402.path import path_is_match
from x402.paywall import get_paywall_html, is_browser_request
from x402.types import (
    PaymentPayload,
    PaymentRequirements,
    PaywallConfig,
    Price,
    SupportedNetworks,
    x402PaymentRequiredResponse,
)


class ResponseWrapper:
    """Wrapper to capture and buffer response for settlement logic."""

    def __init__(self, start_response):
        self.original_start_response = start_response
        self.status_code = None
        self.status = None
        self.headers = []
        self.write_callable_chunks = []

    def __call__(self, status, headers, exc_info=None):
        # Buffer the status, headers and write callable chunks
        self.status = status
        self.status_code = int(status.split()[0])
        self.headers = list(headers)

        def buffered_write(data):
            if data:
                self.write_callable_chunks.append(data)

        return buffered_write

    def add_header(self, name, value):
        """Add a header to the response."""
        self.headers.append((name, value))

    def send_response(self, body_chunks):
        """Send the buffered response after settlement."""
        write = self.original_start_response(self.status, self.headers)
        # Send data written via write callable first
        for chunk in self.write_callable_chunks:
            if chunk:
                write(chunk)
        # Then send data from response iterator
        for chunk in body_chunks:
            if chunk:
                write(chunk)


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
        self.original_wsgi_app = app.wsgi_app

    def add(
        self,
        price: Price,
        pay_to_address: str,
        path: Union[str, list[str]] = "*",
        description: str = "",
        mime_type: str = "",
        max_deadline_seconds: int = 60,
        facilitator_config: Optional[FacilitatorConfig] = None,
        network: str = "eip155:84532",
        resource: Optional[str] = None,
        paywall_config: Optional[PaywallConfig] = None,
        custom_paywall_html: Optional[str] = None,
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
            facilitator_config (dict, optional): Facilitator config
            network (str, optional): Network ID. Defaults to "eip155:84532".
            resource (str, optional): Resource URL
            paywall_config (PaywallConfig, optional): Paywall UI customization config
            custom_paywall_html (str, optional): Custom HTML to display for paywall instead of default
        """

        # Validate facilitator config for Mainnet
        if network == "eip155:8453" and not facilitator_config:
            raise ValueError(
                "Facilitator configuration is required for Base Mainnet (eip155:8453)."
            )

        config = {
            "price": price,
            "pay_to_address": pay_to_address,
            "path": path,
            "description": description,
            "mime_type": mime_type,
            "max_deadline_seconds": max_deadline_seconds,
            "facilitator_config": facilitator_config,
            "network": network,
            "resource": resource,
            "paywall_config": paywall_config,
            "custom_paywall_html": custom_paywall_html,
        }
        self.middleware_configs.append(config)

        # Apply the middleware to the app
        self._apply_middleware()

    def _apply_middleware(self):
        """Apply all middleware configurations to the Flask app."""
        current_wsgi_app = self.original_wsgi_app

        for config in self.middleware_configs:
            middleware = self._create_middleware(config, current_wsgi_app)
            current_wsgi_app = middleware

        self.app.wsgi_app = current_wsgi_app

    def _create_middleware(self, config: Dict[str, Any], next_app):
        """Create a WSGI middleware function for the given configuration."""

        # Validate network is supported
        supported_networks = get_args(SupportedNetworks)
        if config["network"] not in supported_networks:
            raise ValueError(
                f"Unsupported network: {config['network']}. Must be one of: {supported_networks}"
            )

        # Process price configuration
        try:
            amount, asset_address, eip712_domain = process_price_to_atomic_amount(
                config["price"], config["network"]
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

                # Construct payment details
                payment_requirements = [
                    PaymentRequirements(
                        scheme="exact",
                        network=cast(SupportedNetworks, config["network"]),
                        asset=asset_address,
                        amount=amount,
                        pay_to=config["pay_to_address"],
                        max_timeout_seconds=config["max_deadline_seconds"],
                        extra=eip712_domain,
                    )
                ]

                def x402_response(error: str):
                    """Create a 402 response with payment requirements."""
                    request_headers = dict(request.headers)
                    status = "402 Payment Required"

                    if is_browser_request(request_headers):
                        html_content = config[
                            "custom_paywall_html"
                        ] or get_paywall_html(
                            error, payment_requirements, config["paywall_config"]
                        )
                        headers = [("Content-Type", "text/html; charset=utf-8")]

                        start_response(status, headers)
                        return [html_content.encode("utf-8")]
                    else:
                        response_data = x402PaymentRequiredResponse(
                            x402_version=x402_VERSION,
                            accepts=payment_requirements,
                            error=error,
                        ).model_dump(by_alias=True)

                        # v2 requires payment requirements in PAYMENT-REQUIRED header (base64)
                        req_json = json.dumps(response_data)
                        b64_req = base64.b64encode(req_json.encode("utf-8")).decode(
                            "utf-8"
                        )

                        headers = [
                            ("Content-Type", "application/json"),
                            ("PAYMENT-REQUIRED", b64_req),
                            ("Content-Length", str(len(json.dumps(response_data)))),
                        ]

                        start_response(status, headers)
                        return [json.dumps(response_data).encode("utf-8")]

                # Check for payment header
                payment_header = request.headers.get("PAYMENT-SIGNATURE", "")

                if payment_header == "":
                    return x402_response("No PAYMENT-SIGNATURE header provided")

                # Decode payment header
                try:
                    payment_dict = json.loads(safe_base64_decode(payment_header))
                    payment = PaymentPayload(**payment_dict)
                except Exception as e:
                    return x402_response(f"Invalid payment header format: {str(e)}")

                # Find matching payment requirements
                selected_payment_requirements = find_matching_payment_requirements(
                    payment_requirements, payment
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
                    error_reason = verify_response.invalid_reason or "Unknown error"
                    return x402_response(f"Invalid payment: {error_reason}")

                # Store payment details in Flask g object
                g.payment_details = selected_payment_requirements
                g.verify_response = verify_response

                # Create response wrapper to capture status and headers
                response_wrapper = ResponseWrapper(start_response)

                # Process the request and buffer all response chunks
                response_body_chunks = []
                for chunk in next_app(environ, response_wrapper):
                    response_body_chunks.append(chunk)

                # Check if response is successful (2xx status code)
                if (
                    response_wrapper.status_code is not None
                    and response_wrapper.status_code >= 200
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
                            settle_json = settle_response.model_dump_json(
                                by_alias=True
                            ).encode("utf-8")
                            settlement_header = base64.b64encode(settle_json).decode(
                                "utf-8"
                            )

                            response_wrapper.add_header(
                                "PAYMENT-RESPONSE", settlement_header
                            )
                        else:
                            # Settlement failed - discard buffered response and return 402
                            return x402_response(
                                "Settle failed: "
                                + (settle_response.error_reason or "Unknown error")
                            )
                    except Exception as e:
                        # Settlement error - discard buffered response and return 402
                        return x402_response(
                            "Settle failed: " + (str(e) or "Unknown error")
                        )
                    finally:
                        loop.close()

                # Send the buffered response
                response_wrapper.send_response(response_body_chunks)
                return []

        return middleware
