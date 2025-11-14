from typing import Any, Callable

import pytest

from x402.client.x402_client import X402Client
from x402.core import X402_VERSION
from x402.core.types import Version
from x402.core.types.payments import PaymentRequirements


class MockSchemeNetworkClient:
    def __init__(self, scheme: str):
        self.scheme = scheme

    def _build_mock_payload(self) -> dict[str, str]:
        return {
            "signature": "0x2d6a7588d6acca505cbf0d9a4a227e0c52c6c34008c8e8986a1283259764173608a2ce6496642e377d6da8dbbf5836e9bd15092f9ecab05ded3d6293af148b571c",
            "authorization": {
                "from": "0x857b06519E91e3A54538791bDbb0E22373e36b66",
                "to": "0x209693Bc6afc0C5328bA36FaF03C514EF312287C",
                "value": "10000",
                "validAfter": "1740672089",
                "validBefore": "1740672154",
                "nonce": "0xf3746613c2d920b5fdabc0856f2aeb2d4f88ee6037b8cc5d04a71a4462f13480",
            },
        }

    # Implements the SchemeNetworkClient interface
    async def create_payment_payload(
        self, x402_version: Version, payment_requirements: PaymentRequirements
    ) -> dict[str, Any]:
        return {"x402_version": x402_version, "payload": self._build_mock_payload()}


@pytest.fixture
def payment_requirements_1():
    return PaymentRequirements(
        scheme="exact",
        network="base-sepolia",
        asset="0x036CbD53842c5426634e7929541eC2318f3dCF7e",
        amount="1000",
        pay_to="0x0000000000000000000000000000000000000000",
        max_timeout_seconds=1000,
        extra={
            "name": "USD Coin",
            "version": "2",
        },
    )


@pytest.fixture
def payment_requirements_2():
    return PaymentRequirements(
        scheme="exact",
        network="base-sepolia",
        asset="0x036CbD53842c5426634e7929541eC2318f3dCF7e",
        amount="10000",
        pay_to="0x0000000000000000000000000000000000000000",
        max_timeout_seconds=500,
        extra={
            "name": "USD Coin",
            "version": "2",
        },
    )


def test_x402_default_client_creation(payment_requirements_1, payment_requirements_2):
    client = X402Client()

    assert client is not None
    assert isinstance(client, X402Client)

    # Assert that the default payment_requirements_selector function returns the first requirement
    assert client.payment_requirements_selector is not None
    assert isinstance(client.payment_requirements_selector, Callable)
    assert (
        client.payment_requirements_selector(
            X402_VERSION, [payment_requirements_1, payment_requirements_2]
        )
        is payment_requirements_1
    )


def test_x402_client_with_custom_selector(payment_requirements_1):
    # Creates a custom selector that always return the same requirement
    custom_selector = lambda v, a: payment_requirements_1
    client = X402Client(custom_selector)

    # Asserts the custom selector is being used by the client
    assert (
        client.payment_requirements_selector(X402Client, None) == payment_requirements_1
    )


def test_x402_register_scheme_for_current_version():
    scheme = "test-scheme"
    network = "test:network"
    mock_network_client = MockSchemeNetworkClient(scheme)
    client = X402Client()

    # Asserts the scheme network client is being registered
    result = client.register_scheme(network, mock_network_client)
    assert result is client
    assert (
        client.registered_client_schemes[X402_VERSION][network][scheme]
        is mock_network_client
    )

    # Verify another scheme can be added to the same network
    another_scheme = "another-scheme"
    another_mock_network_client = MockSchemeNetworkClient(another_scheme)
    client.register_scheme(network, another_mock_network_client)
    assert (
        client.registered_client_schemes[X402_VERSION][network][another_scheme]
        is another_mock_network_client
    )

    # Verify the same scheme can be on another network
    another_network = "another:network"
    client.register_scheme(another_network, mock_network_client)
    assert (
        client.registered_client_schemes[X402_VERSION][another_network][scheme]
        is mock_network_client
    )

    # Verify that can register scheme for V1
    v1_scheme = "v1-scheme"
    v1_network = "test:v1"
    v1_mock_network_client = MockSchemeNetworkClient(v1_scheme)
    result = client.register_scheme_V1(v1_network, v1_mock_network_client)
    assert result is client
    assert (
        client.registered_client_schemes[1][v1_network][v1_scheme]
        is v1_mock_network_client
    )
