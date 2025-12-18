import pytest
import json
import base64
from unittest.mock import MagicMock, patch
from requests import Response, PreparedRequest
from x402.clients.requests import x402_http_adapter
from x402.types import PaymentRequirements, x402PaymentRequiredResponse
from eth_account import Account


@pytest.fixture
def account():
    return Account.create()


@pytest.fixture
def adapter(account):
    return x402_http_adapter(account)


@pytest.fixture
def payment_requirements():
    return PaymentRequirements(
        scheme="exact",
        network="eip155:84532",
        amount="1000000",
        asset="0xUSDC",
        pay_to="0xRecipient",
        max_timeout_seconds=3600,
        extra=None,
    )


def test_payment_required_header_priority(adapter, payment_requirements):
    """Test that PAYMENT-REQUIRED header takes precedence over body."""
    # Mock the payment required response
    payment_response = x402PaymentRequiredResponse(
        x402_version=1,
        accepts=[payment_requirements],
        error="Payment Required",
    )

    # Create initial 402 response with invalid body but valid header
    initial_response = Response()
    initial_response.status_code = 402
    initial_response._content = b"<html>Non-JSON Body</html>"
    initial_response.headers = {
        "PAYMENT-REQUIRED": base64.b64encode(
            json.dumps(payment_response.model_dump(by_alias=True)).encode()
        ).decode()
    }

    # Mock success retry response
    retry_response = Response()
    retry_response.status_code = 200
    retry_response._content = b"success"

    # Create a prepared request
    request = PreparedRequest()
    request.prepare("GET", "https://example.com")

    # Mock client methods
    adapter.client.select_payment_requirements = MagicMock(
        return_value=payment_requirements
    )
    adapter.client.create_payment_header = MagicMock(return_value="mock_header")

    # Mock send
    def mock_send_impl(req, **kwargs):
        if adapter._is_retry:
            return retry_response
        return initial_response

    with patch("requests.adapters.HTTPAdapter.send", side_effect=mock_send_impl):
        response = adapter.send(request)

        # Verify parsing succeeded despite invalid body
        assert response.status_code == 200
        adapter.client.select_payment_requirements.assert_called_once()
