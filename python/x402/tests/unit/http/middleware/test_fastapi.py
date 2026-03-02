"""Unit tests for x402.http.middleware.fastapi - FastAPI/Starlette middleware."""

from __future__ import annotations

from unittest.mock import MagicMock

import pytest

# Skip all tests if fastapi not installed
pytest.importorskip("fastapi")
from fastapi import Request
from starlette.datastructures import Headers, QueryParams

from x402.http.middleware.fastapi import (
    FastAPIAdapter,
    PaymentMiddlewareASGI,
    _check_if_bazaar_needed,
    payment_middleware,
)
from x402.http.types import (
    PaymentOption,
    RouteConfig,
)
from x402.schemas import PaymentPayload, PaymentRequirements

# =============================================================================
# Helpers
# =============================================================================


def make_payment_requirements() -> PaymentRequirements:
    """Helper to create valid PaymentRequirements."""
    return PaymentRequirements(
        scheme="exact",
        network="eip155:8453",
        asset="0x0000000000000000000000000000000000000000",
        amount="1000000",
        pay_to="0x1234567890123456789012345678901234567890",
        max_timeout_seconds=300,
    )


def make_v2_payload(signature: str = "0xmock") -> PaymentPayload:
    """Helper to create valid V2 PaymentPayload."""
    return PaymentPayload(
        x402_version=2,
        payload={"signature": signature},
        accepted=make_payment_requirements(),
    )


def make_mock_fastapi_request(
    method: str = "GET",
    path: str = "/api/test",
    headers: dict[str, str] | None = None,
    query_params: dict[str, str] | None = None,
) -> MagicMock:
    """Create a mock FastAPI Request object."""
    mock_request = MagicMock(spec=Request)
    mock_request.method = method
    mock_request.headers = Headers(headers or {})
    mock_request.query_params = QueryParams(query_params or {})
    mock_request.url = MagicMock()
    mock_request.url.path = path
    mock_request.url.__str__ = lambda self: f"https://example.com{path}"
    mock_request.state = MagicMock()
    return mock_request


# =============================================================================
# Extension Check Tests
# =============================================================================


class TestCheckIfBazaarNeeded:
    """Tests for _check_if_bazaar_needed helper."""

    def test_returns_false_for_empty_extensions(self):
        """Test that routes without extensions return False."""
        route = RouteConfig(
            accepts=PaymentOption(
                scheme="exact",
                pay_to="0x1234567890123456789012345678901234567890",
                price="$0.01",
                network="eip155:8453",
            ),
        )
        assert _check_if_bazaar_needed(route) is False

    def test_returns_true_for_bazaar_extension(self):
        """Test that routes with bazaar extension return True."""
        route = RouteConfig(
            accepts=PaymentOption(
                scheme="exact",
                pay_to="0x1234567890123456789012345678901234567890",
                price="$0.01",
                network="eip155:8453",
            ),
            extensions={"bazaar": {"some": "config"}},
        )
        assert _check_if_bazaar_needed(route) is True

    def test_returns_false_for_other_extensions(self):
        """Test that routes with non-bazaar extensions return False."""
        route = RouteConfig(
            accepts=PaymentOption(
                scheme="exact",
                pay_to="0x1234567890123456789012345678901234567890",
                price="$0.01",
                network="eip155:8453",
            ),
            extensions={"other": {"some": "config"}},
        )
        assert _check_if_bazaar_needed(route) is False

    def test_dict_routes_with_bazaar(self):
        """Test dict routes configuration with bazaar extension."""
        routes = {
            "GET /api/test": {
                "accepts": {"scheme": "exact", "network": "eip155:8453"},
                "extensions": {"bazaar": {}},
            }
        }
        assert _check_if_bazaar_needed(routes) is True

    def test_dict_routes_without_bazaar(self):
        """Test dict routes configuration without bazaar extension."""
        routes = {
            "GET /api/test": {
                "accepts": {"scheme": "exact", "network": "eip155:8453"},
            }
        }
        assert _check_if_bazaar_needed(routes) is False

    def test_single_dict_route_with_accepts(self):
        """Test single dict route with accepts key."""
        route = {
            "accepts": {"scheme": "exact", "network": "eip155:8453"},
            "extensions": {"bazaar": {}},
        }
        assert _check_if_bazaar_needed(route) is True


# =============================================================================
# FastAPI Adapter Tests
# =============================================================================


class TestFastAPIAdapter:
    """Tests for FastAPIAdapter."""

    def test_get_header(self):
        """Test getting header value."""
        request = make_mock_fastapi_request(headers={"x-custom": "value"})
        adapter = FastAPIAdapter(request)

        assert adapter.get_header("x-custom") == "value"

    def test_get_header_missing(self):
        """Test getting missing header returns None."""
        request = make_mock_fastapi_request()
        adapter = FastAPIAdapter(request)

        assert adapter.get_header("x-missing") is None

    def test_get_method(self):
        """Test getting HTTP method."""
        request = make_mock_fastapi_request(method="POST")
        adapter = FastAPIAdapter(request)

        assert adapter.get_method() == "POST"

    def test_get_path(self):
        """Test getting request path."""
        request = make_mock_fastapi_request(path="/api/weather/london")
        adapter = FastAPIAdapter(request)

        assert adapter.get_path() == "/api/weather/london"

    def test_get_url(self):
        """Test getting full URL."""
        request = make_mock_fastapi_request(path="/api/test")
        # Override __str__ to return the full URL
        request.url.__str__ = MagicMock(return_value="https://example.com/api/test")
        adapter = FastAPIAdapter(request)

        assert adapter.get_url() == "https://example.com/api/test"

    def test_get_accept_header(self):
        """Test getting Accept header."""
        request = make_mock_fastapi_request(headers={"accept": "application/json"})
        adapter = FastAPIAdapter(request)

        assert adapter.get_accept_header() == "application/json"

    def test_get_accept_header_missing(self):
        """Test getting missing Accept header returns empty string."""
        request = make_mock_fastapi_request()
        adapter = FastAPIAdapter(request)

        assert adapter.get_accept_header() == ""

    def test_get_user_agent(self):
        """Test getting User-Agent header."""
        request = make_mock_fastapi_request(headers={"user-agent": "TestClient/1.0"})
        adapter = FastAPIAdapter(request)

        assert adapter.get_user_agent() == "TestClient/1.0"

    def test_get_user_agent_missing(self):
        """Test getting missing User-Agent returns empty string."""
        request = make_mock_fastapi_request()
        adapter = FastAPIAdapter(request)

        assert adapter.get_user_agent() == ""

    def test_get_query_params(self):
        """Test getting query parameters."""
        request = make_mock_fastapi_request(query_params={"city": "london", "units": "metric"})
        adapter = FastAPIAdapter(request)

        params = adapter.get_query_params()
        assert params["city"] == "london"
        assert params["units"] == "metric"

    def test_get_query_param(self):
        """Test getting single query parameter."""
        request = make_mock_fastapi_request(query_params={"city": "london"})
        adapter = FastAPIAdapter(request)

        assert adapter.get_query_param("city") == "london"

    def test_get_query_param_missing(self):
        """Test getting missing query parameter returns None."""
        request = make_mock_fastapi_request()
        adapter = FastAPIAdapter(request)

        assert adapter.get_query_param("missing") is None

    def test_get_body_returns_none(self):
        """Test that get_body returns None (requires async access in FastAPI)."""
        request = make_mock_fastapi_request()
        adapter = FastAPIAdapter(request)

        # Body requires async access in FastAPI
        assert adapter.get_body() is None


# =============================================================================
# Payment Middleware Tests
# =============================================================================


class TestPaymentMiddleware:
    """Tests for payment_middleware function."""

    def test_creates_middleware_function(self):
        """Test that payment_middleware returns a callable."""
        mock_server = MagicMock()
        routes = {
            "GET /api/test": RouteConfig(
                accepts=PaymentOption(
                    scheme="exact",
                    pay_to="0x1234567890123456789012345678901234567890",
                    price="$0.01",
                    network="eip155:8453",
                ),
            )
        }

        middleware = payment_middleware(routes, mock_server)

        assert callable(middleware)

    @pytest.mark.asyncio
    async def test_non_protected_route_passes_through(self):
        """Test that non-protected routes pass through middleware."""
        mock_server = MagicMock()
        mock_http_server = MagicMock()
        mock_http_server.requires_payment.return_value = False

        routes = {
            "GET /api/protected": RouteConfig(
                accepts=PaymentOption(
                    scheme="exact",
                    pay_to="0x1234567890123456789012345678901234567890",
                    price="$0.01",
                    network="eip155:8453",
                ),
            )
        }

        middleware = payment_middleware(routes, mock_server, sync_facilitator_on_start=False)

        request = make_mock_fastapi_request(path="/api/public")
        expected_response = MagicMock()

        async def call_next(req):
            return expected_response

        # Mock the internal http_server to return no payment required
        with pytest.MonkeyPatch.context() as mp:
            from x402.http import middleware as middleware_module

            mock_http_server_class = MagicMock()
            mock_http_server_instance = MagicMock()
            mock_http_server_instance.requires_payment.return_value = False
            mock_http_server_class.return_value = mock_http_server_instance
            mp.setattr(
                middleware_module.fastapi,
                "x402HTTPResourceServer",
                mock_http_server_class,
            )

            middleware = payment_middleware(routes, mock_server, sync_facilitator_on_start=False)
            response = await middleware(request, call_next)

        assert response == expected_response


# =============================================================================
# ASGI Middleware Class Tests
# =============================================================================


class TestPaymentMiddlewareASGI:
    """Tests for PaymentMiddlewareASGI class."""

    def test_inherits_from_base_http_middleware(self):
        """Test that PaymentMiddlewareASGI inherits from BaseHTTPMiddleware."""
        from starlette.middleware.base import BaseHTTPMiddleware

        mock_app = MagicMock()
        mock_server = MagicMock()
        routes = {}

        middleware = PaymentMiddlewareASGI(mock_app, routes, mock_server)

        assert isinstance(middleware, BaseHTTPMiddleware)

    def test_stores_middleware_function(self):
        """Test that ASGI middleware stores internal middleware function."""
        mock_app = MagicMock()
        mock_server = MagicMock()
        routes = {}

        middleware = PaymentMiddlewareASGI(mock_app, routes, mock_server)

        assert hasattr(middleware, "_middleware")
        assert callable(middleware._middleware)
