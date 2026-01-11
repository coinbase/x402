"""Shared test fixtures for advanced x402 client examples."""

import json
from typing import Any
from unittest.mock import AsyncMock

import httpx
import pytest
import respx
from eth_account import Account

from x402.schemas import PaymentPayload, PaymentRequired, PaymentRequirements


@pytest.fixture
def test_private_key() -> str:
    """Test private key for signing."""
    return "0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80"


@pytest.fixture
def test_account(test_private_key: str) -> Account:
    """Create a test Ethereum account."""
    return Account.from_key(test_private_key)


@pytest.fixture
def test_url() -> str:
    """Test URL for requests."""
    return "http://localhost:4021/weather"


@pytest.fixture
def mock_payment_requirements() -> PaymentRequirements:
    """Create mock payment requirements."""
    return PaymentRequirements(
        scheme="exact",
        network="eip155:84532",
        asset="0x036CbD53842c5426634e7929541eC2318f3dCF7e",  # USDC on Base Sepolia
        amount="1000",
        pay_to="0x742d35Cc6634C0532925a3b844Bc9e7595f1bE96",
        max_timeout_seconds=300,
        extra={
            "name": "USDC",
            "version": "2",
        },
    )


@pytest.fixture
def mock_402_response(mock_payment_requirements: PaymentRequirements) -> dict[str, Any]:
    """Create mock 402 Payment Required response body."""
    return {
        "x402Version": 2,
        "accepts": [mock_payment_requirements.model_dump(by_alias=True)],
        "resource": {
            "url": "http://localhost:4021/weather",
            "description": "Weather data endpoint",
        },
    }


@pytest.fixture
def mock_payment_required(mock_payment_requirements: PaymentRequirements) -> PaymentRequired:
    """Create mock PaymentRequired object."""
    return PaymentRequired(
        x402_version=2,
        accepts=[mock_payment_requirements],
    )


@pytest.fixture
def mock_200_response() -> dict[str, Any]:
    """Create mock successful response body."""
    return {
        "weather": "sunny",
        "temperature": 72,
    }


@pytest.fixture
def mock_settle_response_header() -> str:
    """Create mock x402 settle response header."""
    return json.dumps({
        "success": True,
        "transactionId": "0x1234567890abcdef",
        "networkId": "eip155:84532",
    })


@pytest.fixture
def respx_mock():
    """Create respx mock for httpx requests."""
    with respx.mock(assert_all_called=False) as mock:
        yield mock


@pytest.fixture
def mock_x402_flow(
    respx_mock: respx.MockRouter,
    mock_402_response: dict[str, Any],
    mock_200_response: dict[str, Any],
    mock_settle_response_header: str,
    test_url: str,
):
    """Set up mock for complete x402 payment flow.

    First request returns 402, second returns 200 with payment response.
    """
    # Track call count to alternate responses
    call_count = {"count": 0}

    def response_callback(request: httpx.Request) -> httpx.Response:
        call_count["count"] += 1
        if call_count["count"] == 1:
            # First call: return 402
            return httpx.Response(
                status_code=402,
                json=mock_402_response,
            )
        else:
            # Subsequent calls: return 200 with payment header
            return httpx.Response(
                status_code=200,
                json=mock_200_response,
                headers={"x-payment-response": mock_settle_response_header},
            )

    respx_mock.get(test_url).mock(side_effect=response_callback)
    return respx_mock


@pytest.fixture
def mock_always_402(
    respx_mock: respx.MockRouter,
    mock_402_response: dict[str, Any],
    test_url: str,
):
    """Set up mock that always returns 402."""
    respx_mock.get(test_url).mock(
        return_value=httpx.Response(
            status_code=402,
            json=mock_402_response,
        )
    )
    return respx_mock


@pytest.fixture
def mock_always_200(
    respx_mock: respx.MockRouter,
    mock_200_response: dict[str, Any],
    test_url: str,
):
    """Set up mock that always returns 200 (no payment required)."""
    respx_mock.get(test_url).mock(
        return_value=httpx.Response(
            status_code=200,
            json=mock_200_response,
        )
    )
    return respx_mock


@pytest.fixture
def mock_server_error(
    respx_mock: respx.MockRouter,
    test_url: str,
):
    """Set up mock that returns 500 server error."""
    respx_mock.get(test_url).mock(
        return_value=httpx.Response(
            status_code=500,
            json={"error": "Internal server error"},
        )
    )
    return respx_mock
