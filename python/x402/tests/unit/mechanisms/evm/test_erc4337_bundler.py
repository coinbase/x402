"""Tests for ERC-4337 bundler client."""

import json
from http.server import BaseHTTPRequestHandler

from x402.mechanisms.evm.exact.erc4337_bundler import (
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
