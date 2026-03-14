"""Tests for concurrent middleware initialization safety."""

import asyncio
import threading
import unittest.mock
from unittest.mock import Mock


class TestConcurrencyFix:
    """Test that middleware initialization is safe under concurrent load."""

    def test_fastapi_concurrent_initialization(self):
        """Test FastAPI middleware concurrent initialization safety."""
        from x402.http.middleware.fastapi import payment_middleware

        # Mock server and dependencies
        mock_server = Mock()
        mock_http_server = Mock()

        # Track how many times initialize() is called
        init_call_count = 0

        def mock_initialize():
            nonlocal init_call_count
            # Simulate some initialization work
            import time

            time.sleep(0.01)  # Small delay to increase race condition likelihood
            init_call_count += 1

        mock_http_server.initialize = Mock(side_effect=mock_initialize)
        mock_http_server.requires_payment = Mock(return_value=True)

        # Mock the async process_http_request method
        async def mock_process_request(*args, **kwargs):
            mock_result = Mock()
            mock_result.type = "no-payment-required"
            return mock_result

        mock_http_server.process_http_request = Mock(side_effect=mock_process_request)

        routes = {"GET /test": {"accepts": {"scheme": "test", "price": "$0.01"}}}

        with unittest.mock.patch(
            "x402.http.middleware.fastapi.x402HTTPResourceServer", return_value=mock_http_server
        ):
            middleware = payment_middleware(routes, mock_server, sync_facilitator_on_start=True)

        # Create multiple concurrent requests
        async def make_request():
            mock_request = Mock()
            mock_request.url.path = "/test"
            mock_request.method = "GET"
            mock_request.headers = {}

            mock_adapter = Mock()
            mock_adapter.get_header.return_value = None

            with unittest.mock.patch(
                "x402.http.middleware.fastapi.FastAPIAdapter", return_value=mock_adapter
            ):
                # Mock the call_next function
                async def mock_call_next(req):
                    return Mock()

                # This would trigger initialization
                await middleware(mock_request, mock_call_next)

        async def run_concurrent_requests():
            # Run 10 concurrent requests that would all trigger initialization
            tasks = [make_request() for _ in range(10)]
            await asyncio.gather(*tasks)

        # Run the concurrent test
        asyncio.run(run_concurrent_requests())

        # With the fix, initialize should only be called once despite concurrent requests
        assert init_call_count == 1, f"Expected initialize() called once, got {init_call_count}"

    def test_flask_concurrent_initialization(self):
        """Test Flask middleware concurrent initialization safety."""
        from x402.http.middleware.flask import PaymentMiddleware

        # Mock Flask app and dependencies
        mock_app = Mock()
        mock_server = Mock()
        mock_http_server = Mock()

        # Track how many times initialize() is called
        init_call_count = 0
        init_lock = threading.Lock()

        def mock_initialize():
            nonlocal init_call_count
            with init_lock:  # Ensure thread-safe counting for test
                # Simulate some initialization work
                import time

                time.sleep(0.01)  # Small delay to increase race condition likelihood
                init_call_count += 1

        mock_http_server.initialize = Mock(side_effect=mock_initialize)
        mock_http_server.requires_payment = Mock(return_value=True)
        mock_http_server.process_http_request = Mock()

        routes = {"GET /test": {"accepts": {"scheme": "test", "price": "$0.01"}}}

        with unittest.mock.patch(
            "x402.http.middleware.flask.x402HTTPResourceServerSync", return_value=mock_http_server
        ):
            middleware = PaymentMiddleware(
                mock_app, routes, mock_server, sync_facilitator_on_start=True
            )

        # Create mock WSGI environ and start_response
        def mock_start_response(status, headers):
            return lambda data: None

        environ = {
            "REQUEST_METHOD": "GET",
            "PATH_INFO": "/test",
            "QUERY_STRING": "",
            "SERVER_NAME": "localhost",
            "SERVER_PORT": "8000",
            "HTTP_HOST": "localhost:8000",
        }

        # Mock Flask request context
        mock_request = Mock()
        mock_request.path = "/test"
        mock_request.method = "GET"
        mock_request.headers = {}

        def make_request():
            """Simulate a single request in a thread."""
            with unittest.mock.patch("x402.http.middleware.flask.request", mock_request):
                with unittest.mock.patch.object(mock_app, "request_context") as mock_ctx:
                    mock_ctx.return_value.__enter__ = Mock(return_value=None)
                    mock_ctx.return_value.__exit__ = Mock(return_value=None)

                    with unittest.mock.patch(
                        "x402.http.middleware.flask.FlaskAdapter"
                    ) as mock_adapter_class:
                        mock_adapter = Mock()
                        mock_adapter.get_header.return_value = None
                        mock_adapter_class.return_value = mock_adapter

                        # Mock the original WSGI app response
                        with unittest.mock.patch.object(middleware, "_original_wsgi") as mock_wsgi:
                            mock_wsgi.return_value = [b"test response"]

                            # This would trigger initialization
                            mock_result = Mock()
                            mock_result.type = "no-payment-required"
                            mock_http_server.process_http_request.return_value = mock_result

                            try:
                                list(middleware._wsgi_middleware(environ, mock_start_response))
                            except Exception:
                                # Ignore any mock-related exceptions
                                pass

        # Run 10 concurrent threads that would all trigger initialization
        threads = []
        for _ in range(10):
            thread = threading.Thread(target=make_request)
            threads.append(thread)
            thread.start()

        # Wait for all threads to complete
        for thread in threads:
            thread.join()

        # With the fix, initialize should only be called once despite concurrent requests
        assert init_call_count == 1, f"Expected initialize() called once, got {init_call_count}"
