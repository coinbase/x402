"""Core integration tests for x402Client, x402ResourceServer, and x402Facilitator.

These tests verify the full payment flow using a mock "cash" scheme.
"""

import asyncio
import pytest

from x402 import x402Client, x402Facilitator, x402ResourceServer
from x402.http import (
    HTTPRequestContext,
    decode_payment_required_header,
    x402HTTPClient,
    x402HTTPResourceServer,
)
from x402.schemas import Price, ResourceInfo

from ..mocks import (
    CashFacilitatorClient,
    CashSchemeNetworkClient,
    CashSchemeNetworkFacilitator,
    CashSchemeNetworkServer,
    build_cash_payment_requirements,
)


class TestCoreIntegration:
    """Integration tests for the core x402 components."""

    def setup_method(self) -> None:
        """Set up test fixtures.

        Creates:
        - x402Client with cash scheme registered
        - x402Facilitator with cash scheme registered
        - x402ResourceServer with facilitator client and cash scheme
        """
        # Client with cash scheme
        self.client = x402Client().register(
            "x402:cash",
            CashSchemeNetworkClient("John"),
        )

        # Facilitator with cash scheme
        self.facilitator = x402Facilitator().register(
            ["x402:cash"],
            CashSchemeNetworkFacilitator(),
        )

        # FacilitatorClient that wraps the facilitator
        facilitator_client = CashFacilitatorClient(self.facilitator)

        # Server with facilitator client and cash scheme
        self.server = x402ResourceServer(facilitator_client)
        self.server.register("x402:cash", CashSchemeNetworkServer())
        self.server.initialize()  # Fetch supported kinds

    def test_server_should_successfully_verify_and_settle_cash_payment_from_client(
        self,
    ) -> None:
        """Test the complete payment flow: client creates payload, server verifies and settles."""
        # Server - builds PaymentRequired response
        accepts = [build_cash_payment_requirements("Company Co.", "USD", "1")]
        resource = ResourceInfo(
            url="https://company.co",
            description="Company Co. resource",
            mime_type="application/json",
        )
        payment_required = self.server.create_payment_required_response(
            accepts,
            resource,
        )

        # Client - responds with PaymentPayload
        payment_payload = self.client.create_payment_payload(payment_required)

        # Server - maps payment payload to payment requirements
        accepted = self.server.find_matching_requirements(accepts, payment_payload)
        assert accepted is not None

        # Server - verifies the payment
        verify_response = self.server.verify_payment(payment_payload, accepted)
        assert verify_response.is_valid is True
        assert verify_response.payer == "~John"

        # Server does work here...

        # Server - settles the payment
        settle_response = self.server.settle_payment(payment_payload, accepted)
        assert settle_response.success is True
        assert "John transferred 1 USD to Company Co." in settle_response.transaction

    def test_client_creates_valid_payment_payload(self) -> None:
        """Test that client creates a properly structured payment payload."""
        accepts = [build_cash_payment_requirements("Merchant", "USD", "10")]
        payment_required = self.server.create_payment_required_response(accepts)

        payload = self.client.create_payment_payload(payment_required)

        assert payload.x402_version == 2
        assert payload.accepted.scheme == "cash"
        assert payload.accepted.network == "x402:cash"
        assert payload.accepted.amount == "10"
        assert payload.accepted.pay_to == "Merchant"
        assert payload.payload["signature"] == "~John"
        assert payload.payload["name"] == "John"
        assert "validUntil" in payload.payload

    def test_facilitator_verify_and_settle_directly(self) -> None:
        """Test that facilitator can verify and settle payments directly."""
        requirements = build_cash_payment_requirements("Recipient", "USD", "5")

        # Create payload using client
        payment_required = self.server.create_payment_required_response([requirements])
        payload = self.client.create_payment_payload(payment_required)

        # Verify directly with facilitator
        verify_result = self.facilitator.verify(payload, payload.accepted)
        assert verify_result.is_valid is True

        # Settle directly with facilitator
        settle_result = self.facilitator.settle(payload, payload.accepted)
        assert settle_result.success is True
        assert settle_result.network == "x402:cash"

    def test_invalid_signature_fails_verification(self) -> None:
        """Test that invalid signatures fail verification."""
        requirements = build_cash_payment_requirements("Recipient", "USD", "5")

        # Create payload and tamper with signature
        payment_required = self.server.create_payment_required_response([requirements])
        payload = self.client.create_payment_payload(payment_required)

        # Tamper with the payload
        payload.payload["signature"] = "~Hacker"

        verify_result = self.server.verify_payment(payload, requirements)
        assert verify_result.is_valid is False
        assert verify_result.invalid_reason == "invalid_signature"

    def test_server_find_matching_requirements_returns_none_for_mismatch(self) -> None:
        """Test that findMatchingRequirements returns None when no match."""
        accepts = [build_cash_payment_requirements("Company A", "USD", "1")]
        payment_required = self.server.create_payment_required_response(accepts)

        payload = self.client.create_payment_payload(payment_required)

        # Try to match against different requirements
        different_accepts = [build_cash_payment_requirements("Company B", "USD", "99")]
        result = self.server.find_matching_requirements(different_accepts, payload)

        assert result is None

    def test_facilitator_get_supported(self) -> None:
        """Test that facilitator returns supported kinds."""
        supported = self.facilitator.get_supported()

        assert len(supported.kinds) == 1
        assert supported.kinds[0].scheme == "cash"
        assert supported.kinds[0].network == "x402:cash"
        assert supported.kinds[0].x402_version == 2

    def test_multiple_payment_requirements(self) -> None:
        """Test server with multiple payment requirements."""
        accepts = [
            build_cash_payment_requirements("Merchant A", "USD", "10"),
            build_cash_payment_requirements("Merchant B", "EUR", "20"),
        ]
        payment_required = self.server.create_payment_required_response(accepts)

        # Client selects first matching requirement
        payload = self.client.create_payment_payload(payment_required)

        # Should match the first one
        assert payload.accepted.pay_to == "Merchant A"
        assert payload.accepted.amount == "10"


class TestServerInitialization:
    """Tests for x402ResourceServer initialization."""

    def test_server_requires_initialization(self) -> None:
        """Test that server raises error if not initialized."""
        facilitator = x402Facilitator().register(
            ["x402:cash"],
            CashSchemeNetworkFacilitator(),
        )
        facilitator_client = CashFacilitatorClient(facilitator)

        server = x402ResourceServer(facilitator_client)
        server.register("x402:cash", CashSchemeNetworkServer())

        # Don't call initialize()

        requirements = build_cash_payment_requirements("Test", "USD", "1")
        payment_required = server.create_payment_required_response([requirements])

        client = x402Client().register("x402:cash", CashSchemeNetworkClient("Test"))
        payload = client.create_payment_payload(payment_required)

        with pytest.raises(RuntimeError, match="not initialized"):
            server.verify_payment(payload, requirements)


class TestClientPolicies:
    """Tests for x402Client payment policies."""

    def setup_method(self) -> None:
        """Set up test fixtures."""
        self.facilitator = x402Facilitator().register(
            ["x402:cash"],
            CashSchemeNetworkFacilitator(),
        )
        facilitator_client = CashFacilitatorClient(self.facilitator)
        self.server = x402ResourceServer(facilitator_client)
        self.server.register("x402:cash", CashSchemeNetworkServer())
        self.server.initialize()

    def test_prefer_network_policy(self) -> None:
        """Test that prefer_network policy affects requirement selection."""
        from x402 import prefer_network

        # Register same scheme for two networks
        client = (
            x402Client()
            .register("x402:cash", CashSchemeNetworkClient("John"))
            .register("x402:other", CashSchemeNetworkClient("John"))
            .register_policy(prefer_network("x402:other"))
        )

        # Create requirements for both networks
        # Note: Only x402:cash is supported by our server/facilitator
        accepts = [build_cash_payment_requirements("Test", "USD", "1")]
        payment_required = self.server.create_payment_required_response(accepts)

        payload = client.create_payment_payload(payment_required)

        # Should still select x402:cash since it's the only supported one
        assert payload.accepted.network == "x402:cash"


class TestHooks:
    """Tests for x402 component hooks."""

    def setup_method(self) -> None:
        """Set up test fixtures."""
        self.facilitator = x402Facilitator().register(
            ["x402:cash"],
            CashSchemeNetworkFacilitator(),
        )
        facilitator_client = CashFacilitatorClient(self.facilitator)
        self.server = x402ResourceServer(facilitator_client)
        self.server.register("x402:cash", CashSchemeNetworkServer())
        self.server.initialize()

    def test_client_after_payment_creation_hook(self) -> None:
        """Test that after_payment_creation hook is called."""
        hook_called = False
        received_payload = None

        def after_hook(context):
            nonlocal hook_called, received_payload
            hook_called = True
            received_payload = context.payment_payload

        client = (
            x402Client()
            .register("x402:cash", CashSchemeNetworkClient("John"))
            .on_after_payment_creation(after_hook)
        )

        accepts = [build_cash_payment_requirements("Test", "USD", "1")]
        payment_required = self.server.create_payment_required_response(accepts)

        payload = client.create_payment_payload(payment_required)

        assert hook_called is True
        assert received_payload is not None
        assert received_payload.accepted.pay_to == "Test"

        assert payload is not None
        assert payload.accepted.pay_to == "Test"
        assert payload == received_payload

    def test_server_after_verify_hook(self) -> None:
        """Test that after_verify hook is called on successful verification."""
        hook_called = False
        received_result = None

        def after_hook(context):
            nonlocal hook_called, received_result
            hook_called = True
            received_result = context.result

        self.server.on_after_verify(after_hook)

        client = x402Client().register("x402:cash", CashSchemeNetworkClient("John"))

        accepts = [build_cash_payment_requirements("Test", "USD", "1")]
        payment_required = self.server.create_payment_required_response(accepts)
        payload = client.create_payment_payload(payment_required)

        self.server.verify_payment(payload, accepts[0])

        assert hook_called is True
        assert received_result is not None
        assert received_result.is_valid is True


# =============================================================================
# HTTP Integration Tests
# =============================================================================


class MockHTTPAdapter:
    """Mock HTTP adapter for testing."""

    def __init__(
        self,
        path: str,
        method: str,
        headers: dict[str, str] | None = None,
        query_params: dict[str, str] | None = None,
        body: dict | None = None,
    ) -> None:
        self._path = path
        self._method = method
        self._headers = {k.lower(): v for k, v in (headers or {}).items()}
        self._query_params = query_params or {}
        self._body = body or {}

    def get_header(self, name: str) -> str | None:
        return self._headers.get(name.lower())

    def get_method(self) -> str:
        return self._method

    def get_path(self) -> str:
        return self._path

    def get_url(self) -> str:
        query_string = (
            "?" + "&".join(f"{k}={v}" for k, v in self._query_params.items())
            if self._query_params
            else ""
        )
        return f"https://example.com{self._path}{query_string}"

    def get_accept_header(self) -> str:
        return self._headers.get("accept", "application/json")

    def get_user_agent(self) -> str:
        return self._headers.get("user-agent", "TestClient/1.0")

    def get_query_params(self) -> dict[str, str]:
        return self._query_params

    def get_query_param(self, name: str) -> str | None:
        return self._query_params.get(name)

    def get_body(self):
        return self._body


class TestHTTPIntegration:
    """Integration tests for x402HTTPClient and x402HTTPResourceServer."""

    def setup_method(self) -> None:
        """Set up test fixtures."""
        # Create facilitator
        self.facilitator = x402Facilitator().register(
            ["x402:cash"],
            CashSchemeNetworkFacilitator(),
        )
        facilitator_client = CashFacilitatorClient(self.facilitator)

        # Create core client and wrap with HTTP client
        payment_client = x402Client().register(
            "x402:cash",
            CashSchemeNetworkClient("John"),
        )
        self.http_client = x402HTTPClient(payment_client)

        # Create resource server
        resource_server = x402ResourceServer(facilitator_client)
        resource_server.register("x402:cash", CashSchemeNetworkServer())
        resource_server.initialize()

        # Create HTTP server with routes
        routes = {
            "/api/protected": {
                "accepts": {
                    "scheme": "cash",
                    "payTo": "merchant@example.com",
                    "price": "$0.10",
                    "network": "x402:cash",
                },
                "description": "Access to protected API",
                "mimeType": "application/json",
            },
        }
        self.http_server = x402HTTPResourceServer(resource_server, routes)

    def test_middleware_verify_and_settle_cash_payment(self) -> None:
        """Test the full HTTP flow: 402 response, payment creation, retry, settlement."""
        # Initial request - no payment
        mock_adapter = MockHTTPAdapter(
            path="/api/protected",
            method="GET",
        )
        context = HTTPRequestContext(
            adapter=mock_adapter,
            path="/api/protected",
            method="GET",
        )

        # Should return 402
        result = asyncio.run(self.http_server.process_http_request(context))
        assert result.type == "payment-error"
        assert result.response is not None
        assert result.response.status == 402
        assert "PAYMENT-REQUIRED" in result.response.headers
        assert result.response.is_html is False
        assert result.response.body == {}

        # Client parses 402 and creates payment
        payment_required = self.http_client.get_payment_required_response(
            lambda name: result.response.headers.get(name),
            result.response.body,
        )
        payment_payload = self.http_client.create_payment_payload(payment_required)
        request_headers = self.http_client.encode_payment_signature_header(
            payment_payload
        )

        # Retry with payment
        mock_adapter_with_payment = MockHTTPAdapter(
            path="/api/protected",
            method="GET",
            headers=request_headers,
        )
        context_with_payment = HTTPRequestContext(
            adapter=mock_adapter_with_payment,
            path="/api/protected",
            method="GET",
        )

        result2 = asyncio.run(
            self.http_server.process_http_request(context_with_payment)
        )
        assert result2.type == "payment-verified"
        assert result2.payment_payload is not None
        assert result2.payment_requirements is not None

        # Process settlement
        settlement = self.http_server.process_settlement(
            result2.payment_payload,
            result2.payment_requirements,
        )
        assert settlement.success is True
        assert "PAYMENT-RESPONSE" in settlement.headers

    def test_no_payment_required_for_unprotected_route(self) -> None:
        """Test that unprotected routes don't require payment."""
        mock_adapter = MockHTTPAdapter(
            path="/api/unprotected",
            method="GET",
        )
        context = HTTPRequestContext(
            adapter=mock_adapter,
            path="/api/unprotected",
            method="GET",
        )

        result = asyncio.run(self.http_server.process_http_request(context))
        assert result.type == "no-payment-required"


class TestDynamicPricing:
    """Tests for dynamic pricing based on request context."""

    def setup_method(self) -> None:
        """Set up test fixtures."""
        self.facilitator = x402Facilitator().register(
            ["x402:cash"],
            CashSchemeNetworkFacilitator(),
        )
        facilitator_client = CashFacilitatorClient(self.facilitator)

        resource_server = x402ResourceServer(facilitator_client)
        resource_server.register("x402:cash", CashSchemeNetworkServer())
        resource_server.initialize()
        self.resource_server = resource_server

    def test_dynamic_price_from_query_params(self) -> None:
        """Test that price can be dynamically computed from query params."""

        async def dynamic_price(context: HTTPRequestContext) -> Price:
            tier = context.adapter.get_query_param("tier")
            if tier == "premium":
                return "$0.01"
            if tier == "business":
                return "$0.05"
            return "$0.10"

        routes = {
            "GET /api/data": {
                "accepts": {
                    "scheme": "cash",
                    "network": "x402:cash",
                    "payTo": "merchant@example.com",
                    "price": dynamic_price,
                },
                "description": "Tiered API access",
            },
        }

        http_server = x402HTTPResourceServer(self.resource_server, routes)

        # Test premium tier
        premium_adapter = MockHTTPAdapter(
            path="/api/data",
            method="GET",
            query_params={"tier": "premium"},
        )
        premium_context = HTTPRequestContext(
            adapter=premium_adapter,
            path="/api/data",
            method="GET",
        )
        result = asyncio.run(http_server.process_http_request(premium_context))
        assert result.type == "payment-error"
        payment_required = decode_payment_required_header(
            result.response.headers["PAYMENT-REQUIRED"]
        )
        assert payment_required.accepts[0].amount == "0.01"

        # Test business tier
        business_adapter = MockHTTPAdapter(
            path="/api/data",
            method="GET",
            query_params={"tier": "business"},
        )
        business_context = HTTPRequestContext(
            adapter=business_adapter,
            path="/api/data",
            method="GET",
        )
        result2 = asyncio.run(http_server.process_http_request(business_context))
        payment_required2 = decode_payment_required_header(
            result2.response.headers["PAYMENT-REQUIRED"]
        )
        assert payment_required2.accepts[0].amount == "0.05"

        # Test default tier
        default_adapter = MockHTTPAdapter(
            path="/api/data",
            method="GET",
        )
        default_context = HTTPRequestContext(
            adapter=default_adapter,
            path="/api/data",
            method="GET",
        )
        result3 = asyncio.run(http_server.process_http_request(default_context))
        payment_required3 = decode_payment_required_header(
            result3.response.headers["PAYMENT-REQUIRED"]
        )
        assert payment_required3.accepts[0].amount == "0.10"

    def test_dynamic_pay_to_from_headers(self) -> None:
        """Test that payTo can be dynamically computed from headers."""

        async def dynamic_pay_to(context: HTTPRequestContext) -> str:
            region = context.adapter.get_header("x-region")
            addresses = {
                "us": "merchant-us@example.com",
                "eu": "merchant-eu@example.com",
                "asia": "merchant-asia@example.com",
            }
            return addresses.get(region or "us", "merchant-default@example.com")

        routes = {
            "POST /api/process": {
                "accepts": {
                    "scheme": "cash",
                    "network": "x402:cash",
                    "price": "$0.50",
                    "payTo": dynamic_pay_to,
                },
                "description": "Regional payment routing",
            },
        }

        http_server = x402HTTPResourceServer(self.resource_server, routes)

        # Test US region
        us_adapter = MockHTTPAdapter(
            path="/api/process",
            method="POST",
            headers={"x-region": "us"},
        )
        us_context = HTTPRequestContext(
            adapter=us_adapter,
            path="/api/process",
            method="POST",
        )
        result = asyncio.run(http_server.process_http_request(us_context))
        payment_required = decode_payment_required_header(
            result.response.headers["PAYMENT-REQUIRED"]
        )
        assert payment_required.accepts[0].pay_to == "merchant-us@example.com"

        # Test EU region
        eu_adapter = MockHTTPAdapter(
            path="/api/process",
            method="POST",
            headers={"x-region": "eu"},
        )
        eu_context = HTTPRequestContext(
            adapter=eu_adapter,
            path="/api/process",
            method="POST",
        )
        result2 = asyncio.run(http_server.process_http_request(eu_context))
        payment_required2 = decode_payment_required_header(
            result2.response.headers["PAYMENT-REQUIRED"]
        )
        assert payment_required2.accepts[0].pay_to == "merchant-eu@example.com"

    def test_combined_dynamic_pricing_and_pay_to(self) -> None:
        """Test that both price and payTo can be dynamic."""

        async def dynamic_pay_to(context: HTTPRequestContext) -> str:
            source = context.adapter.get_query_param("source")
            if source == "blockchain":
                return "blockchain-provider@example.com"
            if source == "market":
                return "market-data-provider@example.com"
            return "default-provider@example.com"

        async def dynamic_price(context: HTTPRequestContext) -> Price:
            subscription = context.adapter.get_header("x-subscription")
            range_param = context.adapter.get_query_param("range") or "1d"

            base_price = 0.1 if subscription == "pro" else 0.5

            range_multipliers = {
                "1d": 1,
                "7d": 3,
                "30d": 10,
                "1y": 50,
            }

            multiplier = range_multipliers.get(range_param, 1)
            final_price = base_price * multiplier

            return f"${final_price:.2f}"

        routes = {
            "GET /api/premium-data": {
                "accepts": {
                    "scheme": "cash",
                    "network": "x402:cash",
                    "payTo": dynamic_pay_to,
                    "price": dynamic_price,
                },
                "description": "Premium data API with complex pricing",
            },
        }

        http_server = x402HTTPResourceServer(self.resource_server, routes)

        # Pro subscription, 30-day data, blockchain source
        adapter = MockHTTPAdapter(
            path="/api/premium-data",
            method="GET",
            headers={"x-subscription": "pro"},
            query_params={"source": "blockchain", "range": "30d"},
        )
        context = HTTPRequestContext(
            adapter=adapter,
            path="/api/premium-data",
            method="GET",
        )
        result = asyncio.run(http_server.process_http_request(context))
        payment_required = decode_payment_required_header(
            result.response.headers["PAYMENT-REQUIRED"]
        )

        assert payment_required.accepts[0].pay_to == "blockchain-provider@example.com"
        assert payment_required.accepts[0].amount == "1.00"  # 0.1 * 10

        # Free subscription, 7-day data, market source
        free_adapter = MockHTTPAdapter(
            path="/api/premium-data",
            method="GET",
            headers={"x-subscription": "free"},
            query_params={"source": "market", "range": "7d"},
        )
        free_context = HTTPRequestContext(
            adapter=free_adapter,
            path="/api/premium-data",
            method="GET",
        )
        result2 = asyncio.run(http_server.process_http_request(free_context))
        payment_required2 = decode_payment_required_header(
            result2.response.headers["PAYMENT-REQUIRED"]
        )

        assert payment_required2.accepts[0].pay_to == "market-data-provider@example.com"
        assert payment_required2.accepts[0].amount == "1.50"  # 0.5 * 3
