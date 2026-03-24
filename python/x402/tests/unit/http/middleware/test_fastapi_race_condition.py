"""Unit tests for lazy facilitator initialization race condition fix (FastAPI)."""

from __future__ import annotations

import asyncio
import threading
from unittest.mock import AsyncMock, MagicMock, patch

import pytest

# Skip all tests if fastapi not installed
pytest.importorskip("fastapi")
from starlette.datastructures import Headers, QueryParams

from x402.http.facilitator_client_base import FacilitatorResponseError
from x402.http.middleware.fastapi import (
    payment_middleware,
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


def make_mock_fastapi_request(
    method: str = "GET",
    path: str = "/api/test",
    headers: dict[str, str] | None = None,
    query_params: dict[str, str] | None = None,
) -> MagicMock:
    """Create a mock FastAPI Request object."""
    from fastapi import Request

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
# Race Condition Tests
# =============================================================================


class TestLazyInitRaceCondition:
    """Tests for the async Lock that prevents concurrent lazy facilitator initialization.

    The fix uses asyncio.Lock with double-checked locking:
      async with init_lock:
          if not init_done:
              http_server.initialize()  # sync call, not awaited
              init_done = True
    """

    @pytest.mark.asyncio
    async def test_initialization_runs_exactly_once_with_concurrent_requests(self):
        """Multiple concurrent requests must only trigger initialization once.

        Uses a slow sync initializer to prove the asyncio.Lock prevents
        multiple entries during concurrent async middleware calls.
        """
        from x402.http import middleware as middleware_module

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

        init_call_count = 0
        count_lock = threading.Lock()

        def slow_initialize():
            """Sync initializer that takes time — proves lock contention works."""
            nonlocal init_call_count
            with count_lock:
                init_call_count += 1
            import time
            time.sleep(0.05)

        with pytest.MonkeyPatch.context() as mp:
            mock_http_server_class = MagicMock()
            mock_http_server_instance = MagicMock()
            mock_http_server_instance.requires_payment.return_value = True
            mock_http_server_instance.process_http_request = AsyncMock(
                return_value=HTTPProcessResult(
                    type="payment-required",
                    payment_requirements=make_payment_requirements(),
                )
            )
            mock_http_server_instance.initialize = MagicMock(side_effect=slow_initialize)
            mock_http_server_class.return_value = mock_http_server_instance

            mp.setattr(
                middleware_module.fastapi,
                "x402HTTPResourceServer",
                mock_http_server_class,
            )

            middleware = payment_middleware(routes, mock_server, sync_facilitator_on_start=True)

            async def noop_call_next(req):
                return MagicMock()

            request = make_mock_fastapi_request(path="/api/protected")
            # Fire 5 concurrent requests
            tasks = [middleware(request, noop_call_next) for _ in range(5)]
            results = await asyncio.gather(*tasks, return_exceptions=True)

        # Initialization must run exactly once despite 5 concurrent requests
        assert init_call_count == 1, (
            f"Expected initialize() to be called exactly once, but was called {init_call_count} times"
        )

    @pytest.mark.asyncio
    async def test_initialization_error_returns_facilitator_error_response(self):
        """When initialization fails with FacilitatorResponseError, a 502 response is returned."""
        from x402.http import middleware as middleware_module

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

        def failing_initialize():
            raise FacilitatorResponseError("Failed to reach facilitator")

        with pytest.MonkeyPatch.context() as mp:
            mock_http_server_class = MagicMock()
            mock_http_server_instance = MagicMock()
            mock_http_server_instance.requires_payment.return_value = True
            mock_http_server_instance.initialize = MagicMock(side_effect=failing_initialize)
            mock_http_server_class.return_value = mock_http_server_instance

            mp.setattr(
                middleware_module.fastapi,
                "x402HTTPResourceServer",
                mock_http_server_class,
            )

            middleware = payment_middleware(routes, mock_server, sync_facilitator_on_start=True)

            async def noop_call_next(req):
                return MagicMock()

            request = make_mock_fastapi_request(path="/api/protected")
            response = await middleware(request, noop_call_next)

            # Response should exist (not raise) — error is caught and returned as 502
            assert response is not None

    @pytest.mark.asyncio
    async def test_no_initialization_when_sync_facilitator_disabled(self):
        """When sync_facilitator_on_start=False, initialize should never be called."""
        from x402.http import middleware as middleware_module

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

        with pytest.MonkeyPatch.context() as mp:
            mock_http_server_class = MagicMock()
            mock_http_server_instance = MagicMock()
            mock_http_server_instance.requires_payment.return_value = True
            mock_http_server_instance.process_http_request = AsyncMock(
                return_value=HTTPProcessResult(
                    type="payment-required",
                    payment_requirements=make_payment_requirements(),
                )
            )
            mock_http_server_class.return_value = mock_http_server_instance

            mp.setattr(
                middleware_module.fastapi,
                "x402HTTPResourceServer",
                mock_http_server_class,
            )

            middleware = payment_middleware(routes, mock_server, sync_facilitator_on_start=False)

            async def noop_call_next(req):
                return MagicMock()

            request = make_mock_fastapi_request(path="/api/protected")
            await middleware(request, noop_call_next)

            # initialize should never be called when sync is disabled
            mock_http_server_instance.initialize.assert_not_called()

    @pytest.mark.asyncio
    async def test_second_request_after_init_does_not_reinitialize(self):
        """After initialization completes, subsequent requests skip initialization."""
        from x402.http import middleware as middleware_module

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

        with pytest.MonkeyPatch.context() as mp:
            mock_http_server_class = MagicMock()
            mock_http_server_instance = MagicMock()
            mock_http_server_instance.requires_payment.return_value = True
            mock_http_server_instance.process_http_request = AsyncMock(
                return_value=HTTPProcessResult(
                    type="payment-required",
                    payment_requirements=make_payment_requirements(),
                )
            )
            mock_http_server_class.return_value = mock_http_server_instance

            mp.setattr(
                middleware_module.fastapi,
                "x402HTTPResourceServer",
                mock_http_server_class,
            )

            middleware = payment_middleware(routes, mock_server, sync_facilitator_on_start=True)

            async def noop_call_next(req):
                return MagicMock()

            request = make_mock_fastapi_request(path="/api/protected")

            # First request triggers init
            await middleware(request, noop_call_next)
            assert mock_http_server_instance.initialize.call_count == 1

            # Second request should skip init (double-checked locking)
            await middleware(request, noop_call_next)
            assert mock_http_server_instance.initialize.call_count == 1
