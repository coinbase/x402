"""Tests for the custom transport example."""

import asyncio
import time

import httpx
import pytest
import respx

import sys
import os
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from custom_transport import RetryTransport, TimingEventHooks


class TestRetryTransport:
    """Test suite for RetryTransport."""

    @pytest.mark.asyncio
    async def test_no_retry_on_success(self, respx_mock):
        """Verify no retry on successful response."""
        respx_mock.get("http://test.com/").mock(
            return_value=httpx.Response(200, json={"status": "ok"})
        )

        transport = RetryTransport(max_retries=3, retry_delay=0.01)
        async with httpx.AsyncClient(transport=transport) as client:
            response = await client.get("http://test.com/")

        assert response.status_code == 200
        assert respx_mock.calls.call_count == 1

    @pytest.mark.asyncio
    async def test_no_retry_on_4xx_error(self, respx_mock):
        """Verify no retry on 4xx errors (except 402)."""
        respx_mock.get("http://test.com/").mock(
            return_value=httpx.Response(400, json={"error": "Bad request"})
        )

        transport = RetryTransport(max_retries=3, retry_delay=0.01)
        async with httpx.AsyncClient(transport=transport) as client:
            response = await client.get("http://test.com/")

        assert response.status_code == 400
        assert respx_mock.calls.call_count == 1  # No retries for 4xx

    @pytest.mark.asyncio
    async def test_retry_on_500_error(self, respx_mock):
        """Verify retry logic activates on 5xx errors."""
        call_count = {"count": 0}

        def response_callback(request):
            call_count["count"] += 1
            if call_count["count"] < 3:
                return httpx.Response(500, json={"error": "Server error"})
            return httpx.Response(200, json={"status": "ok"})

        respx_mock.get("http://test.com/").mock(side_effect=response_callback)

        transport = RetryTransport(max_retries=3, retry_delay=0.01)
        async with httpx.AsyncClient(transport=transport) as client:
            response = await client.get("http://test.com/")

        assert response.status_code == 200
        assert call_count["count"] == 3  # 2 failures + 1 success

    @pytest.mark.asyncio
    async def test_max_retries_respected(self, respx_mock):
        """Verify stops after max_retries attempts."""
        respx_mock.get("http://test.com/").mock(
            return_value=httpx.Response(500, json={"error": "Server error"})
        )

        transport = RetryTransport(max_retries=2, retry_delay=0.01)
        async with httpx.AsyncClient(transport=transport) as client:
            with pytest.raises(httpx.TransportError) as exc_info:
                await client.get("http://test.com/")

        assert "Max retries exceeded" in str(exc_info.value)
        assert respx_mock.calls.call_count == 3  # Initial + 2 retries

    @pytest.mark.asyncio
    async def test_exponential_backoff(self, respx_mock):
        """Verify delay increases exponentially between retries."""
        call_times = []

        def response_callback(request):
            call_times.append(time.perf_counter())
            if len(call_times) < 3:
                return httpx.Response(500, json={"error": "Server error"})
            return httpx.Response(200, json={"status": "ok"})

        respx_mock.get("http://test.com/").mock(side_effect=response_callback)

        transport = RetryTransport(max_retries=3, retry_delay=0.05)
        async with httpx.AsyncClient(transport=transport) as client:
            response = await client.get("http://test.com/")

        assert response.status_code == 200
        assert len(call_times) == 3

        # Check delays are increasing
        delay1 = call_times[1] - call_times[0]
        delay2 = call_times[2] - call_times[1]

        # Second delay should be roughly double the first
        # Using generous tolerance due to timing variations
        assert delay2 >= delay1 * 1.5


class TestTimingEventHooks:
    """Test suite for timing event hooks."""

    @pytest.mark.asyncio
    async def test_timing_logged(self, respx_mock, capsys):
        """Verify request duration is logged."""
        respx_mock.get("http://test.com/test-path").mock(
            return_value=httpx.Response(200, json={"status": "ok"})
        )

        timing_hooks = TimingEventHooks()

        async with httpx.AsyncClient(
            event_hooks={
                "request": [timing_hooks.on_request],
                "response": [timing_hooks.on_response],
            }
        ) as client:
            await client.get("http://test.com/test-path")

        captured = capsys.readouterr()
        assert "Starting request to /test-path" in captured.out
        assert "Request to /test-path took" in captured.out
        assert "status: 200" in captured.out

    @pytest.mark.asyncio
    async def test_multiple_requests_tracked(self, respx_mock):
        """Verify multiple concurrent requests are tracked correctly."""
        respx_mock.get("http://test.com/path1").mock(
            return_value=httpx.Response(200, json={"path": "1"})
        )
        respx_mock.get("http://test.com/path2").mock(
            return_value=httpx.Response(200, json={"path": "2"})
        )

        timing_hooks = TimingEventHooks()

        async with httpx.AsyncClient(
            event_hooks={
                "request": [timing_hooks.on_request],
                "response": [timing_hooks.on_response],
            }
        ) as client:
            # Make concurrent requests
            await asyncio.gather(
                client.get("http://test.com/path1"),
                client.get("http://test.com/path2"),
            )

        # All request times should be cleaned up
        assert len(timing_hooks._request_times) == 0


class TestCustomTransportIntegration:
    """Test custom transport with x402 client."""

    @pytest.mark.asyncio
    async def test_transport_works_with_httpx_client(self, respx_mock, test_account):
        """Verify custom transport can be used with httpx client."""
        respx_mock.get("http://test.com/").mock(
            return_value=httpx.Response(200, json={"weather": "sunny"})
        )

        transport = RetryTransport(max_retries=2, retry_delay=0.01)
        timing_hooks = TimingEventHooks()

        async with httpx.AsyncClient(
            transport=transport,
            timeout=httpx.Timeout(30.0),
            event_hooks={
                "request": [timing_hooks.on_request],
                "response": [timing_hooks.on_response],
            },
        ) as client:
            response = await client.get("http://test.com/")

        assert response.status_code == 200
        assert response.json() == {"weather": "sunny"}

    @pytest.mark.asyncio
    async def test_retry_with_timing(self, respx_mock, capsys):
        """Verify retry and timing work together."""
        call_count = {"count": 0}

        def response_callback(request):
            call_count["count"] += 1
            if call_count["count"] < 2:
                return httpx.Response(500)
            return httpx.Response(200, json={"status": "ok"})

        respx_mock.get("http://test.com/retry-test").mock(side_effect=response_callback)

        transport = RetryTransport(max_retries=2, retry_delay=0.01)
        timing_hooks = TimingEventHooks()

        async with httpx.AsyncClient(
            transport=transport,
            event_hooks={
                "request": [timing_hooks.on_request],
                "response": [timing_hooks.on_response],
            },
        ) as client:
            response = await client.get("http://test.com/retry-test")

        assert response.status_code == 200
        assert call_count["count"] == 2

        captured = capsys.readouterr()
        # Should log for both attempts
        assert "Retry attempt 1" in captured.out
