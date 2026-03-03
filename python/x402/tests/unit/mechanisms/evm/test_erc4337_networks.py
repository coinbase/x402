"""Tests for ERC-4337 network registry."""

import re

import pytest

from x402.mechanisms.evm.erc4337_networks import (
    ERC4337_SUPPORTED_CHAINS,
    get_erc4337_chain,
    get_mainnets,
    get_supported_chains,
    get_testnets,
    is_erc4337_supported,
    resolve_erc4337_chain_id,
)


class TestGetERC4337Chain:
    def test_base(self):
        chain = get_erc4337_chain(8453)
        assert chain is not None
        assert chain.name == "Base"
        assert chain.chain_id == 8453
        assert chain.testnet is False

    def test_base_sepolia(self):
        chain = get_erc4337_chain(84532)
        assert chain is not None
        assert chain.name == "Base Sepolia"
        assert chain.testnet is True

    def test_optimism(self):
        chain = get_erc4337_chain(10)
        assert chain is not None
        assert chain.name == "Optimism"

    def test_optimism_sepolia(self):
        chain = get_erc4337_chain(11155420)
        assert chain is not None
        assert chain.name == "Optimism Sepolia"
        assert chain.chain_id == 11155420
        assert chain.testnet is True
        assert chain.caip2 == "eip155:11155420"
        assert chain.v1_name == "optimism-sepolia"
        assert chain.usdc_address == "0x5fd84259d66Cd46123540766Be93DFE6D43130D7"
        assert chain.safe_transaction_service_url is None

    def test_arbitrum(self):
        chain = get_erc4337_chain(42161)
        assert chain is not None
        assert chain.name == "Arbitrum One"

    def test_arbitrum_sepolia(self):
        chain = get_erc4337_chain(421614)
        assert chain is not None
        assert chain.name == "Arbitrum Sepolia"
        assert chain.chain_id == 421614
        assert chain.testnet is True
        assert chain.caip2 == "eip155:421614"
        assert chain.v1_name == "arbitrum-sepolia"
        assert chain.usdc_address == "0x75faf114eafb1BDbe2F0316DF893fd58CE46AA4d"
        assert chain.safe_transaction_service_url is None

    def test_unknown(self):
        assert get_erc4337_chain(999999) is None


class TestIsERC4337Supported:
    def test_supported(self):
        assert is_erc4337_supported(8453) is True
        assert is_erc4337_supported(84532) is True

    def test_unsupported(self):
        assert is_erc4337_supported(999999) is False


class TestResolveERC4337ChainId:
    def test_caip2_base(self):
        assert resolve_erc4337_chain_id("eip155:8453") == 8453

    def test_caip2_base_sepolia(self):
        assert resolve_erc4337_chain_id("eip155:84532") == 84532

    def test_caip2_optimism(self):
        assert resolve_erc4337_chain_id("eip155:10") == 10

    def test_caip2_arbitrum(self):
        assert resolve_erc4337_chain_id("eip155:42161") == 42161

    def test_v1_name_base(self):
        assert resolve_erc4337_chain_id("base") == 8453

    def test_v1_name_base_sepolia(self):
        assert resolve_erc4337_chain_id("base-sepolia") == 84532

    def test_v1_name_optimism(self):
        assert resolve_erc4337_chain_id("optimism") == 10

    def test_v1_name_arbitrum(self):
        assert resolve_erc4337_chain_id("arbitrum") == 42161

    def test_v1_name_arbitrum_sepolia(self):
        assert resolve_erc4337_chain_id("arbitrum-sepolia") == 421614

    def test_v1_name_optimism_sepolia(self):
        assert resolve_erc4337_chain_id("optimism-sepolia") == 11155420

    def test_numeric_string(self):
        assert resolve_erc4337_chain_id("8453") == 8453

    def test_arbitrary_numeric_string_not_in_registry(self):
        """Numeric string resolves to int even if not in registry."""
        result = resolve_erc4337_chain_id("12345678")
        assert result == 12345678

    def test_unknown_name(self):
        with pytest.raises(ValueError):
            resolve_erc4337_chain_id("unknown-chain")

    def test_invalid_caip2(self):
        with pytest.raises(ValueError):
            resolve_erc4337_chain_id("eip155:abc")


class TestChainInfoFields:
    def test_base_fields(self):
        chain = get_erc4337_chain(8453)
        assert chain.caip2 == "eip155:8453"
        assert chain.usdc_address == "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913"
        assert chain.v1_name == "base"

    def test_all_6_chains(self):
        assert len(ERC4337_SUPPORTED_CHAINS) == 6

    def test_all_usdc_addresses_valid_hex(self):
        """All USDC addresses across all chains should be valid Ethereum addresses."""
        hex_pattern = re.compile(r"^0x[0-9a-fA-F]{40}$")
        for chain_id, chain in ERC4337_SUPPORTED_CHAINS.items():
            assert hex_pattern.match(chain.usdc_address), (
                f"Chain {chain.name} (ID={chain_id}) has invalid USDC address: "
                f"{chain.usdc_address}"
            )

    def test_base_sepolia_usdc(self):
        chain = get_erc4337_chain(84532)
        assert chain.usdc_address == "0x036CbD53842c5426634e7929541eC2318f3dCF7e"

    def test_optimism_usdc(self):
        chain = get_erc4337_chain(10)
        assert chain.usdc_address == "0x0b2C639c533813f4Aa9D7837CAf62653d097Ff85"

    def test_optimism_sepolia_usdc(self):
        chain = get_erc4337_chain(11155420)
        assert chain.usdc_address == "0x5fd84259d66Cd46123540766Be93DFE6D43130D7"

    def test_arbitrum_usdc(self):
        chain = get_erc4337_chain(42161)
        assert chain.usdc_address == "0xaf88d065e77c8cC2239327C5EDb3A432268e5831"

    def test_arbitrum_sepolia_usdc(self):
        chain = get_erc4337_chain(421614)
        assert chain.usdc_address == "0x75faf114eafb1BDbe2F0316DF893fd58CE46AA4d"

    def test_all_chains_have_rpc_url(self):
        """All chains should have a non-empty RPC URL."""
        for chain_id, chain in ERC4337_SUPPORTED_CHAINS.items():
            assert chain.rpc_url, f"Chain {chain.name} (ID={chain_id}) has empty rpc_url"

    def test_all_chains_have_block_explorer(self):
        """All chains should have a non-empty block explorer URL."""
        for chain_id, chain in ERC4337_SUPPORTED_CHAINS.items():
            assert chain.block_explorer_url, (
                f"Chain {chain.name} (ID={chain_id}) has empty block_explorer_url"
            )

    def test_all_chains_have_caip2(self):
        """All chains should have a correctly formatted CAIP-2 identifier."""
        for chain_id, chain in ERC4337_SUPPORTED_CHAINS.items():
            assert chain.caip2 == f"eip155:{chain_id}", (
                f"Chain {chain.name} has incorrect caip2: {chain.caip2}"
            )


class TestChainLists:
    def test_mainnets(self):
        mainnets = get_mainnets()
        assert len(mainnets) == 3
        assert all(not c.testnet for c in mainnets)

    def test_testnets(self):
        testnets = get_testnets()
        assert len(testnets) == 3
        assert all(c.testnet for c in testnets)

    def test_all_chains(self):
        all_chains = get_supported_chains()
        assert len(all_chains) == 6

    def test_mainnet_names(self):
        mainnets = get_mainnets()
        names = {c.name for c in mainnets}
        assert "Base" in names
        assert "Optimism" in names
        assert "Arbitrum One" in names

    def test_testnet_names(self):
        testnets = get_testnets()
        names = {c.name for c in testnets}
        assert "Base Sepolia" in names
        assert "Optimism Sepolia" in names
        assert "Arbitrum Sepolia" in names
