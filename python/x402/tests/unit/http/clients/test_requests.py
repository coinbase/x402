"""Tests for x402HTTPAdapter (requests library integration).

Related issues:
- https://github.com/coinbase/x402/pull/399
- https://github.com/coinbase/x402/pull/879
"""

from unittest.mock import MagicMock, patch

import pytest
import requests
from requests import PreparedRequest, Response

from x402.http.clients.requests import (
    PaymentError,
    wrapRequestsWithPayment,
    x402_http_adapter,
    x402_requests,
    x402HTTPAdapter,
)


class MockX402Client:
    """Mock x402Client for testing."""

    def __init__(self):
        self.create_payment_payload_call_count = 0

    def create_payment_payload(self, payment_required):
        self.create_payment_payload_call_count += 1
        return MagicMock(x402_version=2, accepted=payment_required)


class MockX402HTTPClient:
    """Mock x402HTTPClient for testing."""

    def __init__(self):
        self.get_payment_required_response_call_count = 0

    def get_payment_required_response(self, _get_header, _body):
        self.get_payment_required_response_call_count += 1
        return MagicMock(
            scheme="exact",
            network="base-sepolia",
            asset="0x036CbD53842c5426634e7929541eC2318f3dCF7e",
            amount="10000",
            pay_to="0x0000000000000000000000000000000000000000",
        )

    def encode_payment_signature_header(self, _payload):
        return {"X-Payment": "mock_payment_header"}


@pytest.fixture(scope="function")
def mock_client():
    """Create a mock x402Client."""
    return MockX402Client()


@pytest.fixture(scope="function")
def mock_http_client():
    """Create a mock x402HTTPClient."""
    return MockX402HTTPClient()


@pytest.fixture(scope="function")
def adapter(mock_client, mock_http_client):
    """Create an x402HTTPAdapter with mocked dependencies.

    Uses MagicMock spec to create a valid adapter instance, then injects
    mock dependencies for isolated unit testing.
    """
    adapter = MagicMock(spec=x402HTTPAdapter)
    adapter._client = mock_client
    adapter._http_client = mock_http_client
    adapter.send = x402HTTPAdapter.send.__get__(adapter, x402HTTPAdapter)
    adapter.RETRY_HEADER = x402HTTPAdapter.RETRY_HEADER
    return adapter


def _create_response(status_code: int, content: bytes = b"") -> Response:
    """Create a mock Response object."""
    response = Response()
    response.status_code = status_code
    response._content = content
    response.headers = {}
    return response


def _create_request(url: str = "https://example.com") -> PreparedRequest:
    """Create a PreparedRequest object."""
    request = PreparedRequest()
    request.prepare("GET", url)
    return request


class TestRetryHeaderConstant:
    """Test the RETRY_HEADER class constant."""

    def test_should_have_retry_header_constant(self):
        """Should have RETRY_HEADER constant defined."""
        assert hasattr(x402HTTPAdapter, "RETRY_HEADER")
        assert x402HTTPAdapter.RETRY_HEADER == "X-x402-Payment-Retry"


class TestConsecutivePayments:
    """Test consecutive payment requests (bug fix verification).

    Verifies the fix for the bug where the second consecutive payment request
    would skip payment handling due to instance-level state persisting across
    requests. Fix: Use request-level header instead of instance variable.
    """

    def test_should_handle_all_consecutive_402_requests(self, adapter):
        """Should handle all consecutive 402 requests with payment retry."""
        call_count = 0

        def mock_send(request, **_kwargs):
            nonlocal call_count
            call_count += 1
            is_retry = request.headers.get(x402HTTPAdapter.RETRY_HEADER) == "1"
            if is_retry:
                return _create_response(200, b'{"success": true}')
            return _create_response(402, b"{}")

        with patch("requests.adapters.HTTPAdapter.send", side_effect=mock_send):
            for i in range(3):
                request = _create_request(f"https://example.com/resource{i}")
                response = adapter.send(request)
                assert response.status_code == 200, f"Request {i + 1} failed"

            assert call_count == 6  # 3 initial + 3 retries
            assert adapter._client.create_payment_payload_call_count == 3

    def test_should_set_retry_header_on_retry_request(self, adapter):
        """Should set retry header on the retry request."""
        captured_requests = []

        def mock_send(request, **_kwargs):
            captured_requests.append(request)
            is_retry = request.headers.get(x402HTTPAdapter.RETRY_HEADER) == "1"
            if is_retry:
                return _create_response(200, b'{"success": true}')
            return _create_response(402, b"{}")

        with patch("requests.adapters.HTTPAdapter.send", side_effect=mock_send):
            adapter.send(_create_request())

            assert x402HTTPAdapter.RETRY_HEADER not in captured_requests[0].headers
            assert captured_requests[1].headers.get(x402HTTPAdapter.RETRY_HEADER) == "1"

    def test_should_not_modify_original_request(self, adapter):
        """Should not modify original request during retry."""

        def mock_send(request, **_kwargs):
            is_retry = request.headers.get(x402HTTPAdapter.RETRY_HEADER) == "1"
            if is_retry:
                return _create_response(200, b'{"success": true}')
            return _create_response(402, b"{}")

        with patch("requests.adapters.HTTPAdapter.send", side_effect=mock_send):
            original_request = _create_request()
            adapter.send(original_request)

            assert x402HTTPAdapter.RETRY_HEADER not in original_request.headers
            assert "X-Payment" not in original_request.headers

    def test_should_handle_mixed_200_and_402_requests(self, adapter):
        """Should handle alternating free (200) and paid (402) requests."""
        call_sequence = []

        def mock_send(request, **_kwargs):
            url = request.url
            is_retry = request.headers.get(x402HTTPAdapter.RETRY_HEADER) == "1"
            call_sequence.append((url, is_retry))

            if "/free" in url:
                return _create_response(200, b'{"free": true}')
            elif is_retry:
                return _create_response(200, b'{"paid": true}')
            return _create_response(402, b"{}")

        with patch("requests.adapters.HTTPAdapter.send", side_effect=mock_send):
            urls = [
                "https://example.com/free",
                "https://example.com/paid1",
                "https://example.com/free",
                "https://example.com/paid2",
            ]
            for url in urls:
                response = adapter.send(_create_request(url))
                assert response.status_code == 200

            expected = [
                ("https://example.com/free", False),
                ("https://example.com/paid1", False),
                ("https://example.com/paid1", True),
                ("https://example.com/free", False),
                ("https://example.com/paid2", False),
                ("https://example.com/paid2", True),
            ]
            assert call_sequence == expected


class TestBasicFunctionality:
    """Test basic adapter functionality."""

    @pytest.mark.parametrize(
        ("status_code", "content"),
        [
            (200, b"success"),
            (404, b"not found"),
            (500, b"server error"),
            (301, b"redirect"),
        ],
    )
    def test_should_return_non_402_response_directly(self, adapter, status_code, content):
        """Should return non-402 responses without payment handling."""
        mock_response = _create_response(status_code, content)

        with patch("requests.adapters.HTTPAdapter.send", return_value=mock_response):
            response = adapter.send(_create_request())

            assert response.status_code == status_code
            assert response.content == content
            assert adapter._client.create_payment_payload_call_count == 0

    def test_should_return_402_directly_when_retry_header_present(self, adapter):
        """Should return 402 directly when retry header is present.

        This prevents infinite retry loops when payment is rejected.
        """
        mock_response = _create_response(402, b"payment rejected")

        with patch("requests.adapters.HTTPAdapter.send", return_value=mock_response):
            request = _create_request()
            request.headers[x402HTTPAdapter.RETRY_HEADER] = "1"

            response = adapter.send(request)

            assert response.status_code == 402
            assert adapter._client.create_payment_payload_call_count == 0


class TestErrorHandling:
    """Test error handling in the adapter."""

    def test_should_raise_payment_error_on_client_error(self, adapter):
        """Should raise PaymentError when client fails."""
        adapter._client.create_payment_payload = MagicMock(side_effect=Exception("Client error"))
        mock_402 = _create_response(402, b"{}")

        with patch("requests.adapters.HTTPAdapter.send", return_value=mock_402):
            with pytest.raises(PaymentError, match="Failed to handle payment"):
                adapter.send(_create_request())

    def test_should_propagate_payment_error(self, adapter):
        """Should propagate PaymentError from client."""
        adapter._client.create_payment_payload = MagicMock(
            side_effect=PaymentError("Custom payment error")
        )
        mock_402 = _create_response(402, b"{}")

        with patch("requests.adapters.HTTPAdapter.send", return_value=mock_402):
            with pytest.raises(PaymentError, match="Custom payment error"):
                adapter.send(_create_request())


class TestFactoryFunctions:
    """Test factory functions for creating adapters and sessions."""

    def test_x402_http_adapter_should_create_adapter(self):
        """Should create x402HTTPAdapter instance."""
        mock_client = MagicMock()

        with patch.object(x402HTTPAdapter, "__init__", return_value=None):
            adapter = x402_http_adapter(mock_client)
            assert isinstance(adapter, x402HTTPAdapter)

    def test_x402_requests_should_create_session_with_adapters(self):
        """Should create session with HTTP and HTTPS adapters mounted."""
        mock_client = MagicMock()

        with patch.object(x402HTTPAdapter, "__init__", return_value=None):
            session = x402_requests(mock_client)

            assert isinstance(session, requests.Session)
            assert "http://" in session.adapters
            assert "https://" in session.adapters

    def test_wrap_requests_with_payment_should_mount_adapters(self):
        """Should mount adapters on existing session."""
        mock_client = MagicMock()
        session = requests.Session()

        with patch.object(x402HTTPAdapter, "__init__", return_value=None):
            wrapped = wrapRequestsWithPayment(session, mock_client)

            assert wrapped is session
            assert "http://" in wrapped.adapters
            assert "https://" in wrapped.adapters
