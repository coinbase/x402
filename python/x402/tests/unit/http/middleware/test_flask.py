"""Unit tests for x402.http.middleware.flask - Flask WSGI middleware."""

from __future__ import annotations

import json
from typing import Any
from unittest.mock import MagicMock, patch

import pytest

# Skip all tests if flask not installed
pytest.importorskip("flask")
from flask import Flask
from werkzeug.datastructures import Headers, ImmutableMultiDict

from x402.http.middleware.flask import (
    FlaskAdapter,
    PaymentMiddleware,
    ResponseWrapper,
    _check_if_bazaar_needed,
    payment_middleware,
)
from x402.http.types import (
    HTTPProcessResult,
    HTTPResponseInstructions,
    PaymentOption,
    ProcessSettleResult,
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


def make_mock_flask_request(
    method: str = "GET",
    path: str = "/api/test",
    headers: dict[str, str] | None = None,
    query_params: dict[str, str] | None = None,
    json_body: Any = None,
) -> MagicMock:
    """Create a mock Flask Request object."""
    mock_request = MagicMock()
    mock_request.method = method
    mock_request.path = path
    mock_request.url = f"https://example.com{path}"
    mock_request.headers = Headers(headers or {})
    mock_request.args = ImmutableMultiDict(query_params or {})
    mock_request.get_json = MagicMock(return_value=json_body)
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


# =============================================================================
# Flask Adapter Tests
# =============================================================================


class TestFlaskAdapter:
    """Tests for FlaskAdapter."""

    def test_get_header(self):
        """Test getting header value."""
        request = make_mock_flask_request(headers={"x-custom": "value"})
        adapter = FlaskAdapter(request)

        assert adapter.get_header("x-custom") == "value"

    def test_get_header_missing(self):
        """Test getting missing header returns None."""
        request = make_mock_flask_request()
        adapter = FlaskAdapter(request)

        assert adapter.get_header("x-missing") is None

    def test_get_method(self):
        """Test getting HTTP method."""
        request = make_mock_flask_request(method="POST")
        adapter = FlaskAdapter(request)

        assert adapter.get_method() == "POST"

    def test_get_path(self):
        """Test getting request path."""
        request = make_mock_flask_request(path="/api/weather/london")
        adapter = FlaskAdapter(request)

        assert adapter.get_path() == "/api/weather/london"

    def test_get_url(self):
        """Test getting full URL."""
        request = make_mock_flask_request(path="/api/test")
        adapter = FlaskAdapter(request)

        assert adapter.get_url() == "https://example.com/api/test"

    def test_get_accept_header(self):
        """Test getting Accept header."""
        request = make_mock_flask_request(headers={"accept": "application/json"})
        adapter = FlaskAdapter(request)

        assert adapter.get_accept_header() == "application/json"

    def test_get_accept_header_missing(self):
        """Test getting missing Accept header returns empty string."""
        request = make_mock_flask_request()
        adapter = FlaskAdapter(request)

        assert adapter.get_accept_header() == ""

    def test_get_user_agent(self):
        """Test getting User-Agent header."""
        request = make_mock_flask_request(headers={"user-agent": "TestClient/1.0"})
        adapter = FlaskAdapter(request)

        assert adapter.get_user_agent() == "TestClient/1.0"

    def test_get_user_agent_missing(self):
        """Test getting missing User-Agent returns empty string."""
        request = make_mock_flask_request()
        adapter = FlaskAdapter(request)

        assert adapter.get_user_agent() == ""

    def test_get_query_params(self):
        """Test getting query parameters."""
        request = make_mock_flask_request(query_params={"city": "london", "units": "metric"})
        adapter = FlaskAdapter(request)

        params = adapter.get_query_params()
        assert params["city"] == "london"
        assert params["units"] == "metric"

    def test_get_query_param(self):
        """Test getting single query parameter."""
        request = make_mock_flask_request(query_params={"city": "london"})
        adapter = FlaskAdapter(request)

        assert adapter.get_query_param("city") == "london"

    def test_get_query_param_missing(self):
        """Test getting missing query parameter returns None."""
        request = make_mock_flask_request()
        adapter = FlaskAdapter(request)

        assert adapter.get_query_param("missing") is None

    def test_get_body(self):
        """Test getting JSON body."""
        request = make_mock_flask_request(json_body={"key": "value"})
        adapter = FlaskAdapter(request)

        assert adapter.get_body() == {"key": "value"}

    def test_get_body_returns_none_for_non_json(self):
        """Test that get_body returns None for non-JSON body."""
        request = make_mock_flask_request()
        request.get_json.return_value = None
        adapter = FlaskAdapter(request)

        assert adapter.get_body() is None


# =============================================================================
# Response Wrapper Tests
# =============================================================================


class TestResponseWrapper:
    """Tests for ResponseWrapper class."""

    def test_captures_status(self):
        """Test that status is captured."""
        original_start_response = MagicMock()
        wrapper = ResponseWrapper(original_start_response)

        wrapper("200 OK", [("Content-Type", "application/json")])

        assert wrapper.status == "200 OK"
        assert wrapper.status_code == 200

    def test_captures_headers(self):
        """Test that headers are captured."""
        original_start_response = MagicMock()
        wrapper = ResponseWrapper(original_start_response)

        wrapper("200 OK", [("Content-Type", "application/json"), ("X-Custom", "value")])

        assert ("Content-Type", "application/json") in wrapper.headers
        assert ("X-Custom", "value") in wrapper.headers

    def test_add_header(self):
        """Test adding headers."""
        original_start_response = MagicMock()
        wrapper = ResponseWrapper(original_start_response)
        wrapper("200 OK", [])

        wrapper.add_header("X-Payment-Response", "encoded_value")

        assert ("X-Payment-Response", "encoded_value") in wrapper.headers

    def test_buffered_write_function(self):
        """Test that buffered write function captures data."""
        original_start_response = MagicMock()
        wrapper = ResponseWrapper(original_start_response)

        write_func = wrapper("200 OK", [])
        write_func(b"chunk1")
        write_func(b"chunk2")

        assert b"chunk1" in wrapper._write_chunks
        assert b"chunk2" in wrapper._write_chunks

    def test_send_response(self):
        """Test sending buffered response."""
        write_mock = MagicMock()
        original_start_response = MagicMock(return_value=write_mock)
        wrapper = ResponseWrapper(original_start_response)
        wrapper("200 OK", [("Content-Type", "text/plain")])
        wrapper._write_chunks = [b"write_data"]

        wrapper.send_response([b"body_data"])

        original_start_response.assert_called_once_with("200 OK", [("Content-Type", "text/plain")])
        write_mock.assert_any_call(b"write_data")
        write_mock.assert_any_call(b"body_data")

    def test_parses_status_code_from_string(self):
        """Test parsing various status code formats."""
        original_start_response = MagicMock()
        wrapper = ResponseWrapper(original_start_response)

        wrapper("402 Payment Required", [])
        assert wrapper.status_code == 402

        wrapper2 = ResponseWrapper(original_start_response)
        wrapper2("500 Internal Server Error", [])
        assert wrapper2.status_code == 500


# =============================================================================
# Payment Middleware Tests
# =============================================================================


class TestPaymentMiddleware:
    """Tests for PaymentMiddleware class."""

    def test_wraps_flask_app(self):
        """Test that middleware wraps Flask app WSGI."""
        app = Flask(__name__)
        mock_server = MagicMock()
        routes = {}

        original_wsgi = app.wsgi_app
        PaymentMiddleware(app, routes, mock_server, sync_facilitator_on_start=False)

        # wsgi_app should be replaced
        assert app.wsgi_app != original_wsgi

    def test_stores_original_wsgi(self):
        """Test that original WSGI app is stored."""
        app = Flask(__name__)
        mock_server = MagicMock()
        routes = {}

        original_wsgi = app.wsgi_app
        middleware = PaymentMiddleware(app, routes, mock_server, sync_facilitator_on_start=False)

        assert middleware._original_wsgi == original_wsgi


class TestPaymentMiddlewareFunction:
    """Tests for payment_middleware convenience function."""

    def test_returns_middleware_instance(self):
        """Test that payment_middleware returns PaymentMiddleware."""
        app = Flask(__name__)
        mock_server = MagicMock()
        routes = {}

        result = payment_middleware(app, routes, mock_server, sync_facilitator_on_start=False)

        assert isinstance(result, PaymentMiddleware)

    def test_passes_all_config_options(self):
        """Test that all config options are passed through."""
        app = Flask(__name__)
        mock_server = MagicMock()
        routes = {}
        paywall_config = MagicMock()
        paywall_provider = MagicMock()

        middleware = payment_middleware(
            app,
            routes,
            mock_server,
            paywall_config=paywall_config,
            paywall_provider=paywall_provider,
            sync_facilitator_on_start=False,
        )

        assert middleware._paywall_config == paywall_config


# =============================================================================
# Integration-style Tests
# =============================================================================


class TestFlaskMiddlewareIntegration:
    """Integration-style tests for Flask middleware."""

    def test_non_protected_route_passes_through(self):
        """Test that non-protected routes bypass payment check."""
        app = Flask(__name__)

        @app.route("/public")
        def public_route():
            return "Public content"

        mock_server = MagicMock()
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

        # Create middleware with mocked http server
        with patch("x402.http.middleware.flask.x402HTTPResourceServerSync") as mock_http_server:
            mock_http_server_instance = MagicMock()
            mock_http_server_instance.requires_payment.return_value = False
            mock_http_server.return_value = mock_http_server_instance

            PaymentMiddleware(app, routes, mock_server, sync_facilitator_on_start=False)

            with app.test_client() as client:
                response = client.get("/public")
                assert response.status_code == 200
                assert response.data == b"Public content"

    def test_protected_route_returns_402_without_payment(self):
        """Test that protected routes return 402 without payment."""
        app = Flask(__name__)

        @app.route("/api/protected")
        def protected_route():
            return "Protected content"

        mock_server = MagicMock()
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

        # Create middleware with mocked http server
        with patch("x402.http.middleware.flask.x402HTTPResourceServerSync") as mock_http_server:
            mock_http_server_instance = MagicMock()
            mock_http_server_instance.requires_payment.return_value = True
            mock_http_server_instance.process_http_request.return_value = HTTPProcessResult(
                type="payment-error",
                response=HTTPResponseInstructions(
                    status=402,
                    headers={"PAYMENT-REQUIRED": "encoded_header"},
                    body={"error": "Payment required"},
                    is_html=False,
                ),
            )
            mock_http_server.return_value = mock_http_server_instance

            PaymentMiddleware(app, routes, mock_server, sync_facilitator_on_start=False)

            with app.test_client() as client:
                response = client.get("/api/protected")
                assert response.status_code == 402

    def test_verified_payment_proceeds_to_route(self):
        """Test that verified payment allows route access."""
        app = Flask(__name__)

        @app.route("/api/protected")
        def protected_route():
            return "Protected content"

        mock_server = MagicMock()
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

        payment_payload = make_v2_payload()
        payment_requirements = make_payment_requirements()

        with patch("x402.http.middleware.flask.x402HTTPResourceServerSync") as mock_http_server:
            mock_http_server_instance = MagicMock()
            mock_http_server_instance.requires_payment.return_value = True
            mock_http_server_instance.process_http_request.return_value = HTTPProcessResult(
                type="payment-verified",
                payment_payload=payment_payload,
                payment_requirements=payment_requirements,
            )
            mock_http_server_instance.process_settlement.return_value = ProcessSettleResult(
                success=True,
                headers={"PAYMENT-RESPONSE": "settlement_encoded"},
            )
            mock_http_server.return_value = mock_http_server_instance

            PaymentMiddleware(app, routes, mock_server, sync_facilitator_on_start=False)

            with app.test_client() as client:
                response = client.get(
                    "/api/protected",
                    headers={"PAYMENT-SIGNATURE": "valid_payment"},
                )
                assert response.status_code == 200
                assert b"Protected content" in response.data
                assert "PAYMENT-RESPONSE" in response.headers

    def test_settlement_failure_returns_402(self):
        """Test that settlement failure returns 402 with empty body and PAYMENT-RESPONSE header."""
        app = Flask(__name__)

        @app.route("/api/protected")
        def protected_route():
            return "Protected content"

        mock_server = MagicMock()
        routes = {}

        payment_payload = make_v2_payload()
        payment_requirements = make_payment_requirements()

        with patch("x402.http.middleware.flask.x402HTTPResourceServerSync") as mock_http_server:
            mock_http_server_instance = MagicMock()
            mock_http_server_instance.requires_payment.return_value = True
            mock_http_server_instance.process_http_request.return_value = HTTPProcessResult(
                type="payment-verified",
                payment_payload=payment_payload,
                payment_requirements=payment_requirements,
            )
            mock_http_server_instance.process_settlement.return_value = ProcessSettleResult(
                success=False,
                error_reason="Insufficient funds",
                response=HTTPResponseInstructions(
                    status=402,
                    headers={
                        "Content-Type": "application/json",
                        "PAYMENT-RESPONSE": "base64encoded",
                    },
                    body={},
                ),
            )
            mock_http_server.return_value = mock_http_server_instance

            PaymentMiddleware(app, routes, mock_server, sync_facilitator_on_start=False)

            with app.test_client() as client:
                response = client.get("/api/protected")
                assert response.status_code == 402
                data = json.loads(response.data)
                assert data == {}
                assert "PAYMENT-RESPONSE" in response.headers


# =============================================================================
# Concurrency Safety Tests
# =============================================================================


class TestConcurrencySafety:
    """Test concurrency safety of lazy initialization."""

    def test_concurrent_initialization_single_call(self):
        """Test that concurrent requests result in only one initialize() call."""
        import threading
        import time
        from unittest.mock import call

        app = Flask(__name__)

        @app.route("/health")
        def health():
            return {"status": "ok"}

        @app.route("/api/protected")
        def protected():
            return {"data": "secret"}

        # Create mock server that tracks initialize calls with delay
        mock_server = MagicMock()
        mock_http_server_instance = MagicMock()
        
        # Add delay to simulate slow initialization
        def slow_initialize():
            time.sleep(0.1)  # 100ms delay
            
        mock_http_server_instance.initialize = slow_initialize
        mock_http_server_instance.requires_payment.return_value = True
        mock_http_server_instance.process_http_request.return_value = HTTPProcessResult(
            type="no-payment-required"
        )

        routes = {"GET /api/*": RouteConfig(accepts=make_payment_option())}
        
        with patch("x402.http.middleware.flask.x402HTTPResourceServerSync") as mock_http_server:
            mock_http_server.return_value = mock_http_server_instance

            # Create middleware
            PaymentMiddleware(app, routes, mock_server, sync_facilitator_on_start=True)

            # Track initialization calls
            init_calls = []
            original_init = mock_http_server_instance.initialize

            def tracked_init():
                init_calls.append(time.time())
                original_init()

            mock_http_server_instance.initialize = tracked_init

            # Make concurrent requests using threads
            def make_request(results, index):
                with app.test_client() as client:
                    response = client.get("/api/protected")
                    results[index] = response.status_code

            threads = []
            results = {}
            
            # Start 5 concurrent threads
            for i in range(5):
                thread = threading.Thread(target=make_request, args=(results, i))
                threads.append(thread)
                thread.start()

            # Wait for all threads to complete
            for thread in threads:
                thread.join()

            # Verify initialize was called exactly once
            assert len(init_calls) == 1, f"Expected 1 init call, got {len(init_calls)}"

    def test_initialization_error_propagation(self):
        """Test that initialization errors are properly propagated to all waiting requests."""
        import threading
        from unittest.mock import call

        app = Flask(__name__)

        @app.route("/api/protected")
        def protected():
            return {"data": "secret"}

        # Create mock server that raises during initialization
        mock_server = MagicMock()
        mock_http_server_instance = MagicMock()
        mock_http_server_instance.requires_payment.return_value = True
        
        init_error = RuntimeError("Facilitator connection failed")
        mock_http_server_instance.initialize.side_effect = init_error

        routes = {"GET /api/*": RouteConfig(accepts=make_payment_option())}
        
        with patch("x402.http.middleware.flask.x402HTTPResourceServerSync") as mock_http_server:
            mock_http_server.return_value = mock_http_server_instance

            # Create middleware
            PaymentMiddleware(app, routes, mock_server, sync_facilitator_on_start=True)

            # Make concurrent requests that should all fail
            def make_request(results, index):
                with app.test_client() as client:
                    try:
                        response = client.get("/api/protected")
                        results[index] = ("response", response.status_code)
                    except RuntimeError as e:
                        results[index] = ("error", str(e))

            threads = []
            results = {}
            
            # Start 3 concurrent threads
            for i in range(3):
                thread = threading.Thread(target=make_request, args=(results, i))
                threads.append(thread)
                thread.start()

            # Wait for all threads to complete
            for thread in threads:
                thread.join()

            # Verify all requests saw the same error
            assert len(results) == 3
            for result_type, result_data in results.values():
                assert result_type == "error"
                assert "Facilitator connection failed" in result_data

            # Verify initialize was called only once
            mock_http_server_instance.initialize.assert_called_once()

    def test_no_initialization_race_with_mixed_routes(self):
        """Test that non-protected routes don't interfere with initialization."""
        import threading
        
        app = Flask(__name__)

        @app.route("/health")
        def health():
            return {"status": "ok"}

        @app.route("/api/protected")  
        def protected():
            return {"data": "secret"}

        mock_server = MagicMock()
        mock_http_server_instance = MagicMock()
        
        def requires_payment_side_effect(context):
            return "/api/" in context.path
            
        mock_http_server_instance.requires_payment.side_effect = requires_payment_side_effect
        mock_http_server_instance.initialize = MagicMock()
        mock_http_server_instance.process_http_request.return_value = HTTPProcessResult(
            type="no-payment-required"
        )

        routes = {"GET /api/*": RouteConfig(accepts=make_payment_option())}
        
        with patch("x402.http.middleware.flask.x402HTTPResourceServerSync") as mock_http_server:
            mock_http_server.return_value = mock_http_server_instance

            # Create middleware
            PaymentMiddleware(app, routes, mock_server, sync_facilitator_on_start=True)

            def make_protected_request(results, index):
                with app.test_client() as client:
                    response = client.get("/api/protected")
                    results[f"protected_{index}"] = response.status_code

            def make_unprotected_request(results, index):
                with app.test_client() as client:
                    response = client.get("/health")
                    results[f"health_{index}"] = response.status_code

            threads = []
            results = {}
            
            # Mix protected and unprotected requests
            for i in range(3):
                thread = threading.Thread(target=make_protected_request, args=(results, i))
                threads.append(thread)
                
                thread = threading.Thread(target=make_unprotected_request, args=(results, i))
                threads.append(thread)

            # Start all threads
            for thread in threads:
                thread.start()

            # Wait for all threads to complete
            for thread in threads:
                thread.join()

            # Should only initialize once despite multiple requests
            mock_http_server_instance.initialize.assert_called_once()
