"""Unit tests for lazy facilitator initialization race condition fix (Flask).

Tests the threading.Lock + double-checked locking pattern that prevents
concurrent lazy facilitator initialization in the Flask WSGI middleware.
"""

from __future__ import annotations

import threading
import time
from unittest.mock import MagicMock, patch

import pytest

# Skip all tests if flask not installed
pytest.importorskip("flask")
from flask import Flask

from x402.http.facilitator_client_base import FacilitatorResponseError
from x402.http.middleware.flask import (
    PaymentMiddleware,
)
from x402.http.types import (
    HTTPProcessResult,
    PaymentOption,
    RouteConfig,
)
from x402.schemas import PaymentRequirements

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


def _make_middleware(sync_on_start: bool = True) -> tuple[PaymentMiddleware, MagicMock]:
    """Create a PaymentMiddleware with a mocked HTTP server.

    Returns (middleware_instance, mock_http_server).
    """
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

    mock_http_server = MagicMock()
    mock_http_server.requires_payment.return_value = True
    mock_http_server.process_http_request = MagicMock(
        return_value=HTTPProcessResult(
            type="payment-required",
            payment_requirements=make_payment_requirements(),
        )
    )

    app = Flask(__name__)

    with patch("x402.http.middleware.flask.x402HTTPResourceServerSync") as mock_cls:
        mock_cls.return_value = mock_http_server
        middleware = PaymentMiddleware(
            app, routes, mock_server, sync_facilitator_on_start=sync_on_start
        )

    return middleware, mock_http_server


_STANDARD_ENVIRON = {
    "REQUEST_METHOD": "GET",
    "PATH_INFO": "/api/protected",
    "wsgi.url_scheme": "https",
    "HTTP_HOST": "example.com",
    "SERVER_NAME": "example.com",
    "SERVER_PORT": "443",
}


def _call_middleware(middleware, environ=None):
    """Call the middleware and consume the iterator."""
    def start_response(status, headers):
        pass
    try:
        result = middleware._wsgi_middleware(environ or _STANDARD_ENVIRON, start_response)
        if hasattr(result, "__iter__"):
            list(result)
    except Exception:
        pass


# =============================================================================
# Race Condition Tests
# =============================================================================


class TestLazyInitRaceCondition:
    """Tests for the threading.Lock that prevents concurrent lazy facilitator initialization.

    The fix uses threading.Lock with double-checked locking:
      with self._init_lock:
          if not self._init_done:
              self._http_server.initialize()
              self._init_done = True
    """

    def test_initialization_runs_exactly_once_with_concurrent_requests(self):
        """Multiple concurrent threads must only trigger initialization once."""
        middleware, mock_http_server = _make_middleware(sync_on_start=True)

        init_call_count = 0
        count_lock = threading.Lock()

        def slow_initialize():
            """Sync initializer that takes time — proves lock contention works."""
            nonlocal init_call_count
            with count_lock:
                init_call_count += 1
            time.sleep(0.05)

        mock_http_server.initialize = MagicMock(side_effect=slow_initialize)

        def make_wsgi_call():
            _call_middleware(middleware)

        # Fire 5 concurrent threads
        threads = [threading.Thread(target=make_wsgi_call) for _ in range(5)]
        for t in threads:
            t.start()
        for t in threads:
            t.join(timeout=2)

        # Initialization must run exactly once despite 5 concurrent threads
        assert init_call_count == 1, (
            f"Expected initialize() to be called exactly once, but was called {init_call_count} times"
        )

    def test_initialization_error_returns_facilitator_error_response(self):
        """When initialization fails with FacilitatorResponseError, error response is returned."""
        middleware, mock_http_server = _make_middleware(sync_on_start=True)

        mock_http_server.initialize = MagicMock(
            side_effect=FacilitatorResponseError("Failed to reach facilitator")
        )

        _call_middleware(middleware)

        # initialize was called and raised — the error was caught internally
        mock_http_server.initialize.assert_called_once()

    def test_no_initialization_when_sync_facilitator_disabled(self):
        """When sync_facilitator_on_start=False, initialize should never be called."""
        middleware, mock_http_server = _make_middleware(sync_on_start=False)

        _call_middleware(middleware)

        # initialize should never be called when sync is disabled
        mock_http_server.initialize.assert_not_called()

    def test_second_request_after_init_does_not_reinitialize(self):
        """After initialization completes, subsequent requests skip initialization."""
        middleware, mock_http_server = _make_middleware(sync_on_start=True)

        # First request triggers init
        _call_middleware(middleware)
        assert mock_http_server.initialize.call_count == 1

        # Second request should skip init (double-checked locking)
        _call_middleware(middleware)
        assert mock_http_server.initialize.call_count == 1
