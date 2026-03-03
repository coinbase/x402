"""ERC-4337 Bundler JSON-RPC client for x402 EVM mechanism."""

import json
import time
import urllib.error
import urllib.request
from dataclasses import dataclass, field
from typing import Any


class BundlerError(Exception):
    """Custom error for bundler-related failures."""

    def __init__(
        self,
        message: str,
        code: int | None = None,
        data: Any = None,
        method: str | None = None,
        bundler_url: str | None = None,
    ):
        super().__init__(message)
        self.code = code
        self.data = data
        self.method = method
        self.bundler_url = bundler_url


@dataclass
class BundlerClientConfig:
    """Configuration for BundlerClient."""

    timeout: int = 10  # seconds
    retries: int = 0


@dataclass
class GasEstimate:
    """Gas estimation response from bundler."""

    call_gas_limit: str | None = None
    verification_gas_limit: str | None = None
    pre_verification_gas: str | None = None
    max_fee_per_gas: str | None = None
    max_priority_fee_per_gas: str | None = None
    paymaster_verification_gas_limit: str | None = None
    paymaster_post_op_gas_limit: str | None = None

    @classmethod
    def from_dict(cls, data: dict[str, Any]) -> "GasEstimate":
        return cls(
            call_gas_limit=data.get("callGasLimit"),
            verification_gas_limit=data.get("verificationGasLimit"),
            pre_verification_gas=data.get("preVerificationGas"),
            max_fee_per_gas=data.get("maxFeePerGas"),
            max_priority_fee_per_gas=data.get("maxPriorityFeePerGas"),
            paymaster_verification_gas_limit=data.get("paymasterVerificationGasLimit"),
            paymaster_post_op_gas_limit=data.get("paymasterPostOpGasLimit"),
        )


@dataclass
class UserOperationReceipt:
    """User operation receipt from bundler."""

    user_op_hash: str
    entry_point: str
    sender: str
    nonce: str
    actual_gas_cost: str
    actual_gas_used: str
    success: bool
    reason: str | None = None
    logs: list[Any] = field(default_factory=list)
    transaction_hash: str | None = None
    receipt_transaction_hash: str | None = None

    @classmethod
    def from_dict(cls, data: dict[str, Any]) -> "UserOperationReceipt":
        receipt = data.get("receipt", {})
        return cls(
            user_op_hash=data.get("userOpHash", ""),
            entry_point=data.get("entryPoint", ""),
            sender=data.get("sender", ""),
            nonce=data.get("nonce", ""),
            actual_gas_cost=data.get("actualGasCost", ""),
            actual_gas_used=data.get("actualGasUsed", ""),
            success=data.get("success", False),
            reason=data.get("reason"),
            logs=data.get("logs", []),
            transaction_hash=data.get("transactionHash"),
            receipt_transaction_hash=receipt.get("transactionHash")
            if isinstance(receipt, dict)
            else None,
        )


class BundlerClient:
    """JSON-RPC client for ERC-4337 bundler operations."""

    def __init__(self, rpc_url: str, config: BundlerClientConfig | None = None):
        self._rpc_url = rpc_url
        self._config = config or BundlerClientConfig()

    def estimate_user_operation_gas(self, user_op: dict[str, Any], entry_point: str) -> GasEstimate:
        """Estimate gas for a user operation."""
        result = self._call("eth_estimateUserOperationGas", [user_op, entry_point])
        return GasEstimate.from_dict(result)

    def send_user_operation(self, user_op: dict[str, Any], entry_point: str) -> str:
        """Send a user operation and return the hash."""
        result = self._call("eth_sendUserOperation", [user_op, entry_point])
        if not isinstance(result, str):
            raise BundlerError(
                "unexpected result type from eth_sendUserOperation",
                method="eth_sendUserOperation",
                bundler_url=self._rpc_url,
            )
        return result

    def get_user_operation_receipt(self, user_op_hash: str) -> UserOperationReceipt | None:
        """Get the receipt for a user operation."""
        result = self._call("eth_getUserOperationReceipt", [user_op_hash])
        if result is None:
            return None
        return UserOperationReceipt.from_dict(result)

    def _call(self, method: str, params: list[Any]) -> Any:
        """Make a JSON-RPC call with timeout and retry."""
        request_body = json.dumps(
            {
                "jsonrpc": "2.0",
                "id": 1,
                "method": method,
                "params": params,
            }
        ).encode("utf-8")

        max_attempts = self._config.retries + 1

        for attempt in range(max_attempts):
            try:
                req = urllib.request.Request(
                    self._rpc_url,
                    data=request_body,
                    headers={"Content-Type": "application/json"},
                    method="POST",
                )

                with urllib.request.urlopen(req, timeout=self._config.timeout) as resp:
                    if resp.status != 200:
                        raise BundlerError(
                            f"Bundler HTTP error: {resp.status}",
                            method=method,
                            bundler_url=self._rpc_url,
                        )

                    response_data = json.loads(resp.read().decode("utf-8"))

                if "error" in response_data and response_data["error"] is not None:
                    error = response_data["error"]
                    raise BundlerError(
                        error.get("message", "Bundler RPC error"),
                        code=error.get("code"),
                        data=error.get("data"),
                        method=method,
                        bundler_url=self._rpc_url,
                    )

                return response_data.get("result")

            except BundlerError:
                raise
            except urllib.error.URLError as e:
                if attempt < max_attempts - 1:
                    time.sleep(2**attempt * 0.1)
                    continue
                raise BundlerError(
                    f"Bundler request failed: {e}",
                    method=method,
                    bundler_url=self._rpc_url,
                ) from e
            except Exception as e:
                if attempt < max_attempts - 1:
                    time.sleep(2**attempt * 0.1)
                    continue
                raise BundlerError(
                    f"Bundler request failed: {e}",
                    method=method,
                    bundler_url=self._rpc_url,
                ) from e

        raise BundlerError(
            "Bundler request failed after retries",
            method=method,
            bundler_url=self._rpc_url,
        )
