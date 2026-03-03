"""ERC-4337 facilitator implementation for the Exact payment scheme."""

import time
from dataclasses import dataclass
from typing import Any

from ....schemas import (
    Network,
    PaymentPayload,
    PaymentRequirements,
    SettleResponse,
    VerifyResponse,
)
from ..constants import SCHEME_EXACT
from ..erc4337_constants import (
    ERR_GAS_ESTIMATION_FAILED,
    ERR_MISSING_BUNDLER_URL,
    ERR_MISSING_ENTRY_POINT,
    ERR_MISSING_USER_OPERATION,
    ERR_SEND_FAILED,
)
from ..erc4337_types import Erc4337Payload, extract_user_operation_capability, is_erc4337_payload
from .erc4337_bundler import BundlerClient


@dataclass
class ExactEvmSchemeERC4337Config:
    """Configuration for ERC-4337 facilitator."""

    default_bundler_url: str = ""
    receipt_poll_timeout_ms: int = 30000
    receipt_poll_interval_ms: int = 1000


class ExactEvmSchemeERC4337:
    """ERC-4337 facilitator for the Exact payment scheme.

    Verifies and settles UserOperation payments through a bundler.
    No facilitator signer is needed — the user signs the UserOperation.

    Attributes:
        scheme: The scheme identifier ("exact").
        caip_family: The CAIP family pattern ("eip155:*").
    """

    scheme = SCHEME_EXACT
    caip_family = "eip155:*"

    def __init__(self, config: ExactEvmSchemeERC4337Config | None = None):
        self._config = config or ExactEvmSchemeERC4337Config()

    def get_extra(self, network: Network) -> dict[str, Any] | None:
        """Get mechanism-specific extra data. Returns None for ERC-4337."""
        return None

    def get_signers(self, network: Network) -> list[str]:
        """Get signer addresses. Returns empty — no facilitator signer needed."""
        return []

    def verify(
        self,
        payload: PaymentPayload,
        requirements: PaymentRequirements,
        context: Any = None,
    ) -> VerifyResponse:
        """Verify a payment payload containing a user operation.

        Args:
            payload: The payment payload.
            requirements: The payment requirements.
            context: Optional context (unused).

        Returns:
            VerifyResponse with is_valid and payer.
        """
        if not is_erc4337_payload(payload.payload):
            return VerifyResponse(
                is_valid=False,
                invalid_reason=ERR_MISSING_USER_OPERATION,
            )

        erc4337_payload = Erc4337Payload.from_dict(payload.payload)
        payer = erc4337_payload.user_operation.sender

        bundler_url = self._resolve_bundler_url(erc4337_payload, requirements)
        if not bundler_url:
            return VerifyResponse(
                is_valid=False,
                invalid_reason=ERR_MISSING_BUNDLER_URL,
                payer=payer,
            )

        entry_point = erc4337_payload.entry_point
        if not entry_point:
            return VerifyResponse(
                is_valid=False,
                invalid_reason=ERR_MISSING_ENTRY_POINT,
                payer=payer,
            )

        # Verify by estimating gas through bundler
        try:
            bundler = BundlerClient(bundler_url)
            bundler.estimate_user_operation_gas(
                erc4337_payload.user_operation.to_dict(), entry_point
            )
            return VerifyResponse(is_valid=True, payer=payer)
        except Exception as e:
            return VerifyResponse(
                is_valid=False,
                invalid_reason=ERR_GAS_ESTIMATION_FAILED,
                invalid_message=str(e),
                payer=payer,
            )

    def settle(
        self,
        payload: PaymentPayload,
        requirements: PaymentRequirements,
        context: Any = None,
    ) -> SettleResponse:
        """Settle a payment by sending the user operation to the bundler.

        Args:
            payload: The payment payload.
            requirements: The payment requirements.
            context: Optional context (unused).

        Returns:
            SettleResponse with success, transaction, and payer.
        """
        network = str(payload.accepted.network)

        # Re-verify
        verify_result = self.verify(payload, requirements, context)
        if not verify_result.is_valid:
            return SettleResponse(
                success=False,
                error_reason=verify_result.invalid_reason,
                network=network,
                payer=verify_result.payer,
                transaction="",
            )

        erc4337_payload = Erc4337Payload.from_dict(payload.payload)
        payer = erc4337_payload.user_operation.sender

        bundler_url = self._resolve_bundler_url(erc4337_payload, requirements)
        if not bundler_url:
            return SettleResponse(
                success=False,
                error_reason=ERR_MISSING_BUNDLER_URL,
                network=network,
                payer=payer,
                transaction="",
            )

        entry_point = erc4337_payload.entry_point
        if not entry_point:
            return SettleResponse(
                success=False,
                error_reason=ERR_MISSING_ENTRY_POINT,
                network=network,
                payer=payer,
                transaction="",
            )

        try:
            bundler = BundlerClient(bundler_url)

            # Send user operation
            user_op_hash = bundler.send_user_operation(
                erc4337_payload.user_operation.to_dict(), entry_point
            )

            # Poll for receipt
            deadline = time.time() + self._config.receipt_poll_timeout_ms / 1000
            receipt = None

            while time.time() < deadline:
                try:
                    receipt = bundler.get_user_operation_receipt(user_op_hash)
                    if receipt is not None:
                        break
                except Exception:
                    pass
                time.sleep(self._config.receipt_poll_interval_ms / 1000)

            # Extract transaction hash
            tx_hash = user_op_hash
            if receipt is not None:
                if receipt.receipt_transaction_hash:
                    tx_hash = receipt.receipt_transaction_hash
                elif receipt.transaction_hash:
                    tx_hash = receipt.transaction_hash

            return SettleResponse(
                success=True,
                transaction=tx_hash,
                network=network,
                payer=payer,
            )

        except Exception as e:
            return SettleResponse(
                success=False,
                error_reason=ERR_SEND_FAILED,
                error_message=str(e),
                network=network,
                payer=payer,
                transaction="",
            )

    def _resolve_bundler_url(
        self,
        payload: Erc4337Payload,
        requirements: PaymentRequirements,
    ) -> str:
        """Resolve bundler URL from payload, requirements, or config."""
        # 1. From payload
        if payload.bundler_rpc_url:
            return payload.bundler_rpc_url

        # 2. From requirements.extra.userOperation.bundlerUrl
        extra = getattr(requirements, "extra", None)
        cap = extract_user_operation_capability(extra)
        if cap and cap.bundler_url:
            return cap.bundler_url

        # 3. From config
        return self._config.default_bundler_url
