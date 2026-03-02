"""Tests for ERC-4337 types."""

import pytest

from x402.mechanisms.evm.erc4337_types import (
    Erc4337Payload,
    UserOperation07Json,
    UserOperationCapability,
    extract_user_operation_capability,
    is_erc4337_payload,
)


class TestIsErc4337Payload:
    def test_valid_payload(self):
        data = {
            "userOperation": {"sender": "0x1234"},
            "entryPoint": "0x0000000071727De22E5E9d8BAf0edAc6f37da032",
        }
        assert is_erc4337_payload(data) is True

    def test_with_type_field(self):
        data = {
            "type": "erc4337",
            "userOperation": {"sender": "0x1234"},
            "entryPoint": "0x0000000071727De22E5E9d8BAf0edAc6f37da032",
        }
        assert is_erc4337_payload(data) is True

    def test_eip3009_payload(self):
        data = {
            "authorization": {"from": "0x1234"},
            "signature": "0xabcd",
        }
        assert is_erc4337_payload(data) is False

    def test_permit2_payload(self):
        data = {"permit2Authorization": {"from": "0x1234"}}
        assert is_erc4337_payload(data) is False

    def test_empty_dict(self):
        assert is_erc4337_payload({}) is False

    def test_none(self):
        assert is_erc4337_payload(None) is False

    def test_not_dict(self):
        assert is_erc4337_payload("not a dict") is False

    def test_missing_entry_point(self):
        data = {"userOperation": {"sender": "0x1234"}}
        assert is_erc4337_payload(data) is False

    def test_none_user_operation(self):
        data = {"userOperation": None, "entryPoint": "0x1234"}
        assert is_erc4337_payload(data) is False


class TestErc4337Payload:
    def test_from_dict(self):
        data = {
            "type": "erc4337",
            "entryPoint": "0xEntryPoint",
            "bundlerRpcUrl": "https://bundler.example.com",
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
                "factory": "0xFactory",
                "factoryData": "0xFactoryData",
            },
        }

        payload = Erc4337Payload.from_dict(data)
        assert payload.type == "erc4337"
        assert payload.entry_point == "0xEntryPoint"
        assert payload.bundler_rpc_url == "https://bundler.example.com"
        assert payload.user_operation.sender == "0xSender"
        assert payload.user_operation.factory == "0xFactory"

    def test_to_dict(self):
        payload = Erc4337Payload(
            type="erc4337",
            entry_point="0xEntryPoint",
            bundler_rpc_url="https://bundler.example.com",
            user_operation=UserOperation07Json(
                sender="0xSender",
                nonce="0x01",
                call_data="0xCallData",
                call_gas_limit="0x5208",
                verification_gas_limit="0x10000",
                pre_verification_gas="0x5000",
                max_fee_per_gas="0x3B9ACA00",
                max_priority_fee_per_gas="0x59682F00",
                signature="0xSig",
            ),
        )

        d = payload.to_dict()
        assert d["type"] == "erc4337"
        assert d["entryPoint"] == "0xEntryPoint"
        assert d["bundlerRpcUrl"] == "https://bundler.example.com"
        assert d["userOperation"]["sender"] == "0xSender"

    def test_roundtrip(self):
        original = {
            "type": "erc4337",
            "entryPoint": "0xEntryPoint",
            "bundlerRpcUrl": "https://bundler.example.com",
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

        payload = Erc4337Payload.from_dict(original)
        result = payload.to_dict()
        assert result["entryPoint"] == original["entryPoint"]
        assert result["userOperation"]["sender"] == original["userOperation"]["sender"]


class TestExtractUserOperationCapability:
    def test_present_and_supported(self):
        extra = {
            "userOperation": {
                "supported": True,
                "bundlerUrl": "https://bundler.example.com",
                "entrypoint": "0xEntryPoint",
            }
        }
        cap = extract_user_operation_capability(extra)
        assert cap is not None
        assert cap.supported is True
        assert cap.bundler_url == "https://bundler.example.com"
        assert cap.entrypoint == "0xEntryPoint"

    def test_none_extra(self):
        assert extract_user_operation_capability(None) is None

    def test_no_user_operation_key(self):
        extra = {"name": "USDC"}
        assert extract_user_operation_capability(extra) is None

    def test_not_supported(self):
        extra = {"userOperation": {"supported": False}}
        assert extract_user_operation_capability(extra) is None

    def test_not_dict(self):
        extra = {"userOperation": "not a dict"}
        assert extract_user_operation_capability(extra) is None
