"""Tests for ERC-4337 network registry."""

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

    def test_arbitrum(self):
        chain = get_erc4337_chain(42161)
        assert chain is not None
        assert chain.name == "Arbitrum One"

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

    def test_numeric_string(self):
        assert resolve_erc4337_chain_id("8453") == 8453

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
