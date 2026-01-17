"""Test Polygon Amoy network support"""

import pytest
from x402.networks import SupportedNetworks, EVM_NETWORK_TO_CHAIN_ID
from x402.chains import NETWORK_TO_ID, KNOWN_TOKENS, get_chain_id, get_default_token_address


def test_polygon_amoy_supported_network():
    """Test that polygon-amoy is in SupportedNetworks"""
    assert "polygon-amoy" in SupportedNetworks.__args__


def test_polygon_amoy_chain_id_mapping():
    """Test that polygon-amoy maps to correct chain ID"""
    assert EVM_NETWORK_TO_CHAIN_ID["polygon-amoy"] == 80002
    assert NETWORK_TO_ID["polygon-amoy"] == "80002"


def test_polygon_amoy_known_tokens():
    """Test that USDC token is configured for Polygon Amoy"""
    assert "80002" in KNOWN_TOKENS
    usdc_tokens = KNOWN_TOKENS["80002"]
    assert len(usdc_tokens) == 1
    
    usdc_token = usdc_tokens[0]
    assert usdc_token["human_name"] == "usdc"
    assert usdc_token["address"] == "0x41E94Eb019C0762f9Bfcf9Fb1E58725BfB0e7582"
    assert usdc_token["name"] == "USDC"
    assert usdc_token["decimals"] == 6
    assert usdc_token["version"] == "2"


def test_get_chain_id_polygon_amoy():
    """Test get_chain_id function works with polygon-amoy"""
    chain_id = get_chain_id("polygon-amoy")
    assert chain_id == "80002"


def test_get_default_token_address_polygon_amoy():
    """Test get_default_token_address works for Polygon Amoy"""
    usdc_address = get_default_token_address("80002", "usdc")
    assert usdc_address == "0x41E94Eb019C0762f9Bfcf9Fb1E58725BfB0e7582"


def test_get_chain_id_direct_chain_id():
    """Test that direct chain ID still works"""
    chain_id = get_chain_id("80002")
    assert chain_id == "80002"
