from typing import Callable, Optional
from unittest.mock import create_autospec

import pytest

from x402.client.x402_client import (
    AbortResult,
    PaymentCreatedContext,
    PaymentCreationContext,
    PaymentCreationFailureContext,
    RecoveredResult,
    SchemeRegistration,
    X402Client,
    X402ClientConfig,
)
from x402.core import X402_VERSION
from x402.core.types.mechanisms import SchemeNetworkClient
from x402.core.types.payments import (
    Extension,
    PaymentPayload,
    PaymentPayloadV1,
    PaymentRequired,
    PaymentRequirements,
    ResourceInfo,
)

TEST_SCHEME = "test-scheme"
TEST_NETWORK = "test:network"


def build_payment_requirements(
    scheme=TEST_SCHEME, network=TEST_NETWORK, amount="1000", max_timeout_seconds=1000
) -> PaymentRequirements:
    return PaymentRequirements(
        scheme=scheme,
        network=network,
        asset="0x036CbD53842c5426634e7929541eC2318f3dCF7e",
        amount=amount,
        pay_to="0x0000000000000000000000000000000000000000",
        max_timeout_seconds=max_timeout_seconds,
        extra={
            "name": "USD Coin",
            "version": "2",
        },
    )


def build_resource_info() -> ResourceInfo:
    return ResourceInfo(
        url="https://example.com/api/locked",
        description="Pay to access this resource.",
        mime_type="application/json",
    )


def build_payment_required(
    x402_version=X402_VERSION, accepts=[], extensions=None
) -> PaymentRequired:
    return PaymentRequired(
        x402_version=x402_version,
        resource=build_resource_info(),
        accepts=accepts,
        extensions=extensions,
    )


def build_payload() -> dict:
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


def build_payment_payload(x402_version=X402_VERSION) -> PaymentPayload:
    return PaymentPayload(
        x402_version=x402_version,
        resource=build_resource_info(),
        accepted=build_payment_requirements(),
        payload=build_payload(),
    )


@pytest.fixture
def payload():
    return build_payload()


@pytest.fixture
def scheme_network_client(payload):
    scheme_network_client = create_autospec(SchemeNetworkClient, instance=True)
    scheme_network_client.scheme = TEST_SCHEME
    scheme_network_client.create_payment_payload.return_value = {
        "x402_version": X402_VERSION,
        "payload": payload,
    }
    return scheme_network_client


@pytest.fixture
def payment_requirements_1():
    return build_payment_requirements(amount="10000")


@pytest.fixture
def payment_requirements_2():
    return build_payment_requirements(amount="3000", max_timeout_seconds=500)


@pytest.fixture
def payment_requirements_3():
    return build_payment_requirements(max_timeout_seconds=300)


@pytest.fixture
def extension():
    return Extension(
        schema={"detail": "string"},
        info={"detail": "hello world!"},
    )


@pytest.fixture
def resource_info():
    return build_resource_info()


@pytest.fixture
def payment_required(
    payment_requirements_1, payment_requirements_2, payment_requirements_3, extension
):
    return build_payment_required(
        accepts=[
            payment_requirements_1,
            payment_requirements_2,
            payment_requirements_3,
        ],
        extensions={"test-extension": extension},
    )


@pytest.fixture
def v1_payment_required(payment_requirements_1, payment_requirements_2, extension):
    return build_payment_required(
        x402_version=1,
        accepts=[payment_requirements_1, payment_requirements_2],
        extensions={"test-extension": extension},
    )


@pytest.fixture
def empty_payment_required(resource_info):
    return build_payment_required(accepts=[])


@pytest.fixture
def payment_payload():
    return build_payment_payload()


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


def test_x402_client_creation_from_config(scheme_network_client):
    scheme_registration = SchemeRegistration(TEST_NETWORK, scheme_network_client)
    policy1 = lambda version, reqs: reqs
    policy2 = lambda version, reqs: reqs
    custom_selector = lambda version, accepts: accepts[-1]
    config = X402ClientConfig(
        schemes=[scheme_registration],
        policies=[policy1, policy2],
        payment_requirements_selector=custom_selector,
    )

    # With full config
    client = X402Client.from_config(config)
    assert (
        client.registered_client_schemes[X402_VERSION][TEST_NETWORK][TEST_SCHEME]
        is scheme_network_client
    )
    assert client.policies == [policy1, policy2]
    assert client.payment_requirements_selector is custom_selector

    # With partial config
    config = X402ClientConfig(schemes=[scheme_registration])
    client = X402Client.from_config(config)
    assert (
        client.registered_client_schemes[X402_VERSION][TEST_NETWORK][TEST_SCHEME]
        is scheme_network_client
    )
    assert client.policies == []
    assert isinstance(client.payment_requirements_selector, Callable)

    # For V1
    scheme_registration = SchemeRegistration(
        TEST_NETWORK, scheme_network_client, x402_version=1
    )
    config = X402ClientConfig(schemes=[scheme_registration])
    client = X402Client.from_config(config)
    assert (
        client.registered_client_schemes[1][TEST_NETWORK][TEST_SCHEME]
        is scheme_network_client
    )


def test_x402_register_scheme_for_current_version(scheme_network_client, payload):
    client = X402Client()

    # Asserts the scheme network client is being registered
    result = client.register_scheme(TEST_NETWORK, scheme_network_client)
    assert result is client
    assert (
        client.registered_client_schemes[X402_VERSION][TEST_NETWORK][TEST_SCHEME]
        is scheme_network_client
    )

    # Verify another scheme can be added to the same network
    another_scheme = "another-scheme"
    another_mock_network_client = create_autospec(SchemeNetworkClient, instance=True)
    another_mock_network_client.scheme = another_scheme
    another_mock_network_client.create_payment_payload.return_value = {
        "x402_version": X402_VERSION,
        "payload": payload,
    }
    client.register_scheme(TEST_NETWORK, another_mock_network_client)
    assert (
        client.registered_client_schemes[X402_VERSION][TEST_NETWORK][another_scheme]
        is another_mock_network_client
    )

    # Verify the same scheme can be on another network
    another_network = "another:network"
    client.register_scheme(another_network, scheme_network_client)
    assert (
        client.registered_client_schemes[X402_VERSION][another_network][TEST_SCHEME]
        is scheme_network_client
    )

    # Verify that can register scheme for V1
    result = client.register_scheme_V1(TEST_NETWORK, scheme_network_client)
    assert result is client
    assert (
        client.registered_client_schemes[1][TEST_NETWORK][TEST_SCHEME]
        is scheme_network_client
    )


async def test_x402_client_registers_policies_in_order(
    scheme_network_client, payment_required
):
    execution_order: list[int] = []

    def policy1(_, reqs):
        execution_order.append(1)
        return reqs

    def policy2(_, reqs):
        execution_order.append(2)
        return reqs

    client = X402Client()
    result = (
        client.register_scheme(TEST_NETWORK, scheme_network_client)
        .register_policy(policy1)
        .register_policy(policy2)
    )
    assert result is client
    await client.create_payment_payload(payment_required)

    # Verify that policy filters are applied in order
    assert execution_order == [1, 2]


async def test_x402_client_create_payment_payload(
    scheme_network_client,
    payment_required,
    resource_info,
    payment_requirements_1,
    payload,
    extension,
):
    client = X402Client().register_scheme(TEST_NETWORK, scheme_network_client)

    result: PaymentPayload = await client.create_payment_payload(payment_required)

    # Assert the resulting PaymentPayload has the same values as the payment_required fixture
    assert result.x402_version == X402_VERSION
    assert result.payload == payload
    assert result.resource == resource_info
    assert (
        result.accepted == payment_requirements_1
    )  # Default selector chooses the first one
    assert result.extensions == {"test-extension": extension}

    # Assert SchemeNetworkClient::create_payment_payload is called with expected parameters
    scheme_network_client.create_payment_payload.assert_called_once_with(
        X402_VERSION, payment_requirements_1
    )


async def test_x402_client_create_payment_payload_for_v1(
    v1_payment_required, payload, payment_requirements_1
):
    scheme_network_client = create_autospec(SchemeNetworkClient, instance=True)
    scheme_network_client.scheme = TEST_SCHEME
    scheme_network_client.create_payment_payload.return_value = {
        "x402_version": 1,
        "scheme": TEST_SCHEME,
        "network": TEST_NETWORK,
        "payload": payload,
    }
    client = X402Client().register_scheme_V1(TEST_NETWORK, scheme_network_client)

    result: PaymentPayloadV1 = await client.create_payment_payload(v1_payment_required)

    # Assert the resulting PaymentPayload has the same values as the payment_required fixture
    assert result.x402_version == 1
    assert result.scheme == TEST_SCHEME
    assert result.network == TEST_NETWORK
    assert result.payload == payload

    # Assert SchemeNetworkClient::create_payment_payload is called with expected parameters
    scheme_network_client.create_payment_payload.assert_called_once_with(
        1, payment_requirements_1
    )


async def test_x402_client_raises_error_when_no_scheme_network_client_is_registered(
    payment_required,
):
    client = X402Client()
    with pytest.raises(Exception) as exc:
        await client.create_payment_payload(payment_required)
    assert "No client registered for x402 version: 2" in str(exc.value)


async def test_x402_client_raises_error_when_no_matching_client_is_found(
    scheme_network_client, payment_required
):
    client = X402Client().register_scheme("another:network", scheme_network_client)
    with pytest.raises(Exception) as exc:
        await client.create_payment_payload(payment_required)
    assert str(exc.value).startswith(
        "No network/scheme registered for x402 version: 2 which comply with the payment requirements."
    )


async def test_x402_client_raises_error_when_payment_required_accepted_list_is_empty(
    scheme_network_client, empty_payment_required
):
    client = X402Client().register_scheme(TEST_NETWORK, scheme_network_client)
    with pytest.raises(Exception) as exc:
        await client.create_payment_payload(empty_payment_required)
    assert str(exc.value).startswith(
        "No network/scheme registered for x402 version: 2 which comply with the payment requirements."
    )


async def test_x402_client_filters_requirement_based_on_policy(
    scheme_network_client, payment_required, payment_requirements_2
):
    # Only allows requirements with max_timeout_seconds less than 800
    limited_timeout_policy = lambda version, reqs: list(
        filter(lambda r: int(r.max_timeout_seconds) < 800, reqs)
    )

    client = (
        X402Client()
        .register_scheme(TEST_NETWORK, scheme_network_client)
        .register_policy(limited_timeout_policy)
    )

    result = await client.create_payment_payload(payment_required)
    # payment_requirements_2 has max_timeout_seconds of 500 while payment_requirements_1's is 1000
    # then chooses payment_requirements_2 instead of payment_requirements_3 because it comes first
    assert result.accepted == payment_requirements_2


async def test_x402_client_applies_multiple_policies_in_order(
    scheme_network_client, payment_required, payment_requirements_3
):
    # Only allows requirements with max_timeout_seconds less than 800
    limited_timeout_policy = lambda version, reqs: list(
        filter(lambda r: int(r.max_timeout_seconds) < 800, reqs)
    )
    # Only allows requirements with amount less than 2000
    cheap_policy = lambda version, reqs: list(
        filter(lambda r: int(r.amount) < 2000, reqs)
    )

    client = (
        X402Client()
        .register_scheme(TEST_NETWORK, scheme_network_client)
        .register_policy(limited_timeout_policy)
        .register_policy(cheap_policy)
    )

    result = await client.create_payment_payload(payment_required)
    # payment_requirements_3 is the only requirement that passes both policies
    assert result.accepted == payment_requirements_3


async def test_x402_client_raises_error_when_all_requirements_are_filtered_out_by_policies(
    scheme_network_client, payment_required
):
    # Only allows requirements with amount less than 100
    very_cheap_policy = lambda version, reqs: list(
        filter(lambda r: int(r.amount) < 100, reqs)
    )
    client = (
        X402Client()
        .register_scheme(TEST_NETWORK, scheme_network_client)
        .register_policy(very_cheap_policy)
    )

    with pytest.raises(Exception) as exc:
        await client.create_payment_payload(payment_required)
    assert (
        "All payment requirements were filtered out by policies for x402 version: 2"
        in str(exc.value)
    )


async def test_x402_client_only_selects_requirements_for_registered_schemes(
    scheme_network_client,
):
    # Only register "test-scheme"
    client = X402Client().register_scheme(TEST_NETWORK, scheme_network_client)

    req1 = build_payment_requirements(scheme="another-scheme")
    req2 = build_payment_requirements(scheme="test-scheme")
    req3 = build_payment_requirements(scheme="different-scheme")
    payment_required = build_payment_required(accepts=[req1, req2, req3])

    result = await client.create_payment_payload(payment_required)
    # req2 is the only requirements for "test-scheme"
    assert result.accepted == req2


async def test_x402_client_raises_error_when_no_registered_scheme_matches_any_requirement(
    scheme_network_client,
):
    # Only register "test-scheme"
    client = X402Client().register_scheme(TEST_NETWORK, scheme_network_client)

    req1 = build_payment_requirements(scheme="another-scheme")
    req2 = build_payment_requirements(network="another:network")
    payment_required = build_payment_required(accepts=[req1, req2])

    with pytest.raises(Exception) as exc:
        await client.create_payment_payload(payment_required)
    assert str(exc.value).startswith(
        "No network/scheme registered for x402 version: 2 which comply with the payment requirements."
    )


async def test_x402_client_default_selector_chooses_first_requirements_available(
    scheme_network_client, payment_required, payment_requirements_1
):
    client = X402Client().register_scheme(TEST_NETWORK, scheme_network_client)

    result = await client.create_payment_payload(payment_required)
    # Default selector chooses first
    assert result.accepted == payment_requirements_1


async def test_x402_client_respects_custom_selector(scheme_network_client):
    # Creates a custom selector that chooses the requirements with lowest 'amount'
    custom_selector = lambda version, reqs: sorted(
        reqs, key=lambda req: int(req.amount)
    )[0]
    client = X402Client(custom_selector).register_scheme(
        TEST_NETWORK, scheme_network_client
    )

    req1 = build_payment_requirements(amount="3000")
    req2 = build_payment_requirements(amount="1000")
    req3 = build_payment_requirements(amount="2000")
    payment_required = build_payment_required(accepts=[req1, req2, req3])

    result = await client.create_payment_payload(payment_required)
    assert result.accepted == req2


def test_x402_client_can_add_before_payment_creation_hooks():
    client = X402Client()

    def hook1(_: PaymentCreationContext) -> Optional[AbortResult]:
        return None

    def hook2(_: PaymentCreationContext) -> Optional[AbortResult]:
        return AbortResult(abort=True, reason="testing")

    client.on_before_payment_creation(hook1)
    result = client.on_before_payment_creation(hook2)

    assert isinstance(result, X402Client)
    assert client.before_payment_creation_hooks == [hook1, hook2]


def test_x402_client_can_add_after_payment_creation_hooks():
    client = X402Client()

    def hook1(_: PaymentCreatedContext) -> None:
        return None

    def hook2(_: PaymentCreatedContext) -> None:
        return None

    client.on_after_payment_creation(hook1)
    result = client.on_after_payment_creation(hook2)

    assert isinstance(result, X402Client)
    assert client.after_payment_creation_hooks == [hook1, hook2]


def test_x402_client_can_add_on_payment_creation_failure_hooks(payment_payload):
    client = X402Client()

    def hook1(_: PaymentCreationFailureContext) -> Optional[RecoveredResult]:
        return None

    def hook2(_: PaymentCreationFailureContext) -> Optional[RecoveredResult]:
        return RecoveredResult(recoverd=True, payload=payment_payload)

    client.on_after_payment_creation(hook1)
    result = client.on_after_payment_creation(hook2)

    assert isinstance(result, X402Client)
    assert client.after_payment_creation_hooks == [hook1, hook2]
