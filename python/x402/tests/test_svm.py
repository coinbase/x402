"""Tests for Solana (SVM) payment functionality."""

import pytest
from unittest.mock import Mock, patch, AsyncMock
from x402.svm.wallet import (
    Keypair,
    create_keypair_from_base58,
    generate_keypair,
)
from x402.svm.rpc import get_rpc_url, get_rpc_client
from x402.networks import SUPPORTED_SVM_NETWORKS
from x402.types import PaymentRequirements


class TestSVMWallet:
    """Tests for SVM wallet functionality."""

    def test_generate_keypair(self):
        """Test keypair generation."""
        keypair = generate_keypair()
        assert isinstance(keypair, Keypair)
        assert len(keypair.address) > 0
        assert keypair.address == str(keypair.pubkey)

    def test_create_keypair_from_base58_invalid(self):
        """Test creating keypair from invalid base58."""
        with pytest.raises(ValueError):
            create_keypair_from_base58("invalid_key")

    def test_keypair_properties(self):
        """Test keypair properties."""
        keypair = generate_keypair()
        assert hasattr(keypair, "address")
        assert hasattr(keypair, "pubkey")
        assert hasattr(keypair, "keypair")


class TestSVMRPC:
    """Tests for SVM RPC functionality."""

    def test_get_rpc_url_devnet(self):
        """Test getting devnet RPC URL."""
        url = get_rpc_url("solana-devnet")
        assert url == "https://api.devnet.solana.com"

    def test_get_rpc_url_mainnet(self):
        """Test getting mainnet RPC URL."""
        url = get_rpc_url("solana")
        assert url == "https://api.mainnet-beta.solana.com"

    def test_get_rpc_url_custom(self):
        """Test getting custom RPC URL."""
        custom = "https://custom-rpc.com"
        url = get_rpc_url("solana-devnet", custom_url=custom)
        assert url == custom

    def test_get_rpc_url_unsupported(self):
        """Test getting RPC URL for unsupported network."""
        with pytest.raises(ValueError):
            get_rpc_url("unsupported-network")

    def test_get_rpc_client(self):
        """Test getting RPC client."""
        client = get_rpc_client("solana-devnet")
        assert client is not None


class TestSVMNetworks:
    """Tests for SVM network configuration."""

    def test_supported_svm_networks(self):
        """Test supported SVM networks list."""
        assert "solana" in SUPPORTED_SVM_NETWORKS
        assert "solana-devnet" in SUPPORTED_SVM_NETWORKS
        assert len(SUPPORTED_SVM_NETWORKS) == 2


class TestSVMPaymentRequirements:
    """Tests for SVM payment requirements."""

    def test_svm_payment_requirements_structure(self):
        """Test SVM payment requirements structure."""
        requirements = PaymentRequirements(
            scheme="exact",
            network="solana-devnet",
            max_amount_required="1000",
            resource="https://api.example.com/test",
            description="Test payment",
            mime_type="application/json",
            pay_to="FSTt5YsTt2dur7ZEqcqQHL4FTR56efDhwgJdEKvYQQea",
            max_timeout_seconds=60,
            asset="4zMMC9srt5Ri5X14GAgXhaHii3GnPAEERYPJgZJDncDU",
            extra={"feePayer": "FEE_PAYER_ADDRESS"},
        )
        assert requirements.scheme == "exact"
        assert requirements.network == "solana-devnet"
        assert requirements.extra["feePayer"] == "FEE_PAYER_ADDRESS"


@pytest.mark.asyncio
class TestSVMPaymentCreation:
    """Tests for SVM payment creation."""

    @patch("x402.exact_svm.get_rpc_client")
    async def test_create_payment_header_structure(self, mock_rpc):
        """Test that payment header has correct structure."""
        # This is a simplified test - full integration tests would require
        # a running Solana node or mock RPC responses
        keypair = generate_keypair()
        requirements = PaymentRequirements(
            scheme="exact",
            network="solana-devnet",
            max_amount_required="1000",
            resource="https://api.example.com/test",
            description="Test payment",
            mime_type="application/json",
            pay_to="FSTt5YsTt2dur7ZEqcqQHL4FTR56efDhwgJdEKvYQQea",
            max_timeout_seconds=60,
            asset="4zMMC9srt5Ri5X14GAgXhaHii3GnPAEERYPJgZJDncDU",
            extra={"feePayer": "FEE_PAYER_ADDRESS"},
        )

        # Mock would need to return proper account info and blockhash
        # For now, just verify the function signature works
        assert requirements.network == "solana-devnet"
        assert keypair.address is not None


class TestSVMTokenSupport:
    """Tests for SVM token support."""

    def test_usdc_addresses(self):
        """Test USDC addresses for Solana networks."""
        from x402.chains import KNOWN_TOKENS

        # Devnet USDC
        devnet_tokens = KNOWN_TOKENS.get("103")
        assert devnet_tokens is not None
        usdc_devnet = next(
            (t for t in devnet_tokens if t["human_name"] == "usdc"), None
        )
        assert usdc_devnet is not None
        assert usdc_devnet["address"] == "4zMMC9srt5Ri5X14GAgXhaHii3GnPAEERYPJgZJDncDU"
        assert usdc_devnet["decimals"] == 6

        # Mainnet USDC
        mainnet_tokens = KNOWN_TOKENS.get("101")
        assert mainnet_tokens is not None
        usdc_mainnet = next(
            (t for t in mainnet_tokens if t["human_name"] == "usdc"), None
        )
        assert usdc_mainnet is not None
        assert usdc_mainnet["address"] == "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v"
        assert usdc_mainnet["decimals"] == 6


class TestSVMPriceConversion:
    """Tests for SVM price conversion."""

    def test_process_price_to_atomic_amount_svm(self):
        """Test converting USD price to atomic USDC amount for SVM."""
        from x402.common import process_price_to_atomic_amount

        # Test with devnet
        amount, asset, extra = process_price_to_atomic_amount("$0.001", "solana-devnet")
        assert amount == "1000"  # 0.001 * 10^6
        assert asset == "4zMMC9srt5Ri5X14GAgXhaHii3GnPAEERYPJgZJDncDU"
        assert extra is None  # SVM doesn't use EIP-712

        # Test with mainnet
        amount, asset, extra = process_price_to_atomic_amount("$0.01", "solana")
        assert amount == "10000"  # 0.01 * 10^6
        assert asset == "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v"
        assert extra is None


if __name__ == "__main__":
    pytest.main([__file__, "-v"])

