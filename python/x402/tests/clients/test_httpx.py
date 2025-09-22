import pytest
import json
import base64
import asyncio
from unittest.mock import AsyncMock, MagicMock, patch
from httpx import Request, Response
from eth_account import Account
from x402.clients.httpx import HttpxHooks, x402_payment_hooks, x402HttpxClient
from x402.clients.base import (
    PaymentError,
)
from x402.types import PaymentRequirements, x402PaymentRequiredResponse


@pytest.fixture
def account():
    return Account.create()


@pytest.fixture
def payment_requirements():
    return PaymentRequirements(
        scheme="exact",
        network="base-sepolia",
        asset="0x036CbD53842c5426634e7929541eC2318f3dCF7e",
        pay_to="0x0000000000000000000000000000000000000000",
        max_amount_required="10000",
        resource="https://example.com",
        description="test",
        max_timeout_seconds=1000,
        mime_type="text/plain",
        output_schema=None,
        extra={
            "name": "USD Coin",
            "version": "2",
        },
    )


@pytest.fixture
def hooks(account):
    hooks_dict = x402_payment_hooks(account)
    return hooks_dict["response"][0].__self__


async def test_on_response_success(hooks):
    # Test successful response (200)
    response = Response(200)
    result = await hooks.on_response(response)
    assert result == response


async def test_on_response_non_402(hooks):
    # Test non-402 response
    response = Response(404)
    result = await hooks.on_response(response)
    assert result == response


async def test_on_response_retry(hooks):
    # Test retry response using request extensions
    response = Response(402)
    response.request = Request("GET", "https://example.com")
    response.request.extensions["x402_is_retry"] = True
    result = await hooks.on_response(response)
    assert result == response


async def test_on_response_missing_request(hooks):
    # Test missing request configuration
    response = Response(402)
    # Don't set response.request at all to simulate missing request
    with pytest.raises(
        PaymentError,
        match="Failed to handle payment: The request instance has not been set on this response.",
    ):
        await hooks.on_response(response)


async def test_on_response_payment_flow(hooks, payment_requirements):
    # Mock the payment required response
    payment_response = x402PaymentRequiredResponse(
        x402_version=1,
        accepts=[payment_requirements],
        error="Payment Required",  # Add required error field
    )

    # Create initial 402 response
    response = Response(402)
    response.request = Request("GET", "https://example.com")
    response._content = json.dumps(payment_response.model_dump(by_alias=True)).encode()

    # Mock the retry response with payment response header
    payment_result = {
        "success": True,
        "transaction": "0x1234",
        "network": "base-sepolia",
        "payer": "0x5678",
    }
    retry_response = Response(200)
    retry_response.headers = {
        "X-Payment-Response": base64.b64encode(
            json.dumps(payment_result).encode()
        ).decode()
    }

    # Mock the AsyncClient
    mock_client = AsyncMock()
    mock_client.send.return_value = retry_response
    mock_client.__aenter__.return_value = mock_client

    # Mock both required methods
    hooks.client.select_payment_requirements = MagicMock(
        return_value=payment_requirements
    )
    mock_header = "mock_payment_header"
    hooks.client.create_payment_header = MagicMock(return_value=mock_header)

    with patch("x402.clients.httpx.AsyncClient", return_value=mock_client):
        result = await hooks.on_response(response)

        # Verify the result
        assert result.status_code == 200

        # Verify the retry request was made
        assert mock_client.send.called
        retry_request = mock_client.send.call_args[0][0]
        assert retry_request.headers["X-Payment"] == mock_header
        assert (
            retry_request.headers["Access-Control-Expose-Headers"]
            == "X-Payment-Response"
        )

        # Verify the mocked methods were called with correct arguments
        hooks.client.select_payment_requirements.assert_called_once_with(
            [payment_requirements]
        )
        hooks.client.create_payment_header.assert_called_once_with(
            payment_requirements, 1
        )


async def test_on_response_payment_error(hooks, payment_requirements):
    # Mock the payment required response with unsupported scheme
    payment_requirements.scheme = "unsupported"
    payment_response = x402PaymentRequiredResponse(
        x402_version=1,
        accepts=[payment_requirements],
        error="Payment Required",  # Add required error field
    )

    # Create initial 402 response
    response = Response(402)
    response.request = Request("GET", "https://example.com")
    response._content = json.dumps(payment_response.model_dump(by_alias=True)).encode()

    # Test payment error handling
    with pytest.raises(PaymentError):
        await hooks.on_response(response)


async def test_on_response_general_error(hooks):
    # Create initial 402 response with invalid JSON
    response = Response(402)
    response.request = Request("GET", "https://example.com")
    response._content = b"invalid json"

    # Test general error handling
    with pytest.raises(PaymentError):
        await hooks.on_response(response)


async def test_concurrent_payment_requests(hooks, payment_requirements):
    """Test that concurrent payment requests are handled properly without shared state conflicts."""
    # Mock the payment required response
    payment_response = x402PaymentRequiredResponse(
        x402_version=1,
        accepts=[payment_requirements],
        error="Payment Required",
    )

    # Create multiple 402 responses for concurrent requests
    responses = []
    for i in range(5):
        response = Response(402)
        response.request = Request("GET", f"https://example.com/request-{i}")
        response._content = json.dumps(payment_response.model_dump(by_alias=True)).encode()
        responses.append(response)

    # Mock successful retry responses
    retry_response = Response(200)
    retry_response.headers = {"X-Payment-Response": "success"}

    # Mock the AsyncClient
    mock_client = AsyncMock()
    mock_client.send.return_value = retry_response
    mock_client.__aenter__.return_value = mock_client

    # Mock the client methods
    hooks.client.select_payment_requirements = MagicMock(
        return_value=payment_requirements
    )
    hooks.client.create_payment_header = MagicMock(return_value="mock_payment_header")

    # Process all requests concurrently
    with patch("x402.clients.httpx.AsyncClient", return_value=mock_client):
        tasks = [hooks.on_response(response) for response in responses]
        results = await asyncio.gather(*tasks)

        # Verify all requests succeeded
        for i, result in enumerate(results):
            assert result.status_code == 200, f"Request {i} failed with status {result.status_code}"

        # Verify each request was marked as retry independently
        for i, response in enumerate(responses):
            assert response.request.extensions.get("x402_is_retry") is True, f"Request {i} was not marked as retry"

        # Verify all retry requests were made
        assert mock_client.send.call_count == 5

        # Verify payment headers were added to all requests
        for call_args in mock_client.send.call_args_list:
            retry_request = call_args[0][0]
            assert retry_request.headers["X-Payment"] == "mock_payment_header"


def test_x402_payment_hooks(account):
    # Test hooks dictionary creation
    hooks_dict = x402_payment_hooks(account)
    assert "request" in hooks_dict
    assert "response" in hooks_dict
    assert len(hooks_dict["request"]) == 1
    assert len(hooks_dict["response"]) == 1

    # Test hooks instance
    hooks_instance = hooks_dict["response"][0].__self__
    assert isinstance(hooks_instance, HttpxHooks)
    assert hooks_instance.client.account == account
    assert hooks_instance.client.max_value is None

    # Test with max_value
    hooks_dict = x402_payment_hooks(account, max_value=1000)
    hooks_instance = hooks_dict["response"][0].__self__
    assert hooks_instance.client.max_value == 1000

    # Test with custom selector
    def custom_selector(accepts, network_filter=None, scheme_filter=None):
        return accepts[0]

    hooks_dict = x402_payment_hooks(
        account, payment_requirements_selector=custom_selector
    )
    hooks_instance = hooks_dict["response"][0].__self__
    assert (
        hooks_instance.client.select_payment_requirements
        != hooks_instance.client.__class__.select_payment_requirements
    )


def test_x402_httpx_client(account):
    # Test client initialization
    client = x402HttpxClient(account=account)
    assert "request" in client.event_hooks
    assert "response" in client.event_hooks

    # Get the hooks instance
    hooks_instance = client.event_hooks["response"][0].__self__

    # Test client configuration
    assert hooks_instance.client.account == account
    assert hooks_instance.client.max_value is None

    # Test with max_value
    client = x402HttpxClient(account=account, max_value=1000)
    hooks_instance = client.event_hooks["response"][0].__self__
    assert hooks_instance.client.max_value == 1000

    # Test with custom selector
    def custom_selector(accepts, network_filter=None, scheme_filter=None):
        return accepts[0]

    client = x402HttpxClient(
        account=account, payment_requirements_selector=custom_selector
    )
    hooks_instance = client.event_hooks["response"][0].__self__
    assert (
        hooks_instance.client.select_payment_requirements
        != hooks_instance.client.__class__.select_payment_requirements
    )
