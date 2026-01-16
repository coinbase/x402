"""Unit tests for x402.http.clients.requests - requests adapter wrapper."""

import json
from unittest.mock import MagicMock, patch

import pytest

from x402.http.clients.requests import (
    PaymentAlreadyAttemptedError,
    PaymentError,
    wrapRequestsWithPayment,
    x402_http_adapter,
    x402_requests,
    x402HTTPAdapter,
)
from x402.http.utils import encode_payment_required_header
from x402.http.x402_http_client import x402HTTPClientSync
from x402.schemas import PaymentPayload, PaymentRequired, PaymentRequirements

# Skip tests if requests not installed
pytest.importorskip("requests")
import requests

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


class MockX402ClientSync:
    """Mock sync x402ClientSync for testing."""

    def __init__(self, payload: PaymentPayload | None = None):
        self.payload = payload or make_v2_payload()
        self.create_calls: list = []

    def create_payment_payload(self, payment_required):
        self.create_calls.append(payment_required)
        return self.payload


class MockX402ClientAsync:
    """Mock async x402Client for testing type checking."""

    async def create_payment_payload(self, payment_required):
        return None


# =============================================================================
# Adapter Tests
# =============================================================================


class TestX402HTTPAdapter:
    """Tests for x402HTTPAdapter."""

    def test_init_with_sync_client(self):
        """Test initialization with sync x402ClientSync."""
        mock_client = MockX402ClientSync()
        adapter = x402HTTPAdapter(mock_client)

        assert adapter._client == mock_client
        assert adapter._http_client is not None

    def test_init_with_http_client(self):
        """Test initialization with x402HTTPClientSync."""
        mock_client = MockX402ClientSync()
        http_client = x402HTTPClientSync(mock_client)
        adapter = x402HTTPAdapter(http_client)

        assert adapter._http_client == http_client

    def test_init_rejects_async_client(self):
        """Test that TypeError is raised for async client."""
        mock_async_client = MockX402ClientAsync()

        with pytest.raises(TypeError, match="requires a sync client"):
            x402HTTPAdapter(mock_async_client)  # type: ignore

    def test_send_non_402_passes_through(self):
        """Test that non-402 responses pass through unchanged."""
        mock_client = MockX402ClientSync()
        adapter = x402HTTPAdapter(mock_client)

        # Create mock request and response
        mock_request = MagicMock(spec=requests.PreparedRequest)
        mock_request.headers = {}

        mock_response = MagicMock(spec=requests.Response)
        mock_response.status_code = 200
        mock_response.content = b'{"data": "test"}'

        with patch.object(requests.adapters.HTTPAdapter, "send", return_value=mock_response):
            response = adapter.send(mock_request)

        assert response == mock_response
        assert len(mock_client.create_calls) == 0

    def test_send_402_triggers_payment_retry(self):
        """Test that 402 response triggers payment creation and retry."""
        mock_client = MockX402ClientSync()
        adapter = x402HTTPAdapter(mock_client)

        # Create payment required
        payment_required = PaymentRequired(
            x402_version=2,
            accepts=[make_payment_requirements()],
        )
        encoded = encode_payment_required_header(payment_required)

        # Create mock request
        mock_request = MagicMock(spec=requests.PreparedRequest)
        mock_request.headers = {}

        # Create 402 and 200 responses
        mock_402_response = MagicMock(spec=requests.Response)
        mock_402_response.status_code = 402
        mock_402_response.headers = {"PAYMENT-REQUIRED": encoded}
        mock_402_response.content = b"{}"

        mock_200_response = MagicMock(spec=requests.Response)
        mock_200_response.status_code = 200
        mock_200_response.headers = {"Content-Type": "application/json"}
        mock_200_response.content = b'{"success": true}'

        call_count = [0]

        def mock_send(req, **kwargs):
            call_count[0] += 1
            if call_count[0] == 1:
                return mock_402_response
            return mock_200_response

        with patch.object(requests.adapters.HTTPAdapter, "send", side_effect=mock_send):
            response = adapter.send(mock_request)

        # Response should have 200 status (copied from retry)
        assert response.status_code == 200
        assert len(mock_client.create_calls) == 1
        assert call_count[0] == 2

    def test_send_adds_payment_headers_on_retry(self):
        """Test that retry request includes payment headers."""
        mock_client = MockX402ClientSync()
        adapter = x402HTTPAdapter(mock_client)

        payment_required = PaymentRequired(
            x402_version=2,
            accepts=[make_payment_requirements()],
        )
        encoded = encode_payment_required_header(payment_required)

        mock_request = MagicMock(spec=requests.PreparedRequest)
        mock_request.headers = {}

        mock_402_response = MagicMock(spec=requests.Response)
        mock_402_response.status_code = 402
        mock_402_response.headers = {"PAYMENT-REQUIRED": encoded}
        mock_402_response.content = b"{}"

        mock_200_response = MagicMock(spec=requests.Response)
        mock_200_response.status_code = 200
        mock_200_response.headers = {}
        mock_200_response.content = b"{}"

        call_count = [0]

        def mock_send(req, **kwargs):
            call_count[0] += 1
            if call_count[0] == 1:
                return mock_402_response
            # On retry, check headers were added
            assert "PAYMENT-SIGNATURE" in req.headers or any(
                k.upper() == "PAYMENT-SIGNATURE" for k in req.headers
            )
            return mock_200_response

        with patch.object(requests.adapters.HTTPAdapter, "send", side_effect=mock_send):
            adapter.send(mock_request)

        assert call_count[0] == 2

    def test_send_handles_v1_body_payment_required(self):
        """Test that V1 payment required in body is handled."""
        mock_client = MockX402ClientSync()
        adapter = x402HTTPAdapter(mock_client)

        v1_body = {
            "x402Version": 1,
            "accepts": [
                {
                    "scheme": "exact",
                    "network": "base-sepolia",
                    "maxAmountRequired": "500000",
                    "resource": "https://example.com",
                    "description": "Test",
                    "mimeType": "application/json",
                    "payTo": "0x1234567890123456789012345678901234567890",
                    "maxTimeoutSeconds": 300,
                    "asset": "0x0000000000000000000000000000000000000000",
                    "extra": {},
                }
            ],
        }

        mock_request = MagicMock(spec=requests.PreparedRequest)
        mock_request.headers = {}

        mock_402_response = MagicMock(spec=requests.Response)
        mock_402_response.status_code = 402
        mock_402_response.headers = {}  # No header
        mock_402_response.content = json.dumps(v1_body).encode("utf-8")

        mock_200_response = MagicMock(spec=requests.Response)
        mock_200_response.status_code = 200
        mock_200_response.headers = {}
        mock_200_response.content = b"{}"

        call_count = [0]

        def mock_send(req, **kwargs):
            call_count[0] += 1
            if call_count[0] == 1:
                return mock_402_response
            return mock_200_response

        with patch.object(requests.adapters.HTTPAdapter, "send", side_effect=mock_send):
            adapter.send(mock_request)

        assert len(mock_client.create_calls) == 1

    def test_send_propagates_payment_error(self):
        """Test that PaymentError is propagated."""
        mock_client = MockX402ClientSync()
        adapter = x402HTTPAdapter(mock_client)

        mock_request = MagicMock(spec=requests.PreparedRequest)
        mock_request.headers = {}

        mock_402_response = MagicMock(spec=requests.Response)
        mock_402_response.status_code = 402
        mock_402_response.headers = {}  # No valid payment info
        mock_402_response.content = b"not json"

        with patch.object(requests.adapters.HTTPAdapter, "send", return_value=mock_402_response):
            with pytest.raises(PaymentError):
                adapter.send(mock_request)


# =============================================================================
# Factory Function Tests
# =============================================================================


class TestX402HttpAdapter:
    """Tests for x402_http_adapter factory function."""

    def test_creates_adapter(self):
        """Test that factory creates x402HTTPAdapter."""
        mock_client = MockX402ClientSync()
        adapter = x402_http_adapter(mock_client)

        assert isinstance(adapter, x402HTTPAdapter)


class TestWrapRequestsWithPayment:
    """Tests for wrapRequestsWithPayment function."""

    def test_mounts_adapter_to_session(self):
        """Test that adapter is mounted to session."""
        mock_client = MockX402ClientSync()
        session = requests.Session()

        result = wrapRequestsWithPayment(session, mock_client)

        assert result is session
        # Check adapters are mounted
        assert isinstance(session.get_adapter("https://example.com"), x402HTTPAdapter)
        assert isinstance(session.get_adapter("http://example.com"), x402HTTPAdapter)


class TestX402Requests:
    """Tests for x402_requests convenience function."""

    def test_creates_session_with_adapter(self):
        """Test that convenience function creates configured session."""
        mock_client = MockX402ClientSync()
        session = x402_requests(mock_client)

        assert isinstance(session, requests.Session)
        assert isinstance(session.get_adapter("https://example.com"), x402HTTPAdapter)


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
