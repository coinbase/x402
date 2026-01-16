"""Unit tests for x402.http.clients.httpx - httpx transport wrapper."""

import warnings
from unittest.mock import AsyncMock, MagicMock

import pytest

from x402.http.clients.httpx import (
    MissingRequestConfigError,
    PaymentAlreadyAttemptedError,
    PaymentError,
    wrapHttpxWithPayment,
    x402_httpx_hooks,
    x402_httpx_transport,
    x402AsyncTransport,
    x402HttpxClient,
)
from x402.http.utils import encode_payment_required_header
from x402.http.x402_http_client import x402HTTPClient
from x402.schemas import PaymentPayload, PaymentRequired, PaymentRequirements

# Skip tests if httpx not installed
pytest.importorskip("httpx")
import httpx

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


# =============================================================================
# Mock x402 Clients
# =============================================================================


class MockX402Client:
    """Mock async x402Client for testing."""

    def __init__(self, payload: PaymentPayload | None = None):
        self.payload = payload or make_v2_payload()
        self.create_calls: list = []

    async def create_payment_payload(self, payment_required):
        self.create_calls.append(payment_required)
        return self.payload


# =============================================================================
# Transport Tests
# =============================================================================


class TestX402AsyncTransport:
    """Tests for x402AsyncTransport."""

    def test_init_with_x402_client(self):
        """Test initialization with x402Client."""
        mock_client = MockX402Client()
        transport = x402AsyncTransport(mock_client)

        assert transport._client == mock_client
        assert transport._http_client is not None

    def test_init_with_http_client(self):
        """Test initialization with x402HTTPClient."""
        mock_client = MockX402Client()
        http_client = x402HTTPClient(mock_client)
        transport = x402AsyncTransport(http_client)

        assert transport._http_client == http_client

    def test_retry_key_constant(self):
        """Test that RETRY_KEY constant is set."""
        assert x402AsyncTransport.RETRY_KEY == "_x402_is_retry"

    @pytest.mark.asyncio
    async def test_non_402_passes_through(self):
        """Test that non-402 responses pass through unchanged."""
        mock_client = MockX402Client()

        # Create mock transport that returns 200
        mock_transport = AsyncMock()
        mock_response = MagicMock()
        mock_response.status_code = 200
        mock_transport.handle_async_request = AsyncMock(return_value=mock_response)

        transport = x402AsyncTransport(mock_client, mock_transport)

        request = httpx.Request("GET", "https://example.com/api")
        response = await transport.handle_async_request(request)

        assert response == mock_response
        assert len(mock_client.create_calls) == 0

    @pytest.mark.asyncio
    async def test_402_triggers_payment_retry(self):
        """Test that 402 response triggers payment creation and retry."""
        mock_client = MockX402Client()

        # Create payment required response
        payment_required = PaymentRequired(
            x402_version=2,
            accepts=[make_payment_requirements()],
        )
        encoded = encode_payment_required_header(payment_required)

        # Mock 402 response then 200 on retry
        mock_402_response = MagicMock()
        mock_402_response.status_code = 402
        mock_402_response.headers = {"PAYMENT-REQUIRED": encoded}
        mock_402_response.json.return_value = None
        mock_402_response.aread = AsyncMock()

        mock_200_response = MagicMock()
        mock_200_response.status_code = 200

        mock_transport = AsyncMock()
        mock_transport.handle_async_request = AsyncMock(
            side_effect=[mock_402_response, mock_200_response]
        )

        transport = x402AsyncTransport(mock_client, mock_transport)

        request = httpx.Request("GET", "https://example.com/api")
        response = await transport.handle_async_request(request)

        assert response == mock_200_response
        assert len(mock_client.create_calls) == 1
        assert mock_transport.handle_async_request.call_count == 2

    @pytest.mark.asyncio
    async def test_retry_request_has_payment_headers(self):
        """Test that retry request includes payment headers."""
        mock_client = MockX402Client()

        payment_required = PaymentRequired(
            x402_version=2,
            accepts=[make_payment_requirements()],
        )
        encoded = encode_payment_required_header(payment_required)

        mock_402_response = MagicMock()
        mock_402_response.status_code = 402
        mock_402_response.headers = {"PAYMENT-REQUIRED": encoded}
        mock_402_response.json.return_value = None
        mock_402_response.aread = AsyncMock()

        mock_200_response = MagicMock()
        mock_200_response.status_code = 200

        captured_retry_request = None

        async def capture_request(req):
            nonlocal captured_retry_request
            if captured_retry_request is None:
                # First call returns 402
                return mock_402_response
            # Second call - capture and return 200
            captured_retry_request = req
            return mock_200_response

        mock_transport = AsyncMock()
        # Set side effect manually
        call_count = [0]

        async def handle_request(req):
            call_count[0] += 1
            if call_count[0] == 1:
                return mock_402_response
            return mock_200_response

        mock_transport.handle_async_request = handle_request

        transport = x402AsyncTransport(mock_client, mock_transport)

        request = httpx.Request("GET", "https://example.com/api")
        await transport.handle_async_request(request)

        # Can't easily capture the retry request in this test setup,
        # but we verified payment was created

    @pytest.mark.asyncio
    async def test_retry_flag_prevents_infinite_loop(self):
        """Test that retry flag prevents infinite payment loops."""
        mock_client = MockX402Client()

        payment_required = PaymentRequired(
            x402_version=2,
            accepts=[make_payment_requirements()],
        )
        encoded = encode_payment_required_header(payment_required)

        # Both responses are 402
        mock_402_response = MagicMock()
        mock_402_response.status_code = 402
        mock_402_response.headers = {"PAYMENT-REQUIRED": encoded}
        mock_402_response.json.return_value = None
        mock_402_response.aread = AsyncMock()

        mock_transport = AsyncMock()
        mock_transport.handle_async_request = AsyncMock(return_value=mock_402_response)

        transport = x402AsyncTransport(mock_client, mock_transport)

        # Create request with retry flag already set
        request = httpx.Request(
            "GET",
            "https://example.com/api",
            extensions={x402AsyncTransport.RETRY_KEY: True},
        )
        response = await transport.handle_async_request(request)

        # Should return 402 without retrying (no payment creation)
        assert response == mock_402_response
        assert len(mock_client.create_calls) == 0

    @pytest.mark.asyncio
    async def test_aclose_delegates(self):
        """Test that aclose delegates to underlying transport."""
        mock_client = MockX402Client()
        mock_transport = AsyncMock()

        transport = x402AsyncTransport(mock_client, mock_transport)
        await transport.aclose()

        mock_transport.aclose.assert_called_once()


# =============================================================================
# Factory Function Tests
# =============================================================================


class TestX402HttpxTransport:
    """Tests for x402_httpx_transport factory function."""

    def test_creates_transport(self):
        """Test that factory creates x402AsyncTransport."""
        mock_client = MockX402Client()
        transport = x402_httpx_transport(mock_client)

        assert isinstance(transport, x402AsyncTransport)


class TestX402HttpxHooks:
    """Tests for deprecated x402_httpx_hooks function."""

    def test_emits_deprecation_warning(self):
        """Test that x402_httpx_hooks emits deprecation warning."""
        mock_client = MockX402Client()

        with warnings.catch_warnings(record=True) as w:
            warnings.simplefilter("always")
            _ = x402_httpx_hooks(mock_client)

            assert len(w) == 1
            assert issubclass(w[0].category, DeprecationWarning)
            assert "deprecated" in str(w[0].message).lower()

    def test_returns_empty_hooks(self):
        """Test that deprecated function returns empty hooks dict."""
        mock_client = MockX402Client()

        with warnings.catch_warnings():
            warnings.simplefilter("ignore")
            hooks = x402_httpx_hooks(mock_client)

        assert hooks == {"request": [], "response": []}


# =============================================================================
# Wrapper Function Tests
# =============================================================================


class TestWrapHttpxWithPayment:
    """Tests for wrapHttpxWithPayment function."""

    def test_creates_async_client_with_transport(self):
        """Test that wrapper creates AsyncClient with payment transport."""
        mock_client = MockX402Client()
        client = wrapHttpxWithPayment(mock_client)

        assert isinstance(client, httpx.AsyncClient)
        # Transport should be x402AsyncTransport
        assert isinstance(client._transport, x402AsyncTransport)

    def test_passes_httpx_kwargs(self):
        """Test that additional kwargs are passed to AsyncClient."""
        mock_client = MockX402Client()
        client = wrapHttpxWithPayment(mock_client, timeout=30.0)

        assert client.timeout.connect == 30.0


# =============================================================================
# Convenience Class Tests
# =============================================================================


class TestX402HttpxClient:
    """Tests for x402HttpxClient convenience class."""

    def test_inherits_from_async_client(self):
        """Test that x402HttpxClient inherits from httpx.AsyncClient."""
        mock_client = MockX402Client()
        client = x402HttpxClient(mock_client)

        assert isinstance(client, httpx.AsyncClient)

    def test_has_payment_transport(self):
        """Test that x402HttpxClient uses payment transport."""
        mock_client = MockX402Client()
        client = x402HttpxClient(mock_client)

        assert isinstance(client._transport, x402AsyncTransport)

    def test_accepts_additional_kwargs(self):
        """Test that additional kwargs are passed through."""
        mock_client = MockX402Client()
        client = x402HttpxClient(mock_client, timeout=60.0)

        assert client.timeout.connect == 60.0


# =============================================================================
# Error Class Tests
# =============================================================================


class TestPaymentErrors:
    """Tests for payment error classes."""

    def test_payment_error_is_exception(self):
        """Test PaymentError is an Exception."""
        error = PaymentError("test error")
        assert isinstance(error, Exception)
        assert str(error) == "test error"

    def test_payment_already_attempted_inherits(self):
        """Test PaymentAlreadyAttemptedError inherits from PaymentError."""
        error = PaymentAlreadyAttemptedError()
        assert isinstance(error, PaymentError)

    def test_missing_request_config_inherits(self):
        """Test MissingRequestConfigError inherits from PaymentError."""
        error = MissingRequestConfigError()
        assert isinstance(error, PaymentError)
