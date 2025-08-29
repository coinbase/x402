import pytest
import json
import base64
from unittest.mock import AsyncMock, MagicMock, patch
from httpx import Request, Response
from eth_account import Account
from x402.clients.httpx import HttpxHooks, x402_payment_hooks, x402HttpxClient
from x402.clients.base import (
    PaymentError,
)
from x402.types import (
    PaymentRequirements,
    x402PaymentRequiredResponse,
    WalletPolicy,
    PaymentPolicy,
    AssetPolicy,
    TokenAmount,
    TokenAsset,
    EIP712Domain,
)


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
    # Test retry response
    response = Response(402)
    hooks._is_retry = True
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

    # Verify retry flag is reset
    assert not hooks._is_retry


async def test_on_response_general_error(hooks):
    # Create initial 402 response with invalid JSON
    response = Response(402)
    response.request = Request("GET", "https://example.com")
    response._content = b"invalid json"

    # Test general error handling
    with pytest.raises(PaymentError):
        await hooks.on_response(response)

    # Verify retry flag is reset
    assert not hooks._is_retry


def test_x402_payment_hooks(account):
    # Test hooks dictionary creation (default policy)
    hooks_dict = x402_payment_hooks(account)
    assert "request" in hooks_dict
    assert "response" in hooks_dict
    assert len(hooks_dict["request"]) == 1
    assert len(hooks_dict["response"]) == 1

    # Test hooks instance
    hooks_instance = hooks_dict["response"][0].__self__
    assert isinstance(hooks_instance, HttpxHooks)
    assert hooks_instance.client.account == account
    assert hooks_instance.client.policy_or_max_value is None

    # Test with legacy max_value (backwards compatibility)
    hooks_dict = x402_payment_hooks(account, policy_or_max_value=100000)
    hooks_instance = hooks_dict["response"][0].__self__
    assert hooks_instance.client.policy_or_max_value == 100000

    # Test with WalletPolicy
    policy = WalletPolicy(payments=PaymentPolicy(networks={"base-sepolia": "$0.05"}))
    hooks_dict = x402_payment_hooks(account, policy_or_max_value=policy)
    hooks_instance = hooks_dict["response"][0].__self__
    assert hooks_instance.client.policy_or_max_value == policy

    # Test with custom selector
    def custom_selector(
        accepts, network_filter=None, scheme_filter=None, max_value=None
    ):
        return accepts[0]

    hooks_dict = x402_payment_hooks(
        account, payment_requirements_selector=custom_selector
    )
    hooks_instance = hooks_dict["response"][0].__self__
    assert hooks_instance.client._payment_requirements_selector == custom_selector


def test_x402_httpx_client(account):
    # Test client initialization (default policy)
    client = x402HttpxClient(account=account)
    assert "request" in client.event_hooks
    assert "response" in client.event_hooks

    # Get the hooks instance
    hooks_instance = client.event_hooks["response"][0].__self__

    # Test client configuration
    assert hooks_instance.client.account == account
    assert hooks_instance.client.policy_or_max_value is None

    # Test with legacy max_value (backwards compatibility)
    client = x402HttpxClient(account=account, policy_or_max_value=100000)
    hooks_instance = client.event_hooks["response"][0].__self__
    assert hooks_instance.client.policy_or_max_value == 100000

    # Test with WalletPolicy
    policy = WalletPolicy(payments=PaymentPolicy(networks={"base-sepolia": "$0.20"}))
    client = x402HttpxClient(account=account, policy_or_max_value=policy)
    hooks_instance = client.event_hooks["response"][0].__self__
    assert hooks_instance.client.policy_or_max_value == policy

    # Test with custom selector
    def custom_selector(
        accepts, network_filter=None, scheme_filter=None, max_value=None
    ):
        return accepts[0]

    client = x402HttpxClient(
        account=account, payment_requirements_selector=custom_selector
    )
    hooks_instance = client.event_hooks["response"][0].__self__
    assert hooks_instance.client._payment_requirements_selector == custom_selector


async def test_wallet_policy_multi_network(account, payment_requirements):
    # Test multi-network policy validation
    multi_network_policy = WalletPolicy(
        payments=PaymentPolicy(
            networks={"base-sepolia": "$0.10", "base": "$0.25", "avalanche": "$0.05"}
        )
    )

    hooks_dict = x402_payment_hooks(account, policy_or_max_value=multi_network_policy)
    hooks_instance = hooks_dict["response"][0].__self__

    # Test ethereum payment within its limit
    ethereum_payment_req = PaymentRequirements(
        **{
            **payment_requirements.model_dump(),
            "network": "base",
            "max_amount_required": "200000",
        }  # 0.2 USDC within 0.25 limit
    )

    payment_response = x402PaymentRequiredResponse(
        x402_version=1,
        accepts=[ethereum_payment_req],
        error="Payment Required",
    )

    response = Response(402)
    response.request = Request("GET", "https://example.com")
    response._content = json.dumps(payment_response.model_dump(by_alias=True)).encode()

    retry_response = Response(200)
    retry_response.headers = {
        "X-Payment-Response": base64.b64encode(
            json.dumps({"success": True}).encode()
        ).decode()
    }

    mock_client = AsyncMock()
    mock_client.send.return_value = retry_response
    mock_client.__aenter__.return_value = mock_client

    hooks_instance.client.select_payment_requirements = MagicMock(
        return_value=ethereum_payment_req
    )
    hooks_instance.client.create_payment_header = MagicMock(return_value="mock_header")

    with patch("x402.clients.httpx.AsyncClient", return_value=mock_client):
        result = await hooks_instance.on_response(response)
        assert result.status_code == 200


async def test_wallet_policy_unsupported_network(account, payment_requirements):
    # Test rejection of payment on unsupported network
    limited_policy = WalletPolicy(
        payments=PaymentPolicy(
            networks={"base-sepolia": "$0.10"}  # Only base-sepolia supported
        )
    )

    hooks_dict = x402_payment_hooks(account, policy_or_max_value=limited_policy)
    hooks_instance = hooks_dict["response"][0].__self__

    # Payment on unsupported network
    arbitrum_payment_req = PaymentRequirements(
        **{
            **payment_requirements.model_dump(),
            "network": "avalanche",
            "max_amount_required": "50000",
        }  # Small amount but wrong network
    )

    payment_response = x402PaymentRequiredResponse(
        x402_version=1,
        accepts=[arbitrum_payment_req],
        error="Payment Required",
    )

    response = Response(402)
    response.request = Request("GET", "https://example.com")
    response._content = json.dumps(payment_response.model_dump(by_alias=True)).encode()

    # Should raise PaymentError due to unsupported network
    with pytest.raises(PaymentError):
        await hooks_instance.on_response(response)


async def test_wallet_policy_explicit_asset(account):
    # Test explicit asset policy validation
    explicit_asset_policy = WalletPolicy(
        payments=PaymentPolicy(
            networks={
                "base-sepolia": {
                    "0x036CbD53842c5426634e7929541eC2318f3dCF7e": AssetPolicy(
                        limit=TokenAmount(
                            amount="300000",  # 0.3 USDC
                            asset=TokenAsset(
                                address="0x036CbD53842c5426634e7929541eC2318f3dCF7e",
                                decimals=6,
                                eip712=EIP712Domain(name="USD Coin", version="2"),
                            ),
                        )
                    )
                }
            }
        )
    )

    hooks_dict = x402_payment_hooks(account, policy_or_max_value=explicit_asset_policy)
    hooks_instance = hooks_dict["response"][0].__self__

    # Payment within explicit asset limit
    payment_req = PaymentRequirements(
        scheme="exact",
        network="base-sepolia",
        asset="0x036CbD53842c5426634e7929541eC2318f3dCF7e",
        pay_to="0x0000000000000000000000000000000000000000",
        max_amount_required="250000",  # 0.25 USDC within 0.3 limit
        resource="https://example.com",
        description="test",
        max_timeout_seconds=1000,
        mime_type="text/plain",
        output_schema=None,
        extra={"name": "USD Coin", "version": "2"},
    )

    payment_response = x402PaymentRequiredResponse(
        x402_version=1,
        accepts=[payment_req],
        error="Payment Required",
    )

    response = Response(402)
    response.request = Request("GET", "https://example.com")
    response._content = json.dumps(payment_response.model_dump(by_alias=True)).encode()

    retry_response = Response(200)
    retry_response.headers = {
        "X-Payment-Response": base64.b64encode(
            json.dumps({"success": True}).encode()
        ).decode()
    }

    mock_client = AsyncMock()
    mock_client.send.return_value = retry_response
    mock_client.__aenter__.return_value = mock_client

    hooks_instance.client.select_payment_requirements = MagicMock(
        return_value=payment_req
    )
    hooks_instance.client.create_payment_header = MagicMock(return_value="mock_header")

    with patch("x402.clients.httpx.AsyncClient", return_value=mock_client):
        result = await hooks_instance.on_response(response)
        assert result.status_code == 200


async def test_wallet_policy_unsupported_asset(account):
    # Test rejection of unsupported asset in explicit policy
    explicit_asset_policy = WalletPolicy(
        payments=PaymentPolicy(
            networks={
                "base-sepolia": {
                    "0x036CbD53842c5426634e7929541eC2318f3dCF7e": AssetPolicy(  # Only USDC allowed
                        limit=TokenAmount(
                            amount="300000",
                            asset=TokenAsset(
                                address="0x036CbD53842c5426634e7929541eC2318f3dCF7e",
                                decimals=6,
                                eip712=EIP712Domain(name="USD Coin", version="2"),
                            ),
                        )
                    )
                }
            }
        )
    )

    hooks_dict = x402_payment_hooks(account, policy_or_max_value=explicit_asset_policy)
    hooks_instance = hooks_dict["response"][0].__self__

    # Payment with different asset (DAI instead of USDC)
    dai_payment_req = PaymentRequirements(
        scheme="exact",
        network="base-sepolia",
        asset="0x50c5725949A6F0c72E6C4a641F24049A917DB0Cb",  # DAI, not in policy
        pay_to="0x0000000000000000000000000000000000000000",
        max_amount_required="100000",
        resource="https://example.com",
        description="test",
        max_timeout_seconds=1000,
        mime_type="text/plain",
        output_schema=None,
        extra={"name": "DAI", "version": "1"},
    )

    payment_response = x402PaymentRequiredResponse(
        x402_version=1,
        accepts=[dai_payment_req],
        error="Payment Required",
    )

    response = Response(402)
    response.request = Request("GET", "https://example.com")
    response._content = json.dumps(payment_response.model_dump(by_alias=True)).encode()

    # Should raise PaymentError due to unsupported asset
    with pytest.raises(PaymentError):
        await hooks_instance.on_response(response)


async def test_wallet_policy_mixed_format(account):
    # Test mixed policy format (shorthand + explicit)
    mixed_policy = WalletPolicy(
        payments=PaymentPolicy(
            networks={
                "base-sepolia": "$0.10",  # Shorthand for USDC
                "ethereum": {
                    "0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48": AssetPolicy(  # Explicit USDC
                        limit=TokenAmount(
                            amount="500000",  # 0.5 USDC
                            asset=TokenAsset(
                                address="0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48",
                                decimals=6,
                                eip712=EIP712Domain(name="USD Coin", version="2"),
                            ),
                        )
                    )
                },
            }
        )
    )

    hooks_dict = x402_payment_hooks(account, policy_or_max_value=mixed_policy)
    hooks_instance = hooks_dict["response"][0].__self__

    # Test shorthand network payment first
    sepolia_payment_req = PaymentRequirements(
        scheme="exact",
        network="base-sepolia",
        asset="0x036CbD53842c5426634e7929541eC2318f3dCF7e",  # USDC on base-sepolia
        pay_to="0x0000000000000000000000000000000000000000",
        max_amount_required="80000",  # 0.08 USDC within 0.10 limit
        resource="https://example.com",
        description="test",
        max_timeout_seconds=1000,
        mime_type="text/plain",
        output_schema=None,
        extra={"name": "USD Coin", "version": "2"},
    )

    payment_response = x402PaymentRequiredResponse(
        x402_version=1,
        accepts=[sepolia_payment_req],
        error="Payment Required",
    )

    response = Response(402)
    response.request = Request("GET", "https://example.com")
    response._content = json.dumps(payment_response.model_dump(by_alias=True)).encode()

    retry_response = Response(200)
    retry_response.headers = {
        "X-Payment-Response": base64.b64encode(
            json.dumps({"success": True}).encode()
        ).decode()
    }

    mock_client = AsyncMock()
    mock_client.send.return_value = retry_response
    mock_client.__aenter__.return_value = mock_client

    hooks_instance.client.select_payment_requirements = MagicMock(
        return_value=sepolia_payment_req
    )
    hooks_instance.client.create_payment_header = MagicMock(return_value="mock_header")

    with patch("x402.clients.httpx.AsyncClient", return_value=mock_client):
        result = await hooks_instance.on_response(response)
        assert result.status_code == 200


async def test_wallet_policy_empty_policy(account, payment_requirements):
    # Test policy with no payments section
    empty_policy = WalletPolicy()  # Empty policy

    hooks_dict = x402_payment_hooks(account, policy_or_max_value=empty_policy)
    hooks_instance = hooks_dict["response"][0].__self__

    payment_response = x402PaymentRequiredResponse(
        x402_version=1,
        accepts=[payment_requirements],
        error="Payment Required",
    )

    response = Response(402)
    response.request = Request("GET", "https://example.com")
    response._content = json.dumps(payment_response.model_dump(by_alias=True)).encode()

    # Should raise PaymentError due to empty policy
    with pytest.raises(PaymentError):
        await hooks_instance.on_response(response)


async def test_wallet_policy_zero_amount(account):
    # Test edge case with zero amount payment
    hooks_dict = x402_payment_hooks(account)  # Default policy
    hooks_instance = hooks_dict["response"][0].__self__

    zero_amount_req = PaymentRequirements(
        scheme="exact",
        network="base-sepolia",
        asset="0x036CbD53842c5426634e7929541eC2318f3dCF7e",
        pay_to="0x0000000000000000000000000000000000000000",
        max_amount_required="0",  # Zero amount
        resource="https://example.com",
        description="test",
        max_timeout_seconds=1000,
        mime_type="text/plain",
        output_schema=None,
        extra={"name": "USD Coin", "version": "2"},
    )

    payment_response = x402PaymentRequiredResponse(
        x402_version=1,
        accepts=[zero_amount_req],
        error="Payment Required",
    )

    response = Response(402)
    response.request = Request("GET", "https://example.com")
    response._content = json.dumps(payment_response.model_dump(by_alias=True)).encode()

    retry_response = Response(200)
    retry_response.headers = {
        "X-Payment-Response": base64.b64encode(
            json.dumps({"success": True}).encode()
        ).decode()
    }

    mock_client = AsyncMock()
    mock_client.send.return_value = retry_response
    mock_client.__aenter__.return_value = mock_client

    hooks_instance.client.select_payment_requirements = MagicMock(
        return_value=zero_amount_req
    )
    hooks_instance.client.create_payment_header = MagicMock(return_value="mock_header")

    with patch("x402.clients.httpx.AsyncClient", return_value=mock_client):
        result = await hooks_instance.on_response(response)
        assert result.status_code == 200


async def test_wallet_policy_exceeding_explicit_limit(account):
    # Test payment exceeding explicit asset limit
    explicit_asset_policy = WalletPolicy(
        payments=PaymentPolicy(
            networks={
                "base-sepolia": {
                    "0x036CbD53842c5426634e7929541eC2318f3dCF7e": AssetPolicy(
                        limit=TokenAmount(
                            amount="200000",  # 0.2 USDC limit
                            asset=TokenAsset(
                                address="0x036CbD53842c5426634e7929541eC2318f3dCF7e",
                                decimals=6,
                                eip712=EIP712Domain(name="USD Coin", version="2"),
                            ),
                        )
                    )
                }
            }
        )
    )

    hooks_dict = x402_payment_hooks(account, policy_or_max_value=explicit_asset_policy)
    hooks_instance = hooks_dict["response"][0].__self__

    # Payment exceeding explicit asset limit
    payment_req = PaymentRequirements(
        scheme="exact",
        network="base-sepolia",
        asset="0x036CbD53842c5426634e7929541eC2318f3dCF7e",
        pay_to="0x0000000000000000000000000000000000000000",
        max_amount_required="250000",  # 0.25 USDC exceeds 0.2 limit
        resource="https://example.com",
        description="test",
        max_timeout_seconds=1000,
        mime_type="text/plain",
        output_schema=None,
        extra={"name": "USD Coin", "version": "2"},
    )

    payment_response = x402PaymentRequiredResponse(
        x402_version=1,
        accepts=[payment_req],
        error="Payment Required",
    )

    response = Response(402)
    response.request = Request("GET", "https://example.com")
    response._content = json.dumps(payment_response.model_dump(by_alias=True)).encode()

    # Should raise PaymentError due to exceeding limit
    with pytest.raises(PaymentError):
        await hooks_instance.on_response(response)


def test_wallet_policy_backwards_compatibility_different_amounts(account):
    # Test backwards compatibility with different legacy amounts
    custom_legacy_value = 20000  # 0.02 USDC
    hooks_dict = x402_payment_hooks(account, policy_or_max_value=custom_legacy_value)
    hooks_instance = hooks_dict["response"][0].__self__

    assert hooks_instance.client.policy_or_max_value == custom_legacy_value

    # Test with larger legacy amount
    large_legacy_value = 500000  # 0.5 USDC
    hooks_dict = x402_payment_hooks(account, policy_or_max_value=large_legacy_value)
    hooks_instance = hooks_dict["response"][0].__self__

    assert hooks_instance.client.policy_or_max_value == large_legacy_value
