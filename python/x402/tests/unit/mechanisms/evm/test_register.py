"""Unit tests for EVM exact register helpers."""

from unittest.mock import MagicMock

import pytest

try:
    from eth_account import Account
except ImportError:
    pytest.skip("EVM register helpers require eth_account", allow_module_level=True)

from x402 import (
    x402Client,
    x402ClientSync,
    x402Facilitator,
    x402FacilitatorSync,
    x402ResourceServer,
    x402ResourceServerSync,
)
from x402.mechanisms.evm.exact import (
    ExactEvmClientScheme,
    ExactEvmFacilitatorScheme,
    ExactEvmServerScheme,
)
from x402.mechanisms.evm.exact.facilitator import ExactEvmSchemeConfig
from x402.mechanisms.evm.exact.register import (
    register_exact_evm_client,
    register_exact_evm_facilitator,
    register_exact_evm_server,
)
from x402.mechanisms.evm.exact.v1.client import ExactEvmSchemeV1 as ExactEvmClientSchemeV1
from x402.mechanisms.evm.exact.v1.facilitator import (
    ExactEvmSchemeV1 as ExactEvmFacilitatorSchemeV1,
)
from x402.mechanisms.evm.exact.v1.facilitator import ExactEvmSchemeV1Config
from x402.mechanisms.evm.signers import EthAccountSigner
from x402.mechanisms.evm.v1.constants import V1_NETWORKS

# =============================================================================
# Test fixtures
# =============================================================================


def _make_client_signer():
    """Build a minimal EVM client signer for tests."""
    account = Account.create()
    return EthAccountSigner(account)


def _make_facilitator_signer():
    """Build a stand-in object satisfying FacilitatorEvmSigner for tests.

    The register helpers only store the signer reference on the scheme
    instance — no signer methods are invoked, so a Mock is sufficient.
    """
    signer = MagicMock()
    signer.address = "0x" + "ab" * 20
    return signer


# =============================================================================
# register_exact_evm_client
# =============================================================================


class TestRegisterExactEvmClient:
    """Tests for register_exact_evm_client."""

    def test_should_return_client_for_chaining(self):
        """Helper must return the same client instance."""
        client = x402Client()
        signer = _make_client_signer()

        result = register_exact_evm_client(client, signer)

        assert result is client

    def test_should_register_v2_wildcard_by_default(self):
        """Default registration adds eip155:* V2 scheme."""
        client = x402Client()
        signer = _make_client_signer()

        register_exact_evm_client(client, signer)

        registered = client.get_registered_schemes()
        v2_entries = registered[2]
        assert any(
            entry["network"] == "eip155:*" and entry["scheme"] == "exact" for entry in v2_entries
        )

    def test_should_register_all_v1_networks_by_default(self):
        """All V1_NETWORKS entries are registered as V1 schemes."""
        client = x402Client()
        signer = _make_client_signer()

        register_exact_evm_client(client, signer)

        registered = client.get_registered_schemes()
        v1_networks = {entry["network"] for entry in registered[1]}
        for network in V1_NETWORKS:
            assert network in v1_networks
        for entry in registered[1]:
            assert entry["scheme"] == "exact"

    def test_should_register_specific_network_when_str(self):
        """Passing a single network string registers only that V2 entry."""
        client = x402Client()
        signer = _make_client_signer()

        register_exact_evm_client(client, signer, networks="eip155:8453")

        v2_entries = client.get_registered_schemes()[2]
        assert len(v2_entries) == 1
        assert v2_entries[0]["network"] == "eip155:8453"
        assert v2_entries[0]["scheme"] == "exact"

    def test_should_register_each_network_in_list(self):
        """Passing a list registers a V2 entry per network."""
        client = x402Client()
        signer = _make_client_signer()
        networks = ["eip155:8453", "eip155:1", "eip155:137"]

        register_exact_evm_client(client, signer, networks=networks)

        v2_networks = {entry["network"] for entry in client.get_registered_schemes()[2]}
        assert v2_networks == set(networks)

    def test_should_not_register_wildcard_when_networks_provided(self):
        """Explicit networks suppress the wildcard fallback."""
        client = x402Client()
        signer = _make_client_signer()

        register_exact_evm_client(client, signer, networks=["eip155:1"])

        v2_networks = {entry["network"] for entry in client.get_registered_schemes()[2]}
        assert "eip155:*" not in v2_networks

    def test_should_register_v1_networks_even_when_v2_networks_provided(self):
        """V1 registration is independent of the V2 networks argument."""
        client = x402Client()
        signer = _make_client_signer()

        register_exact_evm_client(client, signer, networks=["eip155:8453"])

        v1_networks = {entry["network"] for entry in client.get_registered_schemes()[1]}
        for network in V1_NETWORKS:
            assert network in v1_networks

    def test_should_register_provided_policies(self):
        """Provided policies are appended to the client policy list."""
        client = x402Client()
        signer = _make_client_signer()
        policy_a = MagicMock(name="policy_a")
        policy_b = MagicMock(name="policy_b")

        register_exact_evm_client(client, signer, policies=[policy_a, policy_b])

        assert policy_a in client._policies
        assert policy_b in client._policies

    def test_should_not_add_policies_when_none(self):
        """Omitting policies leaves the policy list untouched."""
        client = x402Client()
        signer = _make_client_signer()
        before = list(client._policies)

        register_exact_evm_client(client, signer)

        assert client._policies == before

    def test_should_attach_evm_client_scheme_instance(self):
        """Registered V2 scheme is an ExactEvmClientScheme bound to the signer."""
        client = x402Client()
        signer = _make_client_signer()

        register_exact_evm_client(client, signer, networks="eip155:8453")

        scheme = client._schemes["eip155:8453"]["exact"]
        assert isinstance(scheme, ExactEvmClientScheme)
        assert scheme._signer is signer

    def test_should_attach_evm_v1_client_scheme_instance(self):
        """Registered V1 scheme is an ExactEvmClientSchemeV1 bound to the signer."""
        client = x402Client()
        signer = _make_client_signer()

        register_exact_evm_client(client, signer)

        v1_scheme = client._schemes_v1["base"]["exact"]
        assert isinstance(v1_scheme, ExactEvmClientSchemeV1)
        assert v1_scheme._signer is signer

    def test_should_wrap_local_account_signer(self):
        """A bare LocalAccount should be auto-wrapped in EthAccountSigner."""
        client = x402Client()
        local_account = Account.create()

        register_exact_evm_client(client, local_account, networks="eip155:8453")

        scheme = client._schemes["eip155:8453"]["exact"]
        assert isinstance(scheme._signer, EthAccountSigner)

    def test_should_work_with_sync_client(self):
        """Helper accepts x402ClientSync as well as x402Client."""
        client = x402ClientSync()
        signer = _make_client_signer()

        result = register_exact_evm_client(client, signer)

        assert result is client
        v2_networks = {entry["network"] for entry in client.get_registered_schemes()[2]}
        assert "eip155:*" in v2_networks


# =============================================================================
# register_exact_evm_server
# =============================================================================


class TestRegisterExactEvmServer:
    """Tests for register_exact_evm_server."""

    def test_should_return_server_for_chaining(self):
        """Helper must return the same server instance."""
        server = x402ResourceServer(MagicMock())

        result = register_exact_evm_server(server)

        assert result is server

    def test_should_register_v2_wildcard_by_default(self):
        """Default registration uses the eip155:* wildcard."""
        server = x402ResourceServer(MagicMock())

        register_exact_evm_server(server)

        assert "eip155:*" in server._schemes
        assert "exact" in server._schemes["eip155:*"]

    def test_should_register_specific_network_when_str(self):
        """Passing a single network string registers exactly that network."""
        server = x402ResourceServer(MagicMock())

        register_exact_evm_server(server, networks="eip155:8453")

        assert "eip155:8453" in server._schemes
        assert "eip155:*" not in server._schemes

    def test_should_register_each_network_in_list(self):
        """Passing a list registers each network."""
        server = x402ResourceServer(MagicMock())
        networks = ["eip155:8453", "eip155:1", "eip155:137"]

        register_exact_evm_server(server, networks=networks)

        for network in networks:
            assert network in server._schemes
            assert "exact" in server._schemes[network]

    def test_should_attach_evm_server_scheme_instance(self):
        """Registered scheme should be an ExactEvmServerScheme."""
        server = x402ResourceServer(MagicMock())

        register_exact_evm_server(server, networks="eip155:8453")

        scheme = server._schemes["eip155:8453"]["exact"]
        assert isinstance(scheme, ExactEvmServerScheme)

    def test_should_not_register_v1_schemes(self):
        """Server registration is V2 only — no V1 entries should be added."""
        server = x402ResourceServer(MagicMock())

        register_exact_evm_server(server)

        assert not any(network in V1_NETWORKS for network in server._schemes.keys())

    def test_should_work_with_sync_server(self):
        """Helper accepts x402ResourceServerSync as well as x402ResourceServer."""
        server = x402ResourceServerSync(MagicMock())

        result = register_exact_evm_server(server)

        assert result is server
        assert "eip155:*" in server._schemes


# =============================================================================
# register_exact_evm_facilitator
# =============================================================================


class TestRegisterExactEvmFacilitator:
    """Tests for register_exact_evm_facilitator."""

    def test_should_return_facilitator_for_chaining(self):
        """Helper must return the same facilitator instance."""
        facilitator = x402Facilitator()
        signer = _make_facilitator_signer()

        result = register_exact_evm_facilitator(facilitator, signer, networks="eip155:8453")

        assert result is facilitator

    def test_should_register_specific_network_when_str(self):
        """A network string should register that single network."""
        facilitator = x402Facilitator()
        signer = _make_facilitator_signer()

        register_exact_evm_facilitator(facilitator, signer, networks="eip155:8453")

        v2_networks = set()
        for scheme_data in facilitator._schemes:
            v2_networks |= scheme_data.networks
        assert v2_networks == {"eip155:8453"}

    def test_should_register_each_network_in_list(self):
        """A list of networks should register all of them under one V2 entry."""
        facilitator = x402Facilitator()
        signer = _make_facilitator_signer()
        networks = ["eip155:8453", "eip155:1", "eip155:137"]

        register_exact_evm_facilitator(facilitator, signer, networks=networks)

        v2_networks = set()
        for scheme_data in facilitator._schemes:
            v2_networks |= scheme_data.networks
        assert v2_networks == set(networks)

    def test_should_register_v1_for_all_v1_networks(self):
        """V1 registration always covers every V1_NETWORKS entry."""
        facilitator = x402Facilitator()
        signer = _make_facilitator_signer()

        register_exact_evm_facilitator(facilitator, signer, networks="eip155:8453")

        v1_networks = set()
        for scheme_data in facilitator._schemes_v1:
            v1_networks |= scheme_data.networks
        assert v1_networks == set(V1_NETWORKS)

    def test_should_attach_evm_facilitator_scheme_instance(self):
        """Registered V2 facilitator should be ExactEvmFacilitatorScheme bound to signer."""
        facilitator = x402Facilitator()
        signer = _make_facilitator_signer()

        register_exact_evm_facilitator(facilitator, signer, networks="eip155:8453")

        assert len(facilitator._schemes) == 1
        scheme = facilitator._schemes[0].facilitator
        assert isinstance(scheme, ExactEvmFacilitatorScheme)
        assert scheme._signer is signer

    def test_should_attach_evm_v1_facilitator_scheme_instance(self):
        """Registered V1 facilitator should be ExactEvmFacilitatorSchemeV1 bound to signer."""
        facilitator = x402Facilitator()
        signer = _make_facilitator_signer()

        register_exact_evm_facilitator(facilitator, signer, networks="eip155:8453")

        assert len(facilitator._schemes_v1) == 1
        v1_scheme = facilitator._schemes_v1[0].facilitator
        assert isinstance(v1_scheme, ExactEvmFacilitatorSchemeV1)
        assert v1_scheme._signer is signer

    def test_should_default_config_flags_to_false(self):
        """Default config: deploy_erc4337_with_eip6492 and simulate_in_settle are False."""
        facilitator = x402Facilitator()
        signer = _make_facilitator_signer()

        register_exact_evm_facilitator(facilitator, signer, networks="eip155:8453")

        v2_config = facilitator._schemes[0].facilitator._config
        v1_config = facilitator._schemes_v1[0].facilitator._config
        assert isinstance(v2_config, ExactEvmSchemeConfig)
        assert v2_config.deploy_erc4337_with_eip6492 is False
        assert v2_config.simulate_in_settle is False
        assert isinstance(v1_config, ExactEvmSchemeV1Config)
        assert v1_config.deploy_erc4337_with_eip6492 is False
        assert v1_config.simulate_in_settle is False

    def test_should_propagate_config_flags_to_v2_and_v1(self):
        """Config flags must be applied identically to V2 and V1 scheme configs."""
        facilitator = x402Facilitator()
        signer = _make_facilitator_signer()

        register_exact_evm_facilitator(
            facilitator,
            signer,
            networks="eip155:8453",
            deploy_erc4337_with_eip6492=True,
            simulate_in_settle=True,
        )

        v2_config = facilitator._schemes[0].facilitator._config
        v1_config = facilitator._schemes_v1[0].facilitator._config
        assert v2_config.deploy_erc4337_with_eip6492 is True
        assert v2_config.simulate_in_settle is True
        assert v1_config.deploy_erc4337_with_eip6492 is True
        assert v1_config.simulate_in_settle is True

    def test_should_propagate_only_specified_flag(self):
        """Setting one config flag should leave the other at default."""
        facilitator = x402Facilitator()
        signer = _make_facilitator_signer()

        register_exact_evm_facilitator(
            facilitator,
            signer,
            networks="eip155:8453",
            deploy_erc4337_with_eip6492=True,
        )

        v2_config = facilitator._schemes[0].facilitator._config
        v1_config = facilitator._schemes_v1[0].facilitator._config
        assert v2_config.deploy_erc4337_with_eip6492 is True
        assert v2_config.simulate_in_settle is False
        assert v1_config.deploy_erc4337_with_eip6492 is True
        assert v1_config.simulate_in_settle is False

    def test_should_work_with_sync_facilitator(self):
        """Helper accepts x402FacilitatorSync as well as x402Facilitator."""
        facilitator = x402FacilitatorSync()
        signer = _make_facilitator_signer()

        result = register_exact_evm_facilitator(facilitator, signer, networks="eip155:8453")

        assert result is facilitator
        v2_networks = set()
        for scheme_data in facilitator._schemes:
            v2_networks |= scheme_data.networks
        assert v2_networks == {"eip155:8453"}
