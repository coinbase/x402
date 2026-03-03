"""Tests for ERC-4337 facilitator."""

from unittest.mock import MagicMock, patch

from x402.mechanisms.evm.erc4337_constants import (
    ERR_GAS_ESTIMATION_FAILED,
    ERR_MISSING_BUNDLER_URL,
    ERR_MISSING_ENTRY_POINT,
    ERR_MISSING_USER_OPERATION,
    ERR_SEND_FAILED,
)
from x402.mechanisms.evm.exact.erc4337_bundler import UserOperationReceipt
from x402.mechanisms.evm.exact.erc4337_facilitator import (
    ExactEvmSchemeERC4337,
    ExactEvmSchemeERC4337Config,
)
from x402.schemas import PaymentPayload, PaymentRequirements


def _make_accepted(scheme="exact", network="eip155:84532"):
    """Create a mock accepted field."""
    accepted = MagicMock()
    accepted.scheme = scheme
    accepted.network = network
    return accepted


def _make_payload(bundler_url="https://bundler.example.com"):
    """Create a mock ERC-4337 payment payload."""
    payload_dict = {
        "type": "erc4337",
        "entryPoint": "0x0000000071727De22E5E9d8BAf0edAc6f37da032",
        "userOperation": {
            "sender": "0xSender",
            "nonce": "0x01",
            "callData": "0xCallData",
            "callGasLimit": "0x5208",
            "verificationGasLimit": "0x10000",
            "preVerificationGas": "0x5000",
            "maxFeePerGas": "0x3B9ACA00",
            "maxPriorityFeePerGas": "0x59682F00",
            "signature": "0xSig",
        },
    }
    if bundler_url:
        payload_dict["bundlerRpcUrl"] = bundler_url

    mock_payload = MagicMock(spec=PaymentPayload)
    mock_payload.payload = payload_dict
    mock_payload.accepted = _make_accepted()
    return mock_payload


def _make_requirements(extra=None):
    """Create mock payment requirements."""
    req = MagicMock(spec=PaymentRequirements)
    req.scheme = "exact"
    req.network = "eip155:84532"
    req.amount = "1000000"
    req.asset = "0x036CbD53842c5426634e7929541eC2318f3dCF7e"
    req.pay_to = "0xRecipient"
    req.extra = extra
    return req


class TestExactEvmSchemeERC4337:
    def test_scheme(self):
        scheme = ExactEvmSchemeERC4337()
        assert scheme.scheme == "exact"

    def test_caip_family(self):
        scheme = ExactEvmSchemeERC4337()
        assert scheme.caip_family == "eip155:*"

    def test_get_signers_empty(self):
        scheme = ExactEvmSchemeERC4337()
        assert scheme.get_signers("eip155:84532") == []

    def test_get_extra_none(self):
        scheme = ExactEvmSchemeERC4337()
        assert scheme.get_extra("eip155:84532") is None


class TestVerify:
    def test_not_erc4337_payload(self):
        scheme = ExactEvmSchemeERC4337()
        payload = MagicMock()
        payload.payload = {"authorization": {"from": "0x1234"}}
        result = scheme.verify(payload, _make_requirements())
        assert result.is_valid is False
        assert result.invalid_reason == ERR_MISSING_USER_OPERATION

    def test_missing_bundler_url(self):
        scheme = ExactEvmSchemeERC4337()
        payload = _make_payload(bundler_url=None)
        result = scheme.verify(payload, _make_requirements())
        assert result.is_valid is False
        assert result.invalid_reason == ERR_MISSING_BUNDLER_URL

    def test_missing_entry_point(self):
        scheme = ExactEvmSchemeERC4337()
        payload = _make_payload()
        payload.payload["entryPoint"] = ""
        result = scheme.verify(payload, _make_requirements())
        assert result.is_valid is False
        assert result.invalid_reason == ERR_MISSING_ENTRY_POINT

    @patch("x402.mechanisms.evm.exact.erc4337_facilitator.BundlerClient")
    def test_verify_success(self, mock_bundler_cls):
        mock_bundler = MagicMock()
        mock_bundler_cls.return_value = mock_bundler

        scheme = ExactEvmSchemeERC4337()
        payload = _make_payload()
        result = scheme.verify(payload, _make_requirements())
        assert result.is_valid is True
        assert result.payer == "0xSender"

    @patch("x402.mechanisms.evm.exact.erc4337_facilitator.BundlerClient")
    def test_verify_gas_estimation_fail(self, mock_bundler_cls):
        mock_bundler = MagicMock()
        mock_bundler.estimate_user_operation_gas.side_effect = Exception("AA21 error")
        mock_bundler_cls.return_value = mock_bundler

        scheme = ExactEvmSchemeERC4337()
        payload = _make_payload()
        result = scheme.verify(payload, _make_requirements())
        assert result.is_valid is False
        assert result.invalid_reason == ERR_GAS_ESTIMATION_FAILED

    def test_bundler_url_from_config(self):
        scheme = ExactEvmSchemeERC4337(
            ExactEvmSchemeERC4337Config(default_bundler_url="https://config-bundler.com")
        )
        payload = _make_payload(bundler_url=None)

        with patch("x402.mechanisms.evm.exact.erc4337_facilitator.BundlerClient") as mock_cls:
            mock_cls.return_value = MagicMock()
            result = scheme.verify(payload, _make_requirements())
            assert result.is_valid is True
            mock_cls.assert_called_with("https://config-bundler.com")


class TestSettle:
    """Tests for settle() method."""

    @patch("x402.mechanisms.evm.exact.erc4337_facilitator.time")
    @patch("x402.mechanisms.evm.exact.erc4337_facilitator.BundlerClient")
    def test_settle_success_with_receipt(self, mock_bundler_cls, mock_time):
        """settle() success path: send succeeds, receipt has transaction hash."""
        mock_bundler = MagicMock()
        mock_bundler.send_user_operation.return_value = "0xUserOpHash"
        receipt = UserOperationReceipt(
            user_op_hash="0xUserOpHash",
            entry_point="0x0000000071727De22E5E9d8BAf0edAc6f37da032",
            sender="0xSender",
            nonce="0x01",
            actual_gas_cost="0x100",
            actual_gas_used="0x50",
            success=True,
            receipt_transaction_hash="0xTxHash",
        )
        mock_bundler.get_user_operation_receipt.return_value = receipt
        mock_bundler_cls.return_value = mock_bundler

        # Make time.time() return values that allow one poll iteration then exceed deadline
        mock_time.time.side_effect = [0, 0, 1]
        mock_time.sleep = MagicMock()

        scheme = ExactEvmSchemeERC4337()
        payload = _make_payload()
        result = scheme.settle(payload, _make_requirements())

        assert result.success is True
        assert result.transaction == "0xTxHash"
        assert result.payer == "0xSender"
        assert result.network == "eip155:84532"

    @patch("x402.mechanisms.evm.exact.erc4337_facilitator.time")
    @patch("x402.mechanisms.evm.exact.erc4337_facilitator.BundlerClient")
    def test_settle_success_with_top_level_tx_hash(self, mock_bundler_cls, mock_time):
        """settle() uses top-level transactionHash when receipt.receipt_transaction_hash is empty."""
        mock_bundler = MagicMock()
        mock_bundler.send_user_operation.return_value = "0xUserOpHash"
        receipt = UserOperationReceipt(
            user_op_hash="0xUserOpHash",
            entry_point="0x0000000071727De22E5E9d8BAf0edAc6f37da032",
            sender="0xSender",
            nonce="0x01",
            actual_gas_cost="0x100",
            actual_gas_used="0x50",
            success=True,
            transaction_hash="0xTopLevelTxHash",
            receipt_transaction_hash=None,
        )
        mock_bundler.get_user_operation_receipt.return_value = receipt
        mock_bundler_cls.return_value = mock_bundler

        mock_time.time.side_effect = [0, 0, 1]
        mock_time.sleep = MagicMock()

        scheme = ExactEvmSchemeERC4337()
        payload = _make_payload()
        result = scheme.settle(payload, _make_requirements())

        assert result.success is True
        assert result.transaction == "0xTopLevelTxHash"

    @patch("x402.mechanisms.evm.exact.erc4337_facilitator.BundlerClient")
    def test_settle_re_verification_failure(self, mock_bundler_cls):
        """settle() re-verification failure returns error."""
        mock_bundler = MagicMock()
        mock_bundler.estimate_user_operation_gas.side_effect = Exception("gas estimation error")
        mock_bundler_cls.return_value = mock_bundler

        scheme = ExactEvmSchemeERC4337()
        payload = _make_payload()
        result = scheme.settle(payload, _make_requirements())

        assert result.success is False
        assert result.error_reason == ERR_GAS_ESTIMATION_FAILED
        assert result.network == "eip155:84532"

    def test_settle_missing_bundler_url(self):
        """settle() with no bundler URL anywhere returns error."""
        scheme = ExactEvmSchemeERC4337()
        payload = _make_payload(bundler_url=None)
        result = scheme.settle(payload, _make_requirements())

        assert result.success is False
        assert result.error_reason == ERR_MISSING_BUNDLER_URL

    def test_settle_missing_entry_point(self):
        """settle() with empty entry point returns error."""
        scheme = ExactEvmSchemeERC4337()
        payload = _make_payload()
        payload.payload["entryPoint"] = ""
        result = scheme.settle(payload, _make_requirements())

        assert result.success is False
        assert result.error_reason == ERR_MISSING_ENTRY_POINT

    @patch("x402.mechanisms.evm.exact.erc4337_facilitator.BundlerClient")
    def test_settle_send_fails_with_exception(self, mock_bundler_cls):
        """settle() when send_user_operation raises returns ERR_SEND_FAILED."""
        mock_bundler = MagicMock()
        mock_bundler.send_user_operation.side_effect = Exception("bundler down")
        mock_bundler_cls.return_value = mock_bundler

        scheme = ExactEvmSchemeERC4337()
        payload = _make_payload()
        result = scheme.settle(payload, _make_requirements())

        assert result.success is False
        assert result.error_reason == ERR_SEND_FAILED
        assert result.error_message == "bundler down"
        assert result.transaction == ""

    @patch("x402.mechanisms.evm.exact.erc4337_facilitator.time")
    @patch("x402.mechanisms.evm.exact.erc4337_facilitator.BundlerClient")
    def test_settle_receipt_poll_timeout_falls_back_to_user_op_hash(
        self, mock_bundler_cls, mock_time
    ):
        """settle() when receipt poll times out falls back to user_op_hash."""
        mock_bundler = MagicMock()
        mock_bundler.send_user_operation.return_value = "0xUserOpHash"
        # Receipt always returns None (not available yet)
        mock_bundler.get_user_operation_receipt.return_value = None
        mock_bundler_cls.return_value = mock_bundler

        # Simulate: first call sets deadline, then immediately past deadline
        mock_time.time.side_effect = [0, 31]
        mock_time.sleep = MagicMock()

        scheme = ExactEvmSchemeERC4337()
        payload = _make_payload()
        result = scheme.settle(payload, _make_requirements())

        assert result.success is True
        assert result.transaction == "0xUserOpHash"

    @patch("x402.mechanisms.evm.exact.erc4337_facilitator.time")
    @patch("x402.mechanisms.evm.exact.erc4337_facilitator.BundlerClient")
    def test_settle_receipt_poll_exception_ignored(self, mock_bundler_cls, mock_time):
        """settle() ignores exceptions during receipt polling and falls back to user_op_hash."""
        mock_bundler = MagicMock()
        mock_bundler.send_user_operation.return_value = "0xUserOpHash"
        mock_bundler.get_user_operation_receipt.side_effect = Exception("poll error")
        mock_bundler_cls.return_value = mock_bundler

        # Allow one poll iteration then timeout
        mock_time.time.side_effect = [0, 0, 31]
        mock_time.sleep = MagicMock()

        scheme = ExactEvmSchemeERC4337()
        payload = _make_payload()
        result = scheme.settle(payload, _make_requirements())

        assert result.success is True
        assert result.transaction == "0xUserOpHash"


class TestResolveBundlerUrl:
    """Tests for _resolve_bundler_url()."""

    def test_from_requirements_extra(self):
        """_resolve_bundler_url() reads bundler URL from requirements.extra."""
        scheme = ExactEvmSchemeERC4337()
        payload = _make_payload(bundler_url=None)
        req = _make_requirements(
            extra={
                "userOperation": {
                    "supported": True,
                    "bundlerUrl": "https://extra-bundler.example.com",
                }
            }
        )

        with patch("x402.mechanisms.evm.exact.erc4337_facilitator.BundlerClient") as mock_cls:
            mock_cls.return_value = MagicMock()
            result = scheme.verify(payload, req)
            assert result.is_valid is True
            mock_cls.assert_called_with("https://extra-bundler.example.com")

    def test_payload_url_takes_priority(self):
        """_resolve_bundler_url() prefers payload URL over requirements.extra."""
        scheme = ExactEvmSchemeERC4337()
        payload = _make_payload(bundler_url="https://payload-bundler.example.com")
        req = _make_requirements(
            extra={
                "userOperation": {
                    "supported": True,
                    "bundlerUrl": "https://extra-bundler.example.com",
                }
            }
        )

        with patch("x402.mechanisms.evm.exact.erc4337_facilitator.BundlerClient") as mock_cls:
            mock_cls.return_value = MagicMock()
            result = scheme.verify(payload, req)
            assert result.is_valid is True
            mock_cls.assert_called_with("https://payload-bundler.example.com")


class TestVerifyInvalidMessage:
    """Tests for verify() invalid_message field."""

    @patch("x402.mechanisms.evm.exact.erc4337_facilitator.BundlerClient")
    def test_gas_estimation_failure_sets_invalid_message(self, mock_bundler_cls):
        """Gas estimation failure returns result with invalid_message containing the error string."""
        error_msg = "AA21 insufficient funds for gas prefund"
        mock_bundler = MagicMock()
        mock_bundler.estimate_user_operation_gas.side_effect = Exception(error_msg)
        mock_bundler_cls.return_value = mock_bundler

        scheme = ExactEvmSchemeERC4337()
        payload = _make_payload()
        result = scheme.verify(payload, _make_requirements())

        assert result.is_valid is False
        assert result.invalid_reason == ERR_GAS_ESTIMATION_FAILED
        assert result.invalid_message == error_msg
        assert result.payer == "0xSender"


class TestConfigPollingDefaults:
    """Tests for ExactEvmSchemeERC4337Config polling defaults."""

    def test_default_receipt_poll_timeout_ms(self):
        """Default receipt_poll_timeout_ms is 30000."""
        config = ExactEvmSchemeERC4337Config()
        assert config.receipt_poll_timeout_ms == 30000

    def test_default_receipt_poll_interval_ms(self):
        """Default receipt_poll_interval_ms is 1000."""
        config = ExactEvmSchemeERC4337Config()
        assert config.receipt_poll_interval_ms == 1000

    def test_default_bundler_url_is_empty_string(self):
        """Default default_bundler_url is empty string."""
        config = ExactEvmSchemeERC4337Config()
        assert config.default_bundler_url == ""


class TestSettleBundlerUrlMissingAfterVerify:
    """Tests for settle() when verify passes but bundler URL is missing in settle's own check."""

    @patch.object(ExactEvmSchemeERC4337, "verify")
    def test_settle_bundler_url_missing_after_verify_passes(self, mock_verify):
        """settle() returns ERR_MISSING_BUNDLER_URL when verify passes but bundler URL resolves empty."""
        from x402.schemas import VerifyResponse

        mock_verify.return_value = VerifyResponse(is_valid=True, payer="0xSender")

        scheme = ExactEvmSchemeERC4337()  # no default_bundler_url in config
        # Payload with no bundlerRpcUrl
        payload = _make_payload(bundler_url=None)
        # Requirements with no userOperation extra
        req = _make_requirements(extra=None)

        result = scheme.settle(payload, req)

        assert result.success is False
        assert result.error_reason == ERR_MISSING_BUNDLER_URL
        assert result.payer == "0xSender"

    @patch.object(ExactEvmSchemeERC4337, "verify")
    def test_settle_entry_point_missing_after_verify_passes(self, mock_verify):
        """settle() returns ERR_MISSING_ENTRY_POINT when verify passes but entry_point is empty."""
        from x402.schemas import VerifyResponse

        mock_verify.return_value = VerifyResponse(is_valid=True, payer="0xSender")

        scheme = ExactEvmSchemeERC4337()
        # Payload with bundler URL but empty entry point
        payload = _make_payload(bundler_url="https://bundler.example.com")
        payload.payload["entryPoint"] = ""

        result = scheme.settle(payload, _make_requirements())

        assert result.success is False
        assert result.error_reason == ERR_MISSING_ENTRY_POINT
        assert result.payer == "0xSender"


class TestSettleReceiptNoTransactionHashes:
    """Tests for settle() when receipt has no transaction hashes."""

    @patch("x402.mechanisms.evm.exact.erc4337_facilitator.time")
    @patch("x402.mechanisms.evm.exact.erc4337_facilitator.BundlerClient")
    def test_receipt_with_no_tx_hashes_falls_back_to_user_op_hash(
        self, mock_bundler_cls, mock_time
    ):
        """settle where receipt exists but both tx hashes are None falls back to user_op_hash."""
        mock_bundler = MagicMock()
        mock_bundler.send_user_operation.return_value = "0xUserOpHash"

        # Receipt with no transaction hashes
        receipt = UserOperationReceipt(
            user_op_hash="0xUserOpHash",
            entry_point="0x0000000071727De22E5E9d8BAf0edAc6f37da032",
            sender="0xSender",
            nonce="0x01",
            actual_gas_cost="0x100",
            actual_gas_used="0x50",
            success=True,
            receipt_transaction_hash=None,
            transaction_hash=None,
        )
        mock_bundler.get_user_operation_receipt.return_value = receipt
        mock_bundler_cls.return_value = mock_bundler

        mock_time.time.side_effect = [0, 0, 1]
        mock_time.sleep = MagicMock()

        scheme = ExactEvmSchemeERC4337()
        payload = _make_payload()
        result = scheme.settle(payload, _make_requirements())

        assert result.success is True
        assert result.transaction == "0xUserOpHash"
