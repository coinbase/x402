"""Tests for ERC-4337 types."""

from x402.mechanisms.evm.erc4337_types import (
    Erc4337Payload,
    UserOperation07Json,
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

    def test_non_dict_user_operation(self):
        """userOperation that is not a dict should return False."""
        data = {
            "userOperation": "not-a-dict",
            "entryPoint": "0x0000000071727De22E5E9d8BAf0edAc6f37da032",
        }
        assert is_erc4337_payload(data) is False

    def test_list_user_operation(self):
        """userOperation that is a list should return False."""
        data = {
            "userOperation": [{"sender": "0x1234"}],
            "entryPoint": "0x0000000071727De22E5E9d8BAf0edAc6f37da032",
        }
        assert is_erc4337_payload(data) is False

    def test_integer_user_operation(self):
        """userOperation that is an integer should return False."""
        data = {
            "userOperation": 42,
            "entryPoint": "0x0000000071727De22E5E9d8BAf0edAc6f37da032",
        }
        assert is_erc4337_payload(data) is False

    def test_bool_user_operation(self):
        """userOperation that is a boolean should return False."""
        data = {
            "userOperation": True,
            "entryPoint": "0x0000000071727De22E5E9d8BAf0edAc6f37da032",
        }
        assert is_erc4337_payload(data) is False


class TestUserOperation07Json:
    def test_to_dict_with_paymaster_fields(self):
        """to_dict includes optional paymaster fields when set."""
        user_op = UserOperation07Json(
            sender="0xSender",
            nonce="0x01",
            call_data="0xCallData",
            call_gas_limit="0x5208",
            verification_gas_limit="0x10000",
            pre_verification_gas="0x5000",
            max_fee_per_gas="0x3B9ACA00",
            max_priority_fee_per_gas="0x59682F00",
            signature="0xSig",
            paymaster="0xPaymaster",
            paymaster_data="0xPaymasterData",
            paymaster_verification_gas_limit="0x20000",
            paymaster_post_op_gas_limit="0x30000",
        )
        d = user_op.to_dict()
        assert d["paymaster"] == "0xPaymaster"
        assert d["paymasterData"] == "0xPaymasterData"
        assert d["paymasterVerificationGasLimit"] == "0x20000"
        assert d["paymasterPostOpGasLimit"] == "0x30000"

    def test_to_dict_without_optional_fields(self):
        """to_dict omits optional fields when None."""
        user_op = UserOperation07Json(
            sender="0xSender",
            nonce="0x01",
            call_data="0xCallData",
            call_gas_limit="0x5208",
            verification_gas_limit="0x10000",
            pre_verification_gas="0x5000",
            max_fee_per_gas="0x3B9ACA00",
            max_priority_fee_per_gas="0x59682F00",
            signature="0xSig",
        )
        d = user_op.to_dict()
        assert "factory" not in d
        assert "factoryData" not in d
        assert "paymaster" not in d
        assert "paymasterData" not in d
        assert "paymasterVerificationGasLimit" not in d
        assert "paymasterPostOpGasLimit" not in d

    def test_to_dict_with_factory_fields(self):
        """to_dict includes factory fields when set."""
        user_op = UserOperation07Json(
            sender="0xSender",
            nonce="0x01",
            call_data="0xCallData",
            call_gas_limit="0x5208",
            verification_gas_limit="0x10000",
            pre_verification_gas="0x5000",
            max_fee_per_gas="0x3B9ACA00",
            max_priority_fee_per_gas="0x59682F00",
            signature="0xSig",
            factory="0xFactory",
            factory_data="0xFactoryData",
        )
        d = user_op.to_dict()
        assert d["factory"] == "0xFactory"
        assert d["factoryData"] == "0xFactoryData"

    def test_from_dict_with_all_optional_fields(self):
        """from_dict parses all optional fields."""
        data = {
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
            "paymaster": "0xPaymaster",
            "paymasterData": "0xPaymasterData",
            "paymasterVerificationGasLimit": "0x20000",
            "paymasterPostOpGasLimit": "0x30000",
        }
        user_op = UserOperation07Json.from_dict(data)
        assert user_op.sender == "0xSender"
        assert user_op.factory == "0xFactory"
        assert user_op.factory_data == "0xFactoryData"
        assert user_op.paymaster == "0xPaymaster"
        assert user_op.paymaster_data == "0xPaymasterData"
        assert user_op.paymaster_verification_gas_limit == "0x20000"
        assert user_op.paymaster_post_op_gas_limit == "0x30000"

    def test_from_dict_defaults(self):
        """from_dict uses defaults for missing required fields."""
        user_op = UserOperation07Json.from_dict({})
        assert user_op.sender == ""
        assert user_op.nonce == ""
        assert user_op.call_data == ""
        assert user_op.factory is None
        assert user_op.paymaster is None

    def test_roundtrip_with_all_fields(self):
        """Full roundtrip with all optional fields set."""
        original = UserOperation07Json(
            sender="0xSender",
            nonce="0x01",
            call_data="0xCallData",
            call_gas_limit="0x5208",
            verification_gas_limit="0x10000",
            pre_verification_gas="0x5000",
            max_fee_per_gas="0x3B9ACA00",
            max_priority_fee_per_gas="0x59682F00",
            signature="0xSig",
            factory="0xFactory",
            factory_data="0xFactoryData",
            paymaster="0xPaymaster",
            paymaster_data="0xPaymasterData",
            paymaster_verification_gas_limit="0x20000",
            paymaster_post_op_gas_limit="0x30000",
        )
        d = original.to_dict()
        restored = UserOperation07Json.from_dict(d)
        assert restored.sender == original.sender
        assert restored.factory == original.factory
        assert restored.paymaster == original.paymaster
        assert restored.paymaster_verification_gas_limit == original.paymaster_verification_gas_limit
        assert restored.paymaster_post_op_gas_limit == original.paymaster_post_op_gas_limit


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

    def test_to_dict_without_optional_fields(self):
        """to_dict omits type and bundlerRpcUrl when None."""
        payload = Erc4337Payload(
            type=None,
            entry_point="0xEntryPoint",
            bundler_rpc_url=None,
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
        assert "type" not in d
        assert "bundlerRpcUrl" not in d
        assert d["entryPoint"] == "0xEntryPoint"
        assert "userOperation" in d

    def test_from_dict_without_optional_fields(self):
        """from_dict handles missing optional type and bundlerRpcUrl."""
        data = {
            "entryPoint": "0xEntryPoint",
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
        payload = Erc4337Payload.from_dict(data)
        assert payload.type is None
        assert payload.bundler_rpc_url is None
        assert payload.entry_point == "0xEntryPoint"

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

    def test_with_paymaster(self):
        """Extracts paymaster field when present."""
        extra = {
            "userOperation": {
                "supported": True,
                "bundlerUrl": "https://bundler.example.com",
                "paymaster": "0xPaymaster",
                "entrypoint": "0xEntryPoint",
            }
        }
        cap = extract_user_operation_capability(extra)
        assert cap is not None
        assert cap.paymaster == "0xPaymaster"

    def test_missing_supported_key(self):
        """Missing 'supported' key returns None (falsy)."""
        extra = {
            "userOperation": {
                "bundlerUrl": "https://bundler.example.com",
            }
        }
        assert extract_user_operation_capability(extra) is None

    def test_supported_zero_integer(self):
        """supported=0 (falsy integer) returns None."""
        extra = {
            "userOperation": {
                "supported": 0,
                "bundlerUrl": "https://bundler.example.com",
                "entrypoint": "0xEntryPoint",
            }
        }
        assert extract_user_operation_capability(extra) is None
