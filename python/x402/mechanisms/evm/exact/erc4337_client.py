"""ERC-4337 client implementation for the Exact payment scheme."""

from __future__ import annotations

from typing import Any, Protocol, runtime_checkable

from ....schemas import PaymentRequirements
from ..constants import SCHEME_EXACT
from ..erc4337_types import (
    Erc4337Payload,
    UserOperation07Json,
    extract_user_operation_capability,
)
from .erc4337_errors import PaymentCreationError, parse_aa_error


@runtime_checkable
class ERC4337UserOperationSigner(Protocol):
    """Protocol for signing ERC-4337 user operations."""

    @property
    def address(self) -> str:
        """The signer's smart account address."""
        ...

    def sign_user_operation(self, user_op: UserOperation07Json) -> str:
        """Sign a prepared user operation and return the signature."""
        ...


@runtime_checkable
class ERC4337BundlerClient(Protocol):
    """Protocol for bundler interactions during payment creation."""

    def prepare_user_operation(
        self,
        calls: list[dict[str, Any]],
        entry_point: str,
    ) -> UserOperation07Json:
        """Prepare a user operation from calls."""
        ...

    def estimate_gas(
        self,
        user_op: UserOperation07Json,
        entry_point: str,
    ) -> UserOperation07Json:
        """Estimate gas for a user operation."""
        ...

    def send_user_operation(
        self,
        user_op: UserOperation07Json,
        entry_point: str,
    ) -> str:
        """Send a signed user operation and return the hash."""
        ...


class ExactEvmSchemeERC4337:
    """ERC-4337 client for the Exact payment scheme.

    Creates payment payloads by building and signing UserOperations
    that execute ERC20 transfers.

    Attributes:
        scheme: The scheme identifier ("exact").
    """

    scheme = SCHEME_EXACT

    def __init__(
        self,
        signer: ERC4337UserOperationSigner,
        bundler_client: ERC4337BundlerClient,
        entrypoint: str | None = None,
        bundler_url: str | None = None,
    ):
        """Create ERC-4337 client scheme.

        Args:
            signer: Signs user operations.
            bundler_client: Prepares user operations via bundler.
            entrypoint: Optional EntryPoint v0.7 address.
            bundler_url: Optional bundler URL.
        """
        self._signer = signer
        self._bundler_client = bundler_client
        self._entrypoint = entrypoint
        self._bundler_url = bundler_url

    def create_payment_payload(
        self,
        requirements: PaymentRequirements,
    ) -> dict[str, Any]:
        """Create signed ERC-4337 inner payload.

        Args:
            requirements: Payment requirements from server.

        Returns:
            Inner payload dict (entryPoint + userOperation).

        Raises:
            PaymentCreationError: If creation fails.
        """
        capability = extract_user_operation_capability(getattr(requirements, "extra", None))

        # Resolve entrypoint
        entry_point = self._entrypoint
        if not entry_point and capability:
            entry_point = capability.entrypoint
        if not entry_point:
            raise PaymentCreationError(
                "Entry point not provided",
                phase="validation",
                reason="Set entrypoint in config or in payment requirements extra.userOperation.entrypoint",
                network=str(requirements.network),
            )

        # Resolve bundler URL
        bundler_url = self._bundler_url
        if not bundler_url and capability:
            bundler_url = capability.bundler_url
        if not bundler_url:
            raise PaymentCreationError(
                "Bundler URL not provided",
                phase="validation",
                reason="Set bundler_url in config or in payment requirements extra.userOperation.bundlerUrl",
                network=str(requirements.network),
            )

        # Build ERC20 transfer call
        amount = requirements.amount
        if not amount:
            raise PaymentCreationError(
                "Missing amount",
                phase="validation",
                reason="Payment requirements missing amount",
                network=str(requirements.network),
            )

        calls = [
            {
                "to": requirements.asset,
                "value": "0x0",
                "data": _build_erc20_transfer_calldata(requirements.pay_to, int(amount)),
            }
        ]

        # Prepare user operation
        try:
            unsigned_user_op = self._bundler_client.prepare_user_operation(calls, entry_point)
        except Exception as e:
            aa_error = parse_aa_error(e)
            reason = aa_error["reason"] if aa_error else str(e)
            raise PaymentCreationError(
                f"Payment preparation failed: {reason}",
                phase="preparation",
                reason=reason,
                network=str(requirements.network),
                code=aa_error["code"] if aa_error else None,
            ) from e

        # Sign user operation
        try:
            signature = self._signer.sign_user_operation(unsigned_user_op)
        except Exception as e:
            aa_error = parse_aa_error(e)
            reason = aa_error["reason"] if aa_error else str(e)
            raise PaymentCreationError(
                f"Payment signing failed: {reason}",
                phase="signing",
                reason=reason,
                network=str(requirements.network),
                code=aa_error["code"] if aa_error else None,
            ) from e

        # Create signed user operation
        signed_user_op = UserOperation07Json(
            sender=unsigned_user_op.sender,
            nonce=unsigned_user_op.nonce,
            call_data=unsigned_user_op.call_data,
            call_gas_limit=unsigned_user_op.call_gas_limit,
            verification_gas_limit=unsigned_user_op.verification_gas_limit,
            pre_verification_gas=unsigned_user_op.pre_verification_gas,
            max_fee_per_gas=unsigned_user_op.max_fee_per_gas,
            max_priority_fee_per_gas=unsigned_user_op.max_priority_fee_per_gas,
            signature=signature,
            factory=unsigned_user_op.factory,
            factory_data=unsigned_user_op.factory_data,
            paymaster=unsigned_user_op.paymaster,
            paymaster_data=unsigned_user_op.paymaster_data,
            paymaster_verification_gas_limit=unsigned_user_op.paymaster_verification_gas_limit,
            paymaster_post_op_gas_limit=unsigned_user_op.paymaster_post_op_gas_limit,
        )

        payload = Erc4337Payload(
            type="erc4337",
            entry_point=entry_point,
            bundler_rpc_url=bundler_url,
            user_operation=signed_user_op,
        )

        return payload.to_dict()


def _build_erc20_transfer_calldata(to: str, amount: int) -> str:
    """Build calldata for ERC20 transfer(address,uint256).

    Args:
        to: Recipient address.
        amount: Amount in smallest unit.

    Returns:
        Hex-encoded calldata with 0x prefix.
    """
    # transfer(address,uint256) selector: 0xa9059cbb
    selector = "a9059cbb"

    # Pad address to 32 bytes
    to_clean = to.lower().replace("0x", "")
    to_padded = to_clean.zfill(64)

    # Pad amount to 32 bytes
    amount_hex = hex(amount)[2:]
    amount_padded = amount_hex.zfill(64)

    return f"0x{selector}{to_padded}{amount_padded}"
