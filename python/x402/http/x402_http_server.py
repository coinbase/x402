"""HTTP-enhanced resource server for x402 protocol."""

from __future__ import annotations

import html
import re
from typing import TYPE_CHECKING, Any, Protocol
from urllib.parse import unquote

from ..schemas import (
    PaymentPayload,
    PaymentRequired,
    PaymentRequirements,
    ResourceInfo,
    SettleResponse,
)
from ..schemas.v1 import PaymentPayloadV1
from .constants import PAYMENT_REQUIRED_HEADER, PAYMENT_SIGNATURE_HEADER
from .types import (
    RESULT_NO_PAYMENT_REQUIRED,
    RESULT_PAYMENT_ERROR,
    RESULT_PAYMENT_VERIFIED,
    CompiledRoute,
    HTTPAdapter,
    HTTPProcessResult,
    HTTPRequestContext,
    HTTPResponseInstructions,
    PaymentOption,
    PaywallConfig,
    ProcessSettleResult,
    RouteConfig,
    RouteConfigurationError,
    RoutesConfig,
    RouteValidationError,
)
from .utils import (
    decode_payment_signature_header,
    encode_payment_required_header,
    encode_payment_response_header,
)

if TYPE_CHECKING:
    from ..server import x402ResourceServer


# ============================================================================
# Paywall Provider Protocol
# ============================================================================


class PaywallProvider(Protocol):
    """Protocol for custom paywall HTML generation."""

    def generate_html(
        self,
        payment_required: PaymentRequired,
        config: PaywallConfig | None = None,
    ) -> str:
        """Generate HTML for the paywall.

        Args:
            payment_required: Payment requirements.
            config: Optional paywall configuration.

        Returns:
            HTML string.
        """
        ...


# ============================================================================
# x402HTTPResourceServer
# ============================================================================


class x402HTTPResourceServer:
    """HTTP-enhanced x402 resource server.

    Provides framework-agnostic HTTP protocol handling for payment-protected
    resources. Use with framework-specific middleware (FastAPI, Flask, etc.)
    """

    def __init__(
        self,
        server: x402ResourceServer,
        routes: RoutesConfig,
    ) -> None:
        """Create HTTP resource server.

        Args:
            server: Core x402ResourceServer instance.
            routes: Route configuration for payment-protected endpoints.
        """
        self._server = server
        self._routes_config = routes
        self._compiled_routes: list[CompiledRoute] = []
        self._paywall_provider: PaywallProvider | None = None

        # Compile routes
        self._compile_routes(routes)

    def _compile_routes(self, routes: RoutesConfig) -> None:
        """Compile route patterns to regex for matching."""
        normalized: dict[str, RouteConfig] = {}

        if isinstance(routes, RouteConfig):
            # Single RouteConfig instance - apply to all paths
            normalized = {"*": routes}
        elif isinstance(routes, dict):
            # Check if it's a single route config dict (has "accepts" key)
            # or a dict of path -> config
            if "accepts" in routes:
                # Single route config dict - apply to all paths
                normalized = {"*": self._parse_route_config(routes)}  # type: ignore
            else:
                # Dict of path -> config
                for pattern, config in routes.items():
                    if isinstance(config, RouteConfig):
                        normalized[pattern] = config
                    elif isinstance(config, dict):
                        normalized[pattern] = self._parse_route_config(config)
                    else:
                        raise ValueError(f"Invalid route config for pattern {pattern}")

        for pattern, config in normalized.items():
            verb, regex = self._parse_route_pattern(pattern)
            self._compiled_routes.append(
                CompiledRoute(
                    verb=verb,
                    regex=regex,
                    config=config,
                )
            )

    def _parse_route_config(self, config: dict[str, Any]) -> RouteConfig:
        """Parse a raw dict into a RouteConfig."""
        accepts = config.get("accepts", [])

        # Handle single accepts dict vs list
        if isinstance(accepts, dict):
            accepts = [accepts]

        # Convert to PaymentOption objects
        payment_options = []
        for acc in accepts:
            if isinstance(acc, PaymentOption):
                payment_options.append(acc)
            else:
                payment_options.append(
                    PaymentOption(
                        scheme=acc.get("scheme", ""),
                        pay_to=acc.get("payTo", acc.get("pay_to", "")),
                        price=acc.get("price", ""),
                        network=acc.get("network", ""),
                        max_timeout_seconds=acc.get(
                            "maxTimeoutSeconds", acc.get("max_timeout_seconds")
                        ),
                        extra=acc.get("extra"),
                    )
                )

        return RouteConfig(
            accepts=payment_options,
            resource=config.get("resource"),
            description=config.get("description"),
            mime_type=config.get("mimeType", config.get("mime_type")),
            custom_paywall_html=config.get("customPaywallHtml", config.get("custom_paywall_html")),
            unpaid_response_body=config.get(
                "unpaidResponseBody", config.get("unpaid_response_body")
            ),
            extensions=config.get("extensions"),
        )

    # =========================================================================
    # Initialization
    # =========================================================================

    def initialize(self) -> None:
        """Initialize the HTTP resource server.

        Initializes underlying resource server (fetches facilitator support)
        and validates route configuration.

        Raises:
            RouteConfigurationError: If any route's payment options don't have
                corresponding registered schemes or facilitator support.
        """
        # Initialize underlying server
        self._server.initialize()

        # Validate routes
        errors = self._validate_route_configuration()
        if errors:
            raise RouteConfigurationError(errors)

    def register_paywall_provider(self, provider: PaywallProvider) -> x402HTTPResourceServer:
        """Register custom paywall provider for HTML generation.

        Args:
            provider: PaywallProvider instance.

        Returns:
            Self for chaining.
        """
        self._paywall_provider = provider
        return self

    # =========================================================================
    # Request Processing
    # =========================================================================

    def process_http_request(
        self,
        context: HTTPRequestContext,
        paywall_config: PaywallConfig | None = None,
    ) -> HTTPProcessResult:
        """Process HTTP request and return result.

        Main entry point for framework middleware.

        Args:
            context: HTTP request context.
            paywall_config: Optional paywall configuration.

        Returns:
            HTTPProcessResult indicating:
            - no-payment-required: Route doesn't require payment
            - payment-verified: Payment valid, proceed with request
            - payment-error: Return 402 response
        """
        # Find matching route
        route_config = self._get_route_config(context.path, context.method)
        if route_config is None:
            return HTTPProcessResult(type=RESULT_NO_PAYMENT_REQUIRED)

        # Extract payment from headers
        payment_payload = self._extract_payment(context.adapter)

        # Build resource info
        resource_info = ResourceInfo(
            url=route_config.resource or context.adapter.get_url(),
            description=route_config.description or "",
            mime_type=route_config.mime_type or "",
        )

        # Build requirements from payment options
        requirements = self._build_payment_requirements_from_options(
            route_config.accepts,
            context,
        )

        # Enrich extensions if present
        extensions = route_config.extensions

        # Create PaymentRequired response
        payment_required = self._server.create_payment_required_response(
            requirements,
            resource_info,
            None if payment_payload else "Payment required",
            extensions,
        )

        # No payment provided
        if payment_payload is None:
            unpaid_body = None
            if route_config.unpaid_response_body:
                unpaid_body = route_config.unpaid_response_body(context)

            return HTTPProcessResult(
                type=RESULT_PAYMENT_ERROR,
                response=self._create_http_response(
                    payment_required,
                    is_web_browser=self._is_web_browser(context.adapter),
                    paywall_config=paywall_config,
                    custom_html=route_config.custom_paywall_html,
                    unpaid_response=unpaid_body,
                ),
            )

        # Find matching requirements
        matching_reqs = self._server.find_matching_requirements(
            payment_required.accepts,
            payment_payload,
        )

        if matching_reqs is None:
            return HTTPProcessResult(
                type=RESULT_PAYMENT_ERROR,
                response=self._create_http_response(
                    self._server.create_payment_required_response(
                        requirements,
                        resource_info,
                        "No matching payment requirements",
                        extensions,
                    ),
                    is_web_browser=False,
                    paywall_config=paywall_config,
                ),
            )

        # Verify payment
        try:
            verify_result = self._server.verify_payment(
                payment_payload,
                matching_reqs,
            )

            if not verify_result.is_valid:
                return HTTPProcessResult(
                    type=RESULT_PAYMENT_ERROR,
                    response=self._create_http_response(
                        self._server.create_payment_required_response(
                            requirements,
                            resource_info,
                            verify_result.invalid_reason,
                            extensions,
                        ),
                        is_web_browser=False,
                        paywall_config=paywall_config,
                    ),
                )

            # Payment valid
            return HTTPProcessResult(
                type=RESULT_PAYMENT_VERIFIED,
                payment_payload=payment_payload,
                payment_requirements=matching_reqs,
            )

        except Exception as e:
            return HTTPProcessResult(
                type=RESULT_PAYMENT_ERROR,
                response=self._create_http_response(
                    self._server.create_payment_required_response(
                        requirements,
                        resource_info,
                        str(e),
                        extensions,
                    ),
                    is_web_browser=False,
                    paywall_config=paywall_config,
                ),
            )

    def requires_payment(self, context: HTTPRequestContext) -> bool:
        """Check if a request requires payment.

        Args:
            context: HTTP request context.

        Returns:
            True if route requires payment.
        """
        return self._get_route_config(context.path, context.method) is not None

    # =========================================================================
    # Settlement
    # =========================================================================

    def process_settlement(
        self,
        payment_payload: PaymentPayload | PaymentPayloadV1,
        requirements: PaymentRequirements,
    ) -> ProcessSettleResult:
        """Process settlement after successful response.

        Call this after the protected resource has been served.

        Args:
            payment_payload: The verified payment payload.
            requirements: The matching payment requirements.

        Returns:
            ProcessSettleResult with headers if success.
        """
        try:
            settle_response = self._server.settle_payment(
                payment_payload,
                requirements,
            )

            if not settle_response.success:
                return ProcessSettleResult(
                    success=False,
                    error_reason=settle_response.error_reason or "Settlement failed",
                )

            return ProcessSettleResult(
                success=True,
                headers=self._create_settlement_headers(settle_response, requirements),
                transaction=settle_response.transaction,
                network=settle_response.network,
                payer=settle_response.payer,
            )

        except Exception as e:
            return ProcessSettleResult(
                success=False,
                error_reason=str(e),
            )

    # =========================================================================
    # Internal Methods
    # =========================================================================

    def _get_route_config(self, path: str, method: str) -> RouteConfig | None:
        """Find matching route configuration."""
        normalized_path = self._normalize_path(path)
        upper_method = method.upper()

        for route in self._compiled_routes:
            if route.regex.match(normalized_path):
                if route.verb == "*" or route.verb == upper_method:
                    return route.config

        return None

    def _build_payment_requirements_from_options(
        self,
        options: PaymentOption | list[PaymentOption],
        context: HTTPRequestContext,
    ) -> list[PaymentRequirements]:
        """Build payment requirements from payment options.

        Resolves dynamic payTo/price functions.
        """
        # Ensure options is a list
        if isinstance(options, PaymentOption):
            options = [options]

        all_requirements = []

        for option in options:
            # Resolve dynamic payTo
            if callable(option.pay_to):
                pay_to = option.pay_to(context)
            else:
                pay_to = option.pay_to

            # Resolve dynamic price
            if callable(option.price):
                price = option.price(context)
            else:
                price = option.price

            # Build requirements using server
            from ..server import ResourceConfig

            config = ResourceConfig(
                scheme=option.scheme,
                pay_to=pay_to,
                price=price,
                network=option.network,
                max_timeout_seconds=option.max_timeout_seconds,
            )

            requirements = self._server.build_payment_requirements(config)
            all_requirements.extend(requirements)

        return all_requirements

    def _extract_payment(self, adapter: HTTPAdapter) -> PaymentPayload | PaymentPayloadV1 | None:
        """Extract payment from HTTP headers (V2 only)."""
        # Check V2 header (case-insensitive)
        header = adapter.get_header(PAYMENT_SIGNATURE_HEADER) or adapter.get_header(
            PAYMENT_SIGNATURE_HEADER.lower()
        )

        if header:
            try:
                return decode_payment_signature_header(header)
            except Exception:
                return None

        return None

    def _is_web_browser(self, adapter: HTTPAdapter) -> bool:
        """Check if request is from a web browser."""
        accept = adapter.get_accept_header()
        user_agent = adapter.get_user_agent()
        return "text/html" in accept and "Mozilla" in user_agent

    def _create_http_response(
        self,
        payment_required: PaymentRequired,
        is_web_browser: bool,
        paywall_config: PaywallConfig | None = None,
        custom_html: str | None = None,
        unpaid_response: Any = None,
    ) -> HTTPResponseInstructions:
        """Create HTTP response instructions."""
        if is_web_browser:
            html_content = self._generate_paywall_html(
                payment_required,
                paywall_config,
                custom_html,
            )
            return HTTPResponseInstructions(
                status=402,
                headers={"Content-Type": "text/html"},
                body=html_content,
                is_html=True,
            )

        # API response
        content_type = "application/json"
        body: Any = {}

        if unpaid_response:
            content_type = unpaid_response.content_type
            body = unpaid_response.body

        return HTTPResponseInstructions(
            status=402,
            headers={
                "Content-Type": content_type,
                PAYMENT_REQUIRED_HEADER: encode_payment_required_header(payment_required),
            },
            body=body,
        )

    def _create_settlement_headers(
        self,
        settle_response: SettleResponse,
        requirements: PaymentRequirements,
    ) -> dict[str, str]:
        """Create settlement response headers."""
        from .constants import PAYMENT_RESPONSE_HEADER

        return {
            PAYMENT_RESPONSE_HEADER: encode_payment_response_header(settle_response),
        }

    def _validate_route_configuration(self) -> list[RouteValidationError]:
        """Validate all payment options have registered schemes."""
        errors: list[RouteValidationError] = []

        for route in self._compiled_routes:
            pattern = f"{route.verb} {route.regex.pattern}"

            # Get options as list
            options = route.config.accepts
            if isinstance(options, PaymentOption):
                options = [options]

            for option in options:
                # Check scheme registered
                if not self._server.has_registered_scheme(option.network, option.scheme):
                    errors.append(
                        RouteValidationError(
                            route_pattern=pattern,
                            scheme=option.scheme,
                            network=option.network,
                            reason="missing_scheme",
                            message=f'Route "{pattern}": No scheme for "{option.scheme}" on "{option.network}"',
                        )
                    )
                    continue

                # Check facilitator support
                supported_kind = self._server.get_supported_kind(2, option.network, option.scheme)
                if not supported_kind:
                    errors.append(
                        RouteValidationError(
                            route_pattern=pattern,
                            scheme=option.scheme,
                            network=option.network,
                            reason="missing_facilitator",
                            message=f'Route "{pattern}": Facilitator doesn\'t support "{option.scheme}" on "{option.network}"',
                        )
                    )

        return errors

    @staticmethod
    def _parse_route_pattern(pattern: str) -> tuple[str, re.Pattern[str]]:
        """Parse route pattern into verb and regex."""
        parts = pattern.split(None, 1)  # Split on whitespace

        if len(parts) == 2:
            verb = parts[0].upper()
            path = parts[1]
        else:
            verb = "*"
            path = pattern

        # Convert to regex
        regex_pattern = "^" + re.escape(path)
        regex_pattern = regex_pattern.replace(r"\*", ".*?")  # Wildcards
        regex_pattern = re.sub(r"\\\[([^\]]+)\\\]", r"[^/]+", regex_pattern)  # [param]
        regex_pattern += "$"

        return verb, re.compile(regex_pattern, re.IGNORECASE)

    @staticmethod
    def _normalize_path(path: str) -> str:
        """Normalize path for matching."""
        # Remove query string and fragment
        path = path.split("?")[0].split("#")[0]

        # Decode URL encoding
        try:
            path = unquote(path)
        except Exception:
            pass

        # Normalize slashes
        path = re.sub(r"/+", "/", path)
        path = path.rstrip("/")

        return path or "/"

    def _generate_paywall_html(
        self,
        payment_required: PaymentRequired,
        config: PaywallConfig | None,
        custom_html: str | None,
    ) -> str:
        """Generate HTML paywall for browser requests."""
        if custom_html:
            return custom_html

        if self._paywall_provider:
            return self._paywall_provider.generate_html(payment_required, config)

        # Fallback: Basic HTML
        display_amount = self._get_display_amount(payment_required)
        resource_desc = ""
        if payment_required.resource:
            resource_desc = payment_required.resource.description or payment_required.resource.url

        app_logo = ""
        app_name = ""
        if config:
            if config.app_logo:
                app_logo = f'<img src="{html.escape(config.app_logo)}" alt="{html.escape(config.app_name or "")}" style="max-width: 200px;">'
            app_name = config.app_name or ""

        payment_data = payment_required.model_dump_json(by_alias=True, exclude_none=True)

        title = f"{html.escape(app_name)} - Payment Required" if app_name else "Payment Required"

        return f"""<!DOCTYPE html>
<html>
<head>
    <title>{title}</title>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
</head>
<body style="max-width: 600px; margin: 50px auto; padding: 20px; font-family: system-ui;">
    {app_logo}
    <h1>{title}</h1>
    <p><strong>Resource:</strong> {html.escape(resource_desc)}</p>
    <p><strong>Amount:</strong> ${display_amount:.2f} USDC</p>
    <div id="payment-widget" data-requirements='{html.escape(payment_data)}'>
        <p style="padding: 1rem; background: #fef3c7;">
            Payment widget not available. Use an x402-compatible client.
        </p>
    </div>
</body>
</html>"""

    @staticmethod
    def _get_display_amount(payment_required: PaymentRequired) -> float:
        """Extract display amount from requirements."""
        if payment_required.accepts:
            first = payment_required.accepts[0]
            if hasattr(first, "amount") and first.amount:
                try:
                    return float(first.amount) / 1_000_000  # USDC 6 decimals
                except (ValueError, TypeError):
                    pass
        return 0.0
