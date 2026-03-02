"""ERC-4337 type definitions for x402 EVM mechanism."""

from dataclasses import dataclass
from typing import Any


@dataclass
class UserOperation07Json:
    """ERC-4337 v0.7 User Operation in JSON-RPC format."""

    sender: str
    nonce: str
    call_data: str
    call_gas_limit: str
    verification_gas_limit: str
    pre_verification_gas: str
    max_fee_per_gas: str
    max_priority_fee_per_gas: str
    signature: str
    factory: str | None = None
    factory_data: str | None = None
    paymaster: str | None = None
    paymaster_data: str | None = None
    paymaster_verification_gas_limit: str | None = None
    paymaster_post_op_gas_limit: str | None = None

    def to_dict(self) -> dict[str, Any]:
        """Convert to dictionary with camelCase keys for JSON serialization."""
        result: dict[str, Any] = {
            "sender": self.sender,
            "nonce": self.nonce,
            "callData": self.call_data,
            "callGasLimit": self.call_gas_limit,
            "verificationGasLimit": self.verification_gas_limit,
            "preVerificationGas": self.pre_verification_gas,
            "maxFeePerGas": self.max_fee_per_gas,
            "maxPriorityFeePerGas": self.max_priority_fee_per_gas,
            "signature": self.signature,
        }
        if self.factory is not None:
            result["factory"] = self.factory
        if self.factory_data is not None:
            result["factoryData"] = self.factory_data
        if self.paymaster is not None:
            result["paymaster"] = self.paymaster
        if self.paymaster_data is not None:
            result["paymasterData"] = self.paymaster_data
        if self.paymaster_verification_gas_limit is not None:
            result["paymasterVerificationGasLimit"] = self.paymaster_verification_gas_limit
        if self.paymaster_post_op_gas_limit is not None:
            result["paymasterPostOpGasLimit"] = self.paymaster_post_op_gas_limit
        return result

    @classmethod
    def from_dict(cls, data: dict[str, Any]) -> "UserOperation07Json":
        """Create from dictionary with camelCase keys."""
        return cls(
            sender=data.get("sender", ""),
            nonce=data.get("nonce", ""),
            call_data=data.get("callData", ""),
            call_gas_limit=data.get("callGasLimit", ""),
            verification_gas_limit=data.get("verificationGasLimit", ""),
            pre_verification_gas=data.get("preVerificationGas", ""),
            max_fee_per_gas=data.get("maxFeePerGas", ""),
            max_priority_fee_per_gas=data.get("maxPriorityFeePerGas", ""),
            signature=data.get("signature", ""),
            factory=data.get("factory"),
            factory_data=data.get("factoryData"),
            paymaster=data.get("paymaster"),
            paymaster_data=data.get("paymasterData"),
            paymaster_verification_gas_limit=data.get("paymasterVerificationGasLimit"),
            paymaster_post_op_gas_limit=data.get("paymasterPostOpGasLimit"),
        )


@dataclass
class Erc4337Payload:
    """ERC-4337 payload structure for x402 payments."""

    entry_point: str
    user_operation: UserOperation07Json
    type: str | None = "erc4337"
    bundler_rpc_url: str | None = None

    def to_dict(self) -> dict[str, Any]:
        """Convert to dictionary with camelCase keys for JSON serialization."""
        result: dict[str, Any] = {
            "entryPoint": self.entry_point,
            "userOperation": self.user_operation.to_dict(),
        }
        if self.type is not None:
            result["type"] = self.type
        if self.bundler_rpc_url is not None:
            result["bundlerRpcUrl"] = self.bundler_rpc_url
        return result

    @classmethod
    def from_dict(cls, data: dict[str, Any]) -> "Erc4337Payload":
        """Create from dictionary with camelCase keys."""
        user_op_data = data.get("userOperation", {})
        return cls(
            entry_point=data.get("entryPoint", ""),
            user_operation=UserOperation07Json.from_dict(user_op_data),
            type=data.get("type"),
            bundler_rpc_url=data.get("bundlerRpcUrl"),
        )


@dataclass
class UserOperationCapability:
    """ERC-4337 UserOperation capability advertised in payment requirements."""

    supported: bool = True
    bundler_url: str | None = None
    paymaster: str | None = None
    entrypoint: str | None = None


def is_erc4337_payload(payload: Any) -> bool:
    """Check if a payload is an ERC-4337 payload.

    ERC-4337 payloads have a `userOperation` field and an `entryPoint` field.

    Args:
        payload: The value to check.

    Returns:
        Whether the payload is an ERC-4337 payload.
    """
    if not isinstance(payload, dict):
        return False
    user_op = payload.get("userOperation")
    return user_op is not None and isinstance(user_op, dict) and "entryPoint" in payload


def extract_user_operation_capability(
    extra: dict[str, Any] | None,
) -> UserOperationCapability | None:
    """Extract UserOperation capability from payment requirements extra.

    Args:
        extra: The extra dict from payment requirements.

    Returns:
        The capability if present and supported, None otherwise.
    """
    if extra is None:
        return None

    user_op_extra = extra.get("userOperation")
    if not isinstance(user_op_extra, dict):
        return None

    if not user_op_extra.get("supported"):
        return None

    return UserOperationCapability(
        supported=True,
        bundler_url=user_op_extra.get("bundlerUrl"),
        paymaster=user_op_extra.get("paymaster"),
        entrypoint=user_op_extra.get("entrypoint"),
    )
