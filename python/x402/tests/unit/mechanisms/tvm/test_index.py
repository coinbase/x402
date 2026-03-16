"""Tests for TVM mechanism exports."""

from x402.mechanisms.tvm import (
    SCHEME_EXACT,
    TVM_MAINNET,
    TVM_TESTNET,
    SUPPORTED_NETWORKS,
    USDT_MASTER,
    DEFAULT_DECIMALS,
    INTERNAL_SIGNED_OP,
    EXTERNAL_SIGNED_OP,
    SEND_MSG_OP,
    ERR_INVALID_SIGNATURE,
    ERR_UNSUPPORTED_SCHEME,
    ERR_UNSUPPORTED_NETWORK,
    ERR_PAYMENT_EXPIRED,
    ERR_REPLAY_DETECTED,
    ERR_INSUFFICIENT_AMOUNT,
    ERR_RECIPIENT_MISMATCH,
    ERR_SETTLEMENT_FAILED,
    ClientTvmSigner,
    FacilitatorTvmSigner,
    TonapiProvider,
    TvmPaymentPayload,
    W5ParsedMessage,
    JettonTransferInfo,
    VerifyResult,
    PaymentState,
    normalize_address,
    friendly_to_raw,
    raw_to_friendly,
    is_valid_address,
    is_valid_network,
)
from x402.mechanisms.tvm.exact import (
    ExactTvmClientScheme,
    ExactTvmServerScheme,
    ExactTvmFacilitatorScheme,
    ExactTvmSchemeConfig,
    register_exact_tvm_client,
    register_exact_tvm_server,
    register_exact_tvm_facilitator,
)


class TestExports:
    """Test that main classes and constants are exported."""

    def test_should_export_main_classes(self):
        assert ExactTvmClientScheme is not None
        assert ExactTvmServerScheme is not None
        assert ExactTvmFacilitatorScheme is not None

    def test_should_export_signer_protocols(self):
        assert ClientTvmSigner is not None
        assert FacilitatorTvmSigner is not None

    def test_should_export_signer_implementations(self):
        assert TonapiProvider is not None

    def test_should_export_payload_types(self):
        assert TvmPaymentPayload is not None
        assert W5ParsedMessage is not None
        assert JettonTransferInfo is not None

    def test_should_export_registration_helpers(self):
        assert register_exact_tvm_client is not None
        assert register_exact_tvm_server is not None
        assert register_exact_tvm_facilitator is not None


class TestConstants:
    """Test that constants are exported with correct values."""

    def test_should_export_scheme_exact(self):
        assert SCHEME_EXACT == "exact"

    def test_should_export_network_identifiers(self):
        assert TVM_MAINNET == "tvm:-239"
        assert TVM_TESTNET == "tvm:-3"

    def test_should_export_supported_networks(self):
        assert TVM_MAINNET in SUPPORTED_NETWORKS
        assert TVM_TESTNET in SUPPORTED_NETWORKS

    def test_should_export_default_decimals(self):
        assert DEFAULT_DECIMALS == 6

    def test_should_export_w5_opcodes(self):
        assert INTERNAL_SIGNED_OP == 0x73696E74
        assert EXTERNAL_SIGNED_OP == 0x7369676E
        assert SEND_MSG_OP == 0x0EC3C86D

    def test_should_export_error_codes(self):
        assert ERR_INVALID_SIGNATURE is not None
        assert ERR_UNSUPPORTED_SCHEME is not None
        assert ERR_UNSUPPORTED_NETWORK is not None
        assert ERR_PAYMENT_EXPIRED is not None
        assert ERR_REPLAY_DETECTED is not None
        assert ERR_INSUFFICIENT_AMOUNT is not None
        assert ERR_RECIPIENT_MISMATCH is not None
        assert ERR_SETTLEMENT_FAILED is not None


class TestAddressUtilities:
    """Test address utility exports."""

    def test_normalize_raw_address(self):
        addr = "0:b113a994b5024a16719f69139328eb759596c38a25f59028b146fecdc3621dfe"
        result = normalize_address(addr)
        assert result == addr

    def test_normalize_preserves_workchain(self):
        addr = "-1:" + "a" * 64
        result = normalize_address(addr)
        assert result.startswith("-1:")

    def test_is_valid_address_accepts_raw(self):
        assert is_valid_address("0:" + "a" * 64) is True

    def test_is_valid_address_rejects_invalid(self):
        assert is_valid_address("invalid") is False
        assert is_valid_address("") is False

    def test_is_valid_network_accepts_tvm(self):
        assert is_valid_network("tvm:-239") is True
        assert is_valid_network("tvm:-3") is True

    def test_is_valid_network_rejects_non_tvm(self):
        assert is_valid_network("eip155:8453") is False
        assert is_valid_network("unknown") is False


class TestPaymentState:
    """Test PaymentState enum."""

    def test_has_expected_states(self):
        assert PaymentState.SEEN == "seen"
        assert PaymentState.VERIFIED == "verified"
        assert PaymentState.SETTLING == "settling"
        assert PaymentState.SUBMITTED == "submitted"
        assert PaymentState.CONFIRMED == "confirmed"
        assert PaymentState.FAILED == "failed"
        assert PaymentState.EXPIRED == "expired"


class TestVerifyResult:
    """Test VerifyResult type."""

    def test_ok_result(self):
        result = VerifyResult(ok=True)
        assert result.ok is True
        assert result.reason == ""

    def test_failed_result(self):
        result = VerifyResult(ok=False, reason="test error")
        assert result.ok is False
        assert result.reason == "test error"
