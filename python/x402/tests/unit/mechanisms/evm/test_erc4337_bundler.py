"""Tests for ERC-4337 bundler client."""

import json
from http.server import BaseHTTPRequestHandler
from unittest.mock import MagicMock, patch

import pytest

from x402.mechanisms.evm.exact.erc4337_bundler import (
    BundlerClient,
    BundlerClientConfig,
    BundlerError,
    GasEstimate,
    UserOperationReceipt,
)


class MockHandler(BaseHTTPRequestHandler):
    """HTTP handler for testing."""

    response_data = None

    def do_POST(self):
        content_length = int(self.headers["Content-Length"])
        body = json.loads(self.rfile.read(content_length))
        MockHandler.last_request = body

        self.send_response(200)
        self.send_header("Content-Type", "application/json")
        self.end_headers()
        self.wfile.write(json.dumps(MockHandler.response_data).encode())

    def log_message(self, format, *args):
        pass  # Suppress log output


class TestBundlerClientConfig:
    def test_defaults(self):
        config = BundlerClientConfig()
        assert config.timeout == 10
        assert config.retries == 0

    def test_custom_values(self):
        config = BundlerClientConfig(timeout=30, retries=3)
        assert config.timeout == 30
        assert config.retries == 3


class TestGasEstimate:
    def test_from_dict(self):
        data = {
            "callGasLimit": "0x5208",
            "verificationGasLimit": "0x10000",
            "preVerificationGas": "0x5000",
        }
        estimate = GasEstimate.from_dict(data)
        assert estimate.call_gas_limit == "0x5208"
        assert estimate.verification_gas_limit == "0x10000"

    def test_from_dict_empty(self):
        estimate = GasEstimate.from_dict({})
        assert estimate.call_gas_limit is None

    def test_from_dict_all_fields(self):
        data = {
            "callGasLimit": "0x5208",
            "verificationGasLimit": "0x10000",
            "preVerificationGas": "0x5000",
            "maxFeePerGas": "0x3B9ACA00",
            "maxPriorityFeePerGas": "0x59682F00",
            "paymasterVerificationGasLimit": "0x20000",
            "paymasterPostOpGasLimit": "0x30000",
        }
        estimate = GasEstimate.from_dict(data)
        assert estimate.call_gas_limit == "0x5208"
        assert estimate.verification_gas_limit == "0x10000"
        assert estimate.pre_verification_gas == "0x5000"
        assert estimate.max_fee_per_gas == "0x3B9ACA00"
        assert estimate.max_priority_fee_per_gas == "0x59682F00"
        assert estimate.paymaster_verification_gas_limit == "0x20000"
        assert estimate.paymaster_post_op_gas_limit == "0x30000"


class TestUserOperationReceipt:
    def test_from_dict_with_receipt(self):
        data = {
            "userOpHash": "0xHash",
            "entryPoint": "0xEntryPoint",
            "sender": "0xSender",
            "nonce": "0x01",
            "actualGasCost": "0x100",
            "actualGasUsed": "0x50",
            "success": True,
            "logs": [],
            "receipt": {"transactionHash": "0xTxHash"},
        }
        receipt = UserOperationReceipt.from_dict(data)
        assert receipt.receipt_transaction_hash == "0xTxHash"
        assert receipt.user_op_hash == "0xHash"

    def test_from_dict_with_top_level_tx_hash(self):
        data = {
            "userOpHash": "0xHash",
            "entryPoint": "0xEntryPoint",
            "sender": "0xSender",
            "nonce": "0x01",
            "actualGasCost": "0x100",
            "actualGasUsed": "0x50",
            "success": True,
            "logs": [],
            "transactionHash": "0xTopLevelHash",
        }
        receipt = UserOperationReceipt.from_dict(data)
        assert receipt.transaction_hash == "0xTopLevelHash"

    def test_from_dict_empty_defaults(self):
        """from_dict with empty dict uses all defaults."""
        receipt = UserOperationReceipt.from_dict({})
        assert receipt.user_op_hash == ""
        assert receipt.entry_point == ""
        assert receipt.sender == ""
        assert receipt.nonce == ""
        assert receipt.actual_gas_cost == ""
        assert receipt.actual_gas_used == ""
        assert receipt.success is False
        assert receipt.reason is None
        assert receipt.logs == []
        assert receipt.transaction_hash is None
        assert receipt.receipt_transaction_hash is None

    def test_from_dict_with_non_dict_receipt(self):
        """from_dict handles non-dict receipt field gracefully."""
        data = {
            "userOpHash": "0xHash",
            "entryPoint": "0xEntryPoint",
            "sender": "0xSender",
            "nonce": "0x01",
            "actualGasCost": "0x100",
            "actualGasUsed": "0x50",
            "success": True,
            "receipt": "not-a-dict",
        }
        receipt = UserOperationReceipt.from_dict(data)
        assert receipt.receipt_transaction_hash is None

    def test_from_dict_with_reason_and_logs(self):
        """from_dict captures reason and logs fields."""
        data = {
            "userOpHash": "0xHash",
            "entryPoint": "0xEntryPoint",
            "sender": "0xSender",
            "nonce": "0x01",
            "actualGasCost": "0x100",
            "actualGasUsed": "0x50",
            "success": False,
            "reason": "AA21 Insufficient funds",
            "logs": [{"topic": "0xabc"}],
        }
        receipt = UserOperationReceipt.from_dict(data)
        assert receipt.reason == "AA21 Insufficient funds"
        assert receipt.logs == [{"topic": "0xabc"}]
        assert receipt.success is False


class TestBundlerError:
    def test_error_attributes(self):
        err = BundlerError(
            "test error",
            code=-32500,
            method="eth_sendUserOperation",
            bundler_url="https://bundler.example.com",
        )
        assert str(err) == "test error"
        assert err.code == -32500
        assert err.method == "eth_sendUserOperation"
        assert err.bundler_url == "https://bundler.example.com"

    def test_error_defaults(self):
        err = BundlerError("simple error")
        assert str(err) == "simple error"
        assert err.code is None
        assert err.data is None
        assert err.method is None
        assert err.bundler_url is None

    def test_error_with_data(self):
        err = BundlerError("data error", data={"key": "value"})
        assert err.data == {"key": "value"}


class TestBundlerClientInit:
    def test_default_config(self):
        client = BundlerClient("https://bundler.example.com")
        assert client._rpc_url == "https://bundler.example.com"
        assert client._config.timeout == 10
        assert client._config.retries == 0

    def test_custom_config(self):
        config = BundlerClientConfig(timeout=30, retries=2)
        client = BundlerClient("https://bundler.example.com", config=config)
        assert client._config.timeout == 30
        assert client._config.retries == 2


class TestBundlerClientEstimateGas:
    @patch("x402.mechanisms.evm.exact.erc4337_bundler.urllib.request.urlopen")
    def test_estimate_success(self, mock_urlopen):
        response_body = json.dumps({
            "jsonrpc": "2.0",
            "id": 1,
            "result": {
                "callGasLimit": "0x5208",
                "verificationGasLimit": "0x10000",
                "preVerificationGas": "0x5000",
            },
        }).encode("utf-8")
        mock_resp = MagicMock()
        mock_resp.status = 200
        mock_resp.read.return_value = response_body
        mock_resp.__enter__ = MagicMock(return_value=mock_resp)
        mock_resp.__exit__ = MagicMock(return_value=False)
        mock_urlopen.return_value = mock_resp

        client = BundlerClient("https://bundler.example.com")
        result = client.estimate_user_operation_gas({"sender": "0x1"}, "0xEntryPoint")
        assert isinstance(result, GasEstimate)
        assert result.call_gas_limit == "0x5208"

    @patch("x402.mechanisms.evm.exact.erc4337_bundler.urllib.request.urlopen")
    def test_estimate_rpc_error(self, mock_urlopen):
        response_body = json.dumps({
            "jsonrpc": "2.0",
            "id": 1,
            "error": {"code": -32500, "message": "AA21 insufficient funds"},
        }).encode("utf-8")
        mock_resp = MagicMock()
        mock_resp.status = 200
        mock_resp.read.return_value = response_body
        mock_resp.__enter__ = MagicMock(return_value=mock_resp)
        mock_resp.__exit__ = MagicMock(return_value=False)
        mock_urlopen.return_value = mock_resp

        client = BundlerClient("https://bundler.example.com")
        with pytest.raises(BundlerError) as exc:
            client.estimate_user_operation_gas({"sender": "0x1"}, "0xEntryPoint")
        assert exc.value.code == -32500
        assert "AA21" in str(exc.value)


class TestBundlerClientSendUserOperation:
    @patch("x402.mechanisms.evm.exact.erc4337_bundler.urllib.request.urlopen")
    def test_send_success(self, mock_urlopen):
        response_body = json.dumps({
            "jsonrpc": "2.0",
            "id": 1,
            "result": "0xUserOpHash123",
        }).encode("utf-8")
        mock_resp = MagicMock()
        mock_resp.status = 200
        mock_resp.read.return_value = response_body
        mock_resp.__enter__ = MagicMock(return_value=mock_resp)
        mock_resp.__exit__ = MagicMock(return_value=False)
        mock_urlopen.return_value = mock_resp

        client = BundlerClient("https://bundler.example.com")
        result = client.send_user_operation({"sender": "0x1"}, "0xEntryPoint")
        assert result == "0xUserOpHash123"

    @patch("x402.mechanisms.evm.exact.erc4337_bundler.urllib.request.urlopen")
    def test_send_non_string_result(self, mock_urlopen):
        """send_user_operation raises when result is not a string."""
        response_body = json.dumps({
            "jsonrpc": "2.0",
            "id": 1,
            "result": {"unexpected": "dict"},
        }).encode("utf-8")
        mock_resp = MagicMock()
        mock_resp.status = 200
        mock_resp.read.return_value = response_body
        mock_resp.__enter__ = MagicMock(return_value=mock_resp)
        mock_resp.__exit__ = MagicMock(return_value=False)
        mock_urlopen.return_value = mock_resp

        client = BundlerClient("https://bundler.example.com")
        with pytest.raises(BundlerError) as exc:
            client.send_user_operation({"sender": "0x1"}, "0xEntryPoint")
        assert "unexpected result type" in str(exc.value)
        assert exc.value.method == "eth_sendUserOperation"

    @patch("x402.mechanisms.evm.exact.erc4337_bundler.urllib.request.urlopen")
    def test_send_rpc_error(self, mock_urlopen):
        response_body = json.dumps({
            "jsonrpc": "2.0",
            "id": 1,
            "error": {"code": -32000, "message": "execution reverted"},
        }).encode("utf-8")
        mock_resp = MagicMock()
        mock_resp.status = 200
        mock_resp.read.return_value = response_body
        mock_resp.__enter__ = MagicMock(return_value=mock_resp)
        mock_resp.__exit__ = MagicMock(return_value=False)
        mock_urlopen.return_value = mock_resp

        client = BundlerClient("https://bundler.example.com")
        with pytest.raises(BundlerError) as exc:
            client.send_user_operation({"sender": "0x1"}, "0xEntryPoint")
        assert exc.value.code == -32000


class TestBundlerClientGetReceipt:
    @patch("x402.mechanisms.evm.exact.erc4337_bundler.urllib.request.urlopen")
    def test_get_receipt_success(self, mock_urlopen):
        response_body = json.dumps({
            "jsonrpc": "2.0",
            "id": 1,
            "result": {
                "userOpHash": "0xHash",
                "entryPoint": "0xEntryPoint",
                "sender": "0xSender",
                "nonce": "0x01",
                "actualGasCost": "0x100",
                "actualGasUsed": "0x50",
                "success": True,
                "logs": [],
                "receipt": {"transactionHash": "0xTxHash"},
            },
        }).encode("utf-8")
        mock_resp = MagicMock()
        mock_resp.status = 200
        mock_resp.read.return_value = response_body
        mock_resp.__enter__ = MagicMock(return_value=mock_resp)
        mock_resp.__exit__ = MagicMock(return_value=False)
        mock_urlopen.return_value = mock_resp

        client = BundlerClient("https://bundler.example.com")
        receipt = client.get_user_operation_receipt("0xHash")
        assert receipt is not None
        assert receipt.receipt_transaction_hash == "0xTxHash"
        assert receipt.user_op_hash == "0xHash"

    @patch("x402.mechanisms.evm.exact.erc4337_bundler.urllib.request.urlopen")
    def test_get_receipt_returns_none(self, mock_urlopen):
        """get_user_operation_receipt returns None when result is None."""
        response_body = json.dumps({
            "jsonrpc": "2.0",
            "id": 1,
            "result": None,
        }).encode("utf-8")
        mock_resp = MagicMock()
        mock_resp.status = 200
        mock_resp.read.return_value = response_body
        mock_resp.__enter__ = MagicMock(return_value=mock_resp)
        mock_resp.__exit__ = MagicMock(return_value=False)
        mock_urlopen.return_value = mock_resp

        client = BundlerClient("https://bundler.example.com")
        receipt = client.get_user_operation_receipt("0xHash")
        assert receipt is None

    @patch("x402.mechanisms.evm.exact.erc4337_bundler.urllib.request.urlopen")
    def test_get_receipt_rpc_error(self, mock_urlopen):
        response_body = json.dumps({
            "jsonrpc": "2.0",
            "id": 1,
            "error": {"code": -32601, "message": "Method not found"},
        }).encode("utf-8")
        mock_resp = MagicMock()
        mock_resp.status = 200
        mock_resp.read.return_value = response_body
        mock_resp.__enter__ = MagicMock(return_value=mock_resp)
        mock_resp.__exit__ = MagicMock(return_value=False)
        mock_urlopen.return_value = mock_resp

        client = BundlerClient("https://bundler.example.com")
        with pytest.raises(BundlerError) as exc:
            client.get_user_operation_receipt("0xHash")
        assert exc.value.code == -32601


class TestBundlerClientCall:
    """Tests for _call() internals."""

    @patch("x402.mechanisms.evm.exact.erc4337_bundler.urllib.request.urlopen")
    def test_call_success(self, mock_urlopen):
        response_body = json.dumps({
            "jsonrpc": "2.0",
            "id": 1,
            "result": "0xResult",
        }).encode("utf-8")
        mock_resp = MagicMock()
        mock_resp.status = 200
        mock_resp.read.return_value = response_body
        mock_resp.__enter__ = MagicMock(return_value=mock_resp)
        mock_resp.__exit__ = MagicMock(return_value=False)
        mock_urlopen.return_value = mock_resp

        client = BundlerClient("https://bundler.example.com")
        result = client._call("test_method", ["param1"])
        assert result == "0xResult"

    @patch("x402.mechanisms.evm.exact.erc4337_bundler.urllib.request.urlopen")
    def test_call_json_rpc_error(self, mock_urlopen):
        """_call raises BundlerError on JSON-RPC error response."""
        response_body = json.dumps({
            "jsonrpc": "2.0",
            "id": 1,
            "error": {
                "code": -32602,
                "message": "Invalid params",
                "data": "extra info",
            },
        }).encode("utf-8")
        mock_resp = MagicMock()
        mock_resp.status = 200
        mock_resp.read.return_value = response_body
        mock_resp.__enter__ = MagicMock(return_value=mock_resp)
        mock_resp.__exit__ = MagicMock(return_value=False)
        mock_urlopen.return_value = mock_resp

        client = BundlerClient("https://bundler.example.com")
        with pytest.raises(BundlerError) as exc:
            client._call("test_method", [])
        assert exc.value.code == -32602
        assert exc.value.data == "extra info"
        assert exc.value.method == "test_method"
        assert exc.value.bundler_url == "https://bundler.example.com"

    @patch("x402.mechanisms.evm.exact.erc4337_bundler.urllib.request.urlopen")
    def test_call_http_error(self, mock_urlopen):
        """_call raises BundlerError on HTTP/network error."""
        import urllib.error

        mock_urlopen.side_effect = urllib.error.URLError("Connection refused")

        client = BundlerClient("https://bundler.example.com")
        with pytest.raises(BundlerError) as exc:
            client._call("test_method", [])
        assert "Bundler request failed" in str(exc.value)
        assert exc.value.method == "test_method"

    @patch("x402.mechanisms.evm.exact.erc4337_bundler.time")
    @patch("x402.mechanisms.evm.exact.erc4337_bundler.urllib.request.urlopen")
    def test_call_retries_on_url_error(self, mock_urlopen, mock_time):
        """_call retries on URLError when retries > 0."""
        import urllib.error

        mock_time.sleep = MagicMock()

        # Fail first, succeed second
        success_body = json.dumps({
            "jsonrpc": "2.0",
            "id": 1,
            "result": "0xRetrySuccess",
        }).encode("utf-8")
        mock_resp = MagicMock()
        mock_resp.status = 200
        mock_resp.read.return_value = success_body
        mock_resp.__enter__ = MagicMock(return_value=mock_resp)
        mock_resp.__exit__ = MagicMock(return_value=False)

        mock_urlopen.side_effect = [
            urllib.error.URLError("Connection refused"),
            mock_resp,
        ]

        config = BundlerClientConfig(retries=1)
        client = BundlerClient("https://bundler.example.com", config=config)
        result = client._call("test_method", [])
        assert result == "0xRetrySuccess"
        assert mock_urlopen.call_count == 2

    @patch("x402.mechanisms.evm.exact.erc4337_bundler.time")
    @patch("x402.mechanisms.evm.exact.erc4337_bundler.urllib.request.urlopen")
    def test_call_retries_exhausted(self, mock_urlopen, mock_time):
        """_call raises after all retries are exhausted."""
        import urllib.error

        mock_time.sleep = MagicMock()
        mock_urlopen.side_effect = urllib.error.URLError("Connection refused")

        config = BundlerClientConfig(retries=2)
        client = BundlerClient("https://bundler.example.com", config=config)
        with pytest.raises(BundlerError) as exc:
            client._call("test_method", [])
        assert "Bundler request failed" in str(exc.value)
        assert mock_urlopen.call_count == 3  # 1 initial + 2 retries

    @patch("x402.mechanisms.evm.exact.erc4337_bundler.urllib.request.urlopen")
    def test_call_json_rpc_error_not_retried(self, mock_urlopen):
        """_call does NOT retry on JSON-RPC error (BundlerError is re-raised immediately)."""
        response_body = json.dumps({
            "jsonrpc": "2.0",
            "id": 1,
            "error": {"code": -32500, "message": "AA21 insufficient funds"},
        }).encode("utf-8")
        mock_resp = MagicMock()
        mock_resp.status = 200
        mock_resp.read.return_value = response_body
        mock_resp.__enter__ = MagicMock(return_value=mock_resp)
        mock_resp.__exit__ = MagicMock(return_value=False)
        mock_urlopen.return_value = mock_resp

        config = BundlerClientConfig(retries=3)
        client = BundlerClient("https://bundler.example.com", config=config)
        with pytest.raises(BundlerError):
            client._call("test_method", [])
        # BundlerError should not be retried
        assert mock_urlopen.call_count == 1

    @patch("x402.mechanisms.evm.exact.erc4337_bundler.urllib.request.urlopen")
    def test_call_sends_correct_request(self, mock_urlopen):
        """_call sends correct JSON-RPC request body."""
        response_body = json.dumps({
            "jsonrpc": "2.0",
            "id": 1,
            "result": None,
        }).encode("utf-8")
        mock_resp = MagicMock()
        mock_resp.status = 200
        mock_resp.read.return_value = response_body
        mock_resp.__enter__ = MagicMock(return_value=mock_resp)
        mock_resp.__exit__ = MagicMock(return_value=False)
        mock_urlopen.return_value = mock_resp

        client = BundlerClient("https://bundler.example.com")
        client._call("eth_estimateUserOperationGas", [{"sender": "0x1"}, "0xEP"])

        # Verify the request was constructed correctly
        call_args = mock_urlopen.call_args
        req = call_args[0][0]
        body = json.loads(req.data.decode("utf-8"))
        assert body["jsonrpc"] == "2.0"
        assert body["id"] == 1
        assert body["method"] == "eth_estimateUserOperationGas"
        assert body["params"] == [{"sender": "0x1"}, "0xEP"]

    @patch("x402.mechanisms.evm.exact.erc4337_bundler.urllib.request.urlopen")
    def test_call_http_500_raises_bundler_error(self, mock_urlopen):
        """_call raises BundlerError with 'Bundler HTTP error: 500' on status 500."""
        mock_resp = MagicMock()
        mock_resp.status = 500
        mock_resp.__enter__ = MagicMock(return_value=mock_resp)
        mock_resp.__exit__ = MagicMock(return_value=False)
        mock_urlopen.return_value = mock_resp

        client = BundlerClient("https://bundler.example.com")
        with pytest.raises(BundlerError) as exc:
            client._call("test_method", [])
        assert "Bundler HTTP error: 500" in str(exc.value)
        assert exc.value.method == "test_method"

    @patch("x402.mechanisms.evm.exact.erc4337_bundler.urllib.request.urlopen")
    def test_call_http_429_raises_bundler_error(self, mock_urlopen):
        """_call raises BundlerError with 'Bundler HTTP error: 429' on status 429."""
        mock_resp = MagicMock()
        mock_resp.status = 429
        mock_resp.__enter__ = MagicMock(return_value=mock_resp)
        mock_resp.__exit__ = MagicMock(return_value=False)
        mock_urlopen.return_value = mock_resp

        client = BundlerClient("https://bundler.example.com")
        with pytest.raises(BundlerError) as exc:
            client._call("test_method", [])
        assert "Bundler HTTP error: 429" in str(exc.value)

    @patch("x402.mechanisms.evm.exact.erc4337_bundler.time")
    @patch("x402.mechanisms.evm.exact.erc4337_bundler.urllib.request.urlopen")
    def test_call_connection_reset_retries(self, mock_urlopen, mock_time):
        """_call retries on ConnectionResetError when retries > 0."""
        mock_time.sleep = MagicMock()

        success_body = json.dumps({
            "jsonrpc": "2.0",
            "id": 1,
            "result": "0xRetrySuccess",
        }).encode("utf-8")
        mock_resp = MagicMock()
        mock_resp.status = 200
        mock_resp.read.return_value = success_body
        mock_resp.__enter__ = MagicMock(return_value=mock_resp)
        mock_resp.__exit__ = MagicMock(return_value=False)

        mock_urlopen.side_effect = [
            ConnectionResetError("Connection reset by peer"),
            mock_resp,
        ]

        config = BundlerClientConfig(retries=1)
        client = BundlerClient("https://bundler.example.com", config=config)
        result = client._call("test_method", [])
        assert result == "0xRetrySuccess"
        assert mock_urlopen.call_count == 2

    @patch("x402.mechanisms.evm.exact.erc4337_bundler.urllib.request.urlopen")
    def test_call_generic_exception_no_retries_raises_immediately(self, mock_urlopen):
        """_call raises BundlerError immediately on generic exception when retries=0."""
        mock_urlopen.side_effect = ConnectionResetError("Connection reset by peer")

        client = BundlerClient("https://bundler.example.com")
        with pytest.raises(BundlerError) as exc:
            client._call("test_method", [])
        assert "Bundler request failed" in str(exc.value)
        assert "Connection reset by peer" in str(exc.value)
        assert mock_urlopen.call_count == 1


class TestBundlerCallNegativeRetries:
    """Tests for _call with negative retries (defensive guard)."""

    @patch("x402.mechanisms.evm.exact.erc4337_bundler.urllib.request.urlopen")
    def test_call_raises_after_retries_with_negative_config(self, mock_urlopen):
        """_call raises 'failed after retries' when max_attempts is 0 (retries=-1)."""
        client = BundlerClient(
            "https://bundler.example.com",
            config=BundlerClientConfig(retries=-1),
        )
        with pytest.raises(BundlerError, match="Bundler request failed after retries"):
            client._call("test_method", [])
        # urlopen should never be called since the loop body doesn't execute
        assert mock_urlopen.call_count == 0


class TestGasEstimateAllDefaults:
    """Tests for GasEstimate defaults."""

    def test_all_7_fields_default_to_none(self):
        """GasEstimate.from_dict({}) returns all 7 fields as None."""
        estimate = GasEstimate.from_dict({})
        assert estimate.call_gas_limit is None
        assert estimate.verification_gas_limit is None
        assert estimate.pre_verification_gas is None
        assert estimate.max_fee_per_gas is None
        assert estimate.max_priority_fee_per_gas is None
        assert estimate.paymaster_verification_gas_limit is None
        assert estimate.paymaster_post_op_gas_limit is None


class TestUserOperationReceiptEmptyReceipt:
    """Tests for UserOperationReceipt with empty receipt dict."""

    def test_empty_receipt_dict(self):
        """from_dict({'receipt': {}}) -- receipt_transaction_hash should be None."""
        receipt = UserOperationReceipt.from_dict({"receipt": {}})
        assert receipt.receipt_transaction_hash is None
