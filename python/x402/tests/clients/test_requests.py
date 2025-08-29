import pytest
import json
import base64
from unittest.mock import MagicMock, patch
from requests import Response, PreparedRequest, Session
from eth_account import Account
from x402.clients.requests import (
    x402HTTPAdapter,
    x402_http_adapter,
    x402_requests,
)
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
def session(account):
    return x402_requests(account)


@pytest.fixture
def adapter(account):
    return x402_http_adapter(account)


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


def test_request_success(session):
    # Test successful request (200)
    mock_response = Response()
    mock_response.status_code = 200
    mock_response._content = b"success"

    with patch.object(session, "send", return_value=mock_response) as mock_send:
        response = session.request("GET", "https://example.com")
        assert response.status_code == 200
        assert response.content == b"success"
        mock_send.assert_called_once()


def test_request_non_402(session):
    # Test non-402 response
    mock_response = Response()
    mock_response.status_code = 404
    mock_response._content = b"not found"

    with patch.object(session, "send", return_value=mock_response) as mock_send:
        response = session.request("GET", "https://example.com")
        assert response.status_code == 404
        assert response.content == b"not found"
        mock_send.assert_called_once()


def test_adapter_send_success(adapter):
    # Test adapter with successful response
    mock_response = Response()
    mock_response.status_code = 200
    mock_response._content = b"success"

    # Create a prepared request
    request = PreparedRequest()
    request.prepare("GET", "https://example.com")

    with patch("requests.adapters.HTTPAdapter.send", return_value=mock_response):
        response = adapter.send(request)
        assert response.status_code == 200
        assert response.content == b"success"


def test_adapter_send_non_402(adapter):
    # Test adapter with non-402 response
    mock_response = Response()
    mock_response.status_code = 404
    mock_response._content = b"not found"

    # Create a prepared request
    request = PreparedRequest()
    request.prepare("GET", "https://example.com")

    with patch("requests.adapters.HTTPAdapter.send", return_value=mock_response):
        response = adapter.send(request)
        assert response.status_code == 404
        assert response.content == b"not found"


def test_adapter_retry(adapter):
    # Test retry handling in adapter
    mock_response = Response()
    mock_response.status_code = 402
    mock_response._content = b"payment required"

    # Create a prepared request
    request = PreparedRequest()
    request.prepare("GET", "https://example.com")

    # Set retry flag to true
    adapter._is_retry = True

    with patch("requests.adapters.HTTPAdapter.send", return_value=mock_response):
        response = adapter.send(request)
        assert response.status_code == 402
        assert response.content == b"payment required"
        # Verify retry flag is reset after call
        assert not adapter._is_retry


def test_adapter_payment_flow(adapter, payment_requirements):
    # Mock the payment required response
    payment_response = x402PaymentRequiredResponse(
        x402_version=1,
        accepts=[payment_requirements],
        error="Payment Required",
    )

    # Create initial 402 response
    initial_response = Response()
    initial_response.status_code = 402
    initial_response._content = json.dumps(
        payment_response.model_dump(by_alias=True)
    ).encode()

    # Mock the retry response with payment response header
    payment_result = {
        "success": True,
        "transaction": "0x1234",
        "network": "base-sepolia",
        "payer": "0x5678",
    }
    retry_response = Response()
    retry_response.status_code = 200
    retry_response.headers = {
        "X-Payment-Response": base64.b64encode(
            json.dumps(payment_result).encode()
        ).decode()
    }
    retry_response._content = b"success"

    # Create a prepared request
    request = PreparedRequest()
    request.prepare("GET", "https://example.com")
    request.headers = {}

    # Mock client methods
    adapter.client.select_payment_requirements = MagicMock(
        return_value=payment_requirements
    )
    mock_header = "mock_payment_header"
    adapter.client.create_payment_header = MagicMock(return_value=mock_header)

    # Mock the send method to return different responses
    def mock_send_impl(req, **kwargs):
        if adapter._is_retry:
            return retry_response
        return initial_response

    with patch(
        "requests.adapters.HTTPAdapter.send", side_effect=mock_send_impl
    ) as mock_send:
        response = adapter.send(request)

        # Verify the result
        assert response.status_code == 200
        assert "X-Payment-Response" in response.headers

        # Verify the mocked methods were called with correct arguments
        adapter.client.select_payment_requirements.assert_called_once_with(
            [payment_requirements]
        )
        adapter.client.create_payment_header.assert_called_once_with(
            payment_requirements, 1
        )

        # Verify the retry request was made with correct headers
        assert mock_send.call_count == 2
        retry_call = mock_send.call_args_list[1]
        retry_request = retry_call[0][0]
        assert retry_request.headers["X-Payment"] == mock_header
        assert (
            retry_request.headers["Access-Control-Expose-Headers"]
            == "X-Payment-Response"
        )


def test_adapter_payment_error(adapter, payment_requirements):
    # Mock the payment required response with unsupported scheme
    payment_requirements.scheme = "unsupported"
    payment_response = x402PaymentRequiredResponse(
        x402_version=1,
        accepts=[payment_requirements],
        error="Payment Required",
    )

    # Create initial 402 response
    initial_response = Response()
    initial_response.status_code = 402
    initial_response._content = json.dumps(
        payment_response.model_dump(by_alias=True)
    ).encode()

    # Create a prepared request
    request = PreparedRequest()
    request.prepare("GET", "https://example.com")

    with patch("requests.adapters.HTTPAdapter.send", return_value=initial_response):
        with pytest.raises(PaymentError):
            adapter.send(request)

        # Verify retry flag is reset
        assert not adapter._is_retry


def test_adapter_general_error(adapter):
    # Create initial 402 response with invalid JSON
    initial_response = Response()
    initial_response.status_code = 402
    initial_response._content = b"invalid json"

    # Create a prepared request
    request = PreparedRequest()
    request.prepare("GET", "https://example.com")

    with patch("requests.adapters.HTTPAdapter.send", return_value=initial_response):
        with pytest.raises(PaymentError):
            adapter.send(request)

        # Verify retry flag is reset
        assert not adapter._is_retry


def test_x402_http_adapter(account):
    # Test basic adapter creation (default policy)
    adapter = x402_http_adapter(account)
    assert isinstance(adapter, x402HTTPAdapter)
    assert adapter.client.account == account
    assert adapter.client.policy_or_max_value is None

    # Test with legacy max_value (backwards compatibility)
    adapter = x402_http_adapter(account, policy_or_max_value=100000)
    assert adapter.client.policy_or_max_value == 100000

    # Test with WalletPolicy
    policy = WalletPolicy(payments=PaymentPolicy(networks={"base-sepolia": "$0.05"}))
    adapter = x402_http_adapter(account, policy_or_max_value=policy)
    assert adapter.client.policy_or_max_value == policy

    # Test with custom selector
    def custom_selector(
        accepts, network_filter=None, scheme_filter=None, max_value=None
    ):
        return accepts[0]

    adapter = x402_http_adapter(account, payment_requirements_selector=custom_selector)
    assert adapter.client._payment_requirements_selector == custom_selector

    # Test passing adapter kwargs
    adapter = x402_http_adapter(account, pool_connections=10, pool_maxsize=100)
    # Note: HTTPAdapter doesn't expose these properties, so we can't directly assert them


def test_x402_requests(account):
    # Test session creation (default policy)
    session = x402_requests(account)
    assert isinstance(session, Session)

    # Check http adapter mounting
    adapter = session.adapters.get("http://")
    assert isinstance(adapter, x402HTTPAdapter)
    assert adapter.client.account == account

    # Check https adapter mounting
    adapter = session.adapters.get("https://")
    assert isinstance(adapter, x402HTTPAdapter)
    assert adapter.client.account == account

    # Test with legacy max_value (backwards compatibility)
    session = x402_requests(account, policy_or_max_value=100000)
    adapter = session.adapters.get("http://")
    assert adapter.client.policy_or_max_value == 100000

    # Test with WalletPolicy
    policy = WalletPolicy(payments=PaymentPolicy(networks={"base-sepolia": "$0.25"}))
    session = x402_requests(account, policy_or_max_value=policy)
    adapter = session.adapters.get("http://")
    assert adapter.client.policy_or_max_value == policy

    # Test with custom selector
    def custom_selector(
        accepts, network_filter=None, scheme_filter=None, max_value=None
    ):
        return accepts[0]

    session = x402_requests(account, payment_requirements_selector=custom_selector)
    adapter = session.adapters.get("http://")
    assert adapter.client._payment_requirements_selector == custom_selector


def test_adapter_multi_network_policy(account, payment_requirements):
    # Test multi-network policy validation
    multi_network_policy = WalletPolicy(
        payments=PaymentPolicy(
            networks={"base-sepolia": "$0.10", "base": "$0.25", "avalanche": "$0.05"}
        )
    )

    adapter = x402_http_adapter(account, policy_or_max_value=multi_network_policy)

    # Mock the payment required response for ethereum payment
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

    initial_response = Response()
    initial_response.status_code = 402
    initial_response._content = json.dumps(
        payment_response.model_dump(by_alias=True)
    ).encode()

    retry_response = Response()
    retry_response.status_code = 200
    retry_response.headers = {
        "X-Payment-Response": base64.b64encode(
            json.dumps({"success": True}).encode()
        ).decode()
    }
    retry_response._content = b"success"

    request = PreparedRequest()
    request.prepare("GET", "https://example.com")
    request.headers = {}

    adapter.client.select_payment_requirements = MagicMock(
        return_value=ethereum_payment_req
    )
    adapter.client.create_payment_header = MagicMock(return_value="mock_header")

    def mock_send_impl(req, **kwargs):
        if adapter._is_retry:
            return retry_response
        return initial_response

    with patch("requests.adapters.HTTPAdapter.send", side_effect=mock_send_impl):
        response = adapter.send(request)
        assert response.status_code == 200


def test_adapter_unsupported_network_policy(account, payment_requirements):
    # Test rejection of payment on unsupported network
    limited_policy = WalletPolicy(
        payments=PaymentPolicy(
            networks={"base-sepolia": "$0.10"}  # Only base-sepolia supported
        )
    )

    adapter = x402_http_adapter(account, policy_or_max_value=limited_policy)

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

    initial_response = Response()
    initial_response.status_code = 402
    initial_response._content = json.dumps(
        payment_response.model_dump(by_alias=True)
    ).encode()

    request = PreparedRequest()
    request.prepare("GET", "https://example.com")

    with patch("requests.adapters.HTTPAdapter.send", return_value=initial_response):
        with pytest.raises(PaymentError):
            adapter.send(request)


def test_adapter_explicit_asset_policy(account):
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

    adapter = x402_http_adapter(account, policy_or_max_value=explicit_asset_policy)

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

    initial_response = Response()
    initial_response.status_code = 402
    initial_response._content = json.dumps(
        payment_response.model_dump(by_alias=True)
    ).encode()

    retry_response = Response()
    retry_response.status_code = 200
    retry_response.headers = {
        "X-Payment-Response": base64.b64encode(
            json.dumps({"success": True}).encode()
        ).decode()
    }
    retry_response._content = b"success"

    request = PreparedRequest()
    request.prepare("GET", "https://example.com")
    request.headers = {}

    adapter.client.select_payment_requirements = MagicMock(return_value=payment_req)
    adapter.client.create_payment_header = MagicMock(return_value="mock_header")

    def mock_send_impl(req, **kwargs):
        if adapter._is_retry:
            return retry_response
        return initial_response

    with patch("requests.adapters.HTTPAdapter.send", side_effect=mock_send_impl):
        response = adapter.send(request)
        assert response.status_code == 200


def test_adapter_unsupported_asset_policy(account):
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

    adapter = x402_http_adapter(account, policy_or_max_value=explicit_asset_policy)

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

    initial_response = Response()
    initial_response.status_code = 402
    initial_response._content = json.dumps(
        payment_response.model_dump(by_alias=True)
    ).encode()

    request = PreparedRequest()
    request.prepare("GET", "https://example.com")

    with patch("requests.adapters.HTTPAdapter.send", return_value=initial_response):
        with pytest.raises(PaymentError):
            adapter.send(request)


def test_adapter_mixed_policy_format(account):
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

    adapter = x402_http_adapter(account, policy_or_max_value=mixed_policy)

    # Test shorthand network payment
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

    initial_response = Response()
    initial_response.status_code = 402
    initial_response._content = json.dumps(
        payment_response.model_dump(by_alias=True)
    ).encode()

    retry_response = Response()
    retry_response.status_code = 200
    retry_response.headers = {
        "X-Payment-Response": base64.b64encode(
            json.dumps({"success": True}).encode()
        ).decode()
    }
    retry_response._content = b"success"

    request = PreparedRequest()
    request.prepare("GET", "https://example.com")
    request.headers = {}

    adapter.client.select_payment_requirements = MagicMock(
        return_value=sepolia_payment_req
    )
    adapter.client.create_payment_header = MagicMock(return_value="mock_header")

    def mock_send_impl(req, **kwargs):
        if adapter._is_retry:
            return retry_response
        return initial_response

    with patch("requests.adapters.HTTPAdapter.send", side_effect=mock_send_impl):
        response = adapter.send(request)
        assert response.status_code == 200


def test_adapter_empty_policy(account, payment_requirements):
    # Test policy with no payments section
    empty_policy = WalletPolicy()  # Empty policy

    adapter = x402_http_adapter(account, policy_or_max_value=empty_policy)

    payment_response = x402PaymentRequiredResponse(
        x402_version=1,
        accepts=[payment_requirements],
        error="Payment Required",
    )

    initial_response = Response()
    initial_response.status_code = 402
    initial_response._content = json.dumps(
        payment_response.model_dump(by_alias=True)
    ).encode()

    request = PreparedRequest()
    request.prepare("GET", "https://example.com")

    with patch("requests.adapters.HTTPAdapter.send", return_value=initial_response):
        with pytest.raises(PaymentError):
            adapter.send(request)


def test_adapter_zero_amount_payment(account):
    # Test edge case with zero amount payment
    adapter = x402_http_adapter(account)  # Default policy

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

    initial_response = Response()
    initial_response.status_code = 402
    initial_response._content = json.dumps(
        payment_response.model_dump(by_alias=True)
    ).encode()

    retry_response = Response()
    retry_response.status_code = 200
    retry_response.headers = {
        "X-Payment-Response": base64.b64encode(
            json.dumps({"success": True}).encode()
        ).decode()
    }
    retry_response._content = b"success"

    request = PreparedRequest()
    request.prepare("GET", "https://example.com")
    request.headers = {}

    adapter.client.select_payment_requirements = MagicMock(return_value=zero_amount_req)
    adapter.client.create_payment_header = MagicMock(return_value="mock_header")

    def mock_send_impl(req, **kwargs):
        if adapter._is_retry:
            return retry_response
        return initial_response

    with patch("requests.adapters.HTTPAdapter.send", side_effect=mock_send_impl):
        response = adapter.send(request)
        assert response.status_code == 200


def test_adapter_exceeding_explicit_limit(account):
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

    adapter = x402_http_adapter(account, policy_or_max_value=explicit_asset_policy)

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

    initial_response = Response()
    initial_response.status_code = 402
    initial_response._content = json.dumps(
        payment_response.model_dump(by_alias=True)
    ).encode()

    request = PreparedRequest()
    request.prepare("GET", "https://example.com")

    with patch("requests.adapters.HTTPAdapter.send", return_value=initial_response):
        with pytest.raises(PaymentError):
            adapter.send(request)


def test_backwards_compatibility_different_amounts(account):
    # Test backwards compatibility with different legacy amounts
    custom_legacy_value = 20000  # 0.02 USDC
    adapter = x402_http_adapter(account, policy_or_max_value=custom_legacy_value)
    assert adapter.client.policy_or_max_value == custom_legacy_value

    # Test with larger legacy amount
    large_legacy_value = 500000  # 0.5 USDC
    adapter = x402_http_adapter(account, policy_or_max_value=large_legacy_value)
    assert adapter.client.policy_or_max_value == large_legacy_value

    # Test session with legacy amounts
    session = x402_requests(account, policy_or_max_value=custom_legacy_value)
    adapter = session.adapters.get("http://")
    assert adapter.client.policy_or_max_value == custom_legacy_value
