"""Tests for hypercore package imports."""

from x402.mechanisms.hypercore import (
    ERR_DESTINATION_MISMATCH,
    ERR_INSUFFICIENT_AMOUNT,
    ERR_INVALID_ACTION_TYPE,
    ERR_INVALID_NETWORK,
    ERR_INVALID_SIGNATURE,
    ERR_NONCE_TOO_OLD,
    ERR_SETTLEMENT_FAILED,
    ERR_TOKEN_MISMATCH,
    HYPERLIQUID_API_MAINNET,
    HYPERLIQUID_API_TESTNET,
    MAX_NONCE_AGE_SECONDS,
    NETWORK_CONFIGS,
    NETWORK_MAINNET,
    NETWORK_TESTNET,
    SCHEME_EXACT,
    AssetInfo,
    NetworkConfig,
)
from x402.mechanisms.hypercore.exact import (
    ExactHypercoreClientScheme,
    ExactHypercoreFacilitatorScheme,
    ExactHypercoreScheme,
    ExactHypercoreServerScheme,
    register_exact_hypercore_client,
    register_exact_hypercore_facilitator,
    register_exact_hypercore_server,
)


class TestPackageImports:
    """Test that all expected exports are available."""

    def test_should_import_constants(self):
        """Should import all constants from package."""

        assert SCHEME_EXACT == "exact"
        assert NETWORK_MAINNET == "hypercore:mainnet"
        assert NETWORK_TESTNET == "hypercore:testnet"
        assert MAX_NONCE_AGE_SECONDS == 3600
        assert HYPERLIQUID_API_MAINNET == "https://api.hyperliquid.xyz"
        assert HYPERLIQUID_API_TESTNET == "https://api.hyperliquid-testnet.xyz"

    def test_should_import_network_configs(self):
        """Should import network configs and types."""

        assert AssetInfo is not None
        assert NetworkConfig is not None
        assert NETWORK_CONFIGS is not None
        assert NETWORK_MAINNET in NETWORK_CONFIGS
        assert NETWORK_TESTNET in NETWORK_CONFIGS

        # Test mainnet config
        mainnet_config = NETWORK_CONFIGS[NETWORK_MAINNET]
        assert mainnet_config["default_asset"]["token"] == "USDH:0x54e00a5988577cb0b0c9ab0cb6ef7f4b"
        assert mainnet_config["default_asset"]["name"] == "USDH"
        assert mainnet_config["default_asset"]["decimals"] == 8

        # Test testnet config
        testnet_config = NETWORK_CONFIGS[NETWORK_TESTNET]
        assert testnet_config["default_asset"]["token"] == "USDH:0x471fd4480bb9943a1fe080ab0d4ff36c"
        assert testnet_config["default_asset"]["decimals"] == 8

    def test_should_import_error_constants(self):
        """Should import all error constants."""
        assert ERR_INVALID_NETWORK == "invalid_network"
        assert ERR_INVALID_ACTION_TYPE == "invalid_action_type"
        assert ERR_DESTINATION_MISMATCH == "destination_mismatch"
        assert ERR_INSUFFICIENT_AMOUNT == "insufficient_amount"
        assert ERR_TOKEN_MISMATCH == "token_mismatch"
        assert ERR_NONCE_TOO_OLD == "nonce_too_old"
        assert ERR_INVALID_SIGNATURE == "invalid_signature_structure"
        assert ERR_SETTLEMENT_FAILED == "settlement_failed"


class TestExactPackageImports:
    """Test exact subpackage imports."""

    def test_should_import_schemes(self):
        """Should import all scheme classes."""
        assert callable(ExactHypercoreClientScheme)
        assert callable(ExactHypercoreServerScheme)
        assert callable(ExactHypercoreFacilitatorScheme)

        assert ExactHypercoreScheme is ExactHypercoreClientScheme

    def test_should_import_registration_helpers(self):
        """Should import registration helpers."""
        assert callable(register_exact_hypercore_client)
        assert callable(register_exact_hypercore_server)
        assert callable(register_exact_hypercore_facilitator)

    def test_should_create_client_scheme(self):
        """Should create client scheme instance."""

        class MockSigner:
            async def sign_send_asset(self, action):
                return {"r": "0x00", "s": "0x00", "v": 27}

        signer = MockSigner()
        scheme = ExactHypercoreClientScheme(signer)

        assert scheme.scheme == "exact"
        assert scheme.signer is signer

    def test_should_create_server_scheme(self):
        """Should create server scheme instance."""

        scheme = ExactHypercoreServerScheme()

        assert scheme.scheme == "exact"

    def test_should_create_facilitator_scheme(self):
        """Should create facilitator scheme instance."""

        scheme = ExactHypercoreFacilitatorScheme("https://api.hyperliquid.xyz")

        assert scheme.scheme == "exact"
        assert scheme.caip_family == "hypercore:*"
        assert scheme.api_url == "https://api.hyperliquid.xyz"
