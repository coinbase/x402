"""TVM facilitator implementation for the Exact payment scheme."""

from __future__ import annotations

import asyncio
import logging
import time
from dataclasses import dataclass, field
from typing import Any

from ..boc import compute_boc_hash, parse_external_message, parse_w5_body
from ..constants import (
    DEFAULT_MAX_RELAY_COMMISSION,
    ERR_SETTLEMENT_FAILED,
    SCHEME_EXACT,
    SETTLEMENT_TIMEOUT,
    SUPPORTED_NETWORKS,
)
from ..signer import FacilitatorTvmSigner
from ..types import PaymentState, TvmPaymentPayload, VerifyResult
from ..utils import normalize_address
from ..verify import VerifyConfig, verify_payment

logger = logging.getLogger(__name__)


@dataclass
class ExactTvmSchemeConfig:
    """Configuration for ExactTvmScheme facilitator."""

    relay_address: str | None = None
    max_relay_commission: int = DEFAULT_MAX_RELAY_COMMISSION
    supported_networks: set[str] = field(default_factory=lambda: set(SUPPORTED_NETWORKS))
    settlement_timeout: int = SETTLEMENT_TIMEOUT


@dataclass
class _PaymentRecord:
    """Tracks the lifecycle of a single payment."""

    boc_hash: str
    state: PaymentState = PaymentState.SEEN
    tx_hash: str = ""
    payer: str = ""
    error: str = ""
    created_at: float = field(default_factory=time.time)
    updated_at: float = field(default_factory=time.time)

    def transition(self, new_state: PaymentState) -> None:
        valid_transitions = {
            PaymentState.SEEN: {PaymentState.VERIFIED, PaymentState.FAILED},
            PaymentState.VERIFIED: {PaymentState.SETTLING, PaymentState.FAILED},
            PaymentState.SETTLING: {PaymentState.SUBMITTED, PaymentState.FAILED},
            PaymentState.SUBMITTED: {
                PaymentState.CONFIRMED,
                PaymentState.FAILED,
                PaymentState.EXPIRED,
            },
            PaymentState.CONFIRMED: set(),
            PaymentState.FAILED: set(),
            PaymentState.EXPIRED: set(),
        }

        allowed = valid_transitions.get(self.state, set())
        if new_state not in allowed:
            raise ValueError(f"Invalid state transition: {self.state} -> {new_state}")

        self.state = new_state
        self.updated_at = time.time()


class _PaymentStateStore:
    """In-memory payment state store."""

    def __init__(self) -> None:
        self._records: dict[str, _PaymentRecord] = {}

    def get(self, boc_hash: str) -> _PaymentRecord | None:
        return self._records.get(boc_hash)

    def get_or_create(self, boc_hash: str, payer: str = "") -> _PaymentRecord:
        if boc_hash not in self._records:
            self._records[boc_hash] = _PaymentRecord(boc_hash=boc_hash, payer=payer)
        return self._records[boc_hash]

    def is_settled(self, boc_hash: str) -> tuple[bool, str]:
        record = self._records.get(boc_hash)
        if record is None:
            return False, ""
        if record.state in (PaymentState.SUBMITTED, PaymentState.CONFIRMED):
            return True, record.tx_hash
        return False, ""


class ExactTvmScheme:
    """TVM facilitator for the 'exact' payment scheme.

    Implements the SchemeNetworkFacilitator protocol from x402 SDK.

    Attributes:
        scheme: The scheme identifier ("exact").
        caip_family: The CAIP family pattern ("tvm:*").
    """

    scheme = SCHEME_EXACT
    caip_family = "tvm:*"

    def __init__(
        self,
        provider: FacilitatorTvmSigner,
        config: ExactTvmSchemeConfig | None = None,
    ):
        """Create ExactTvmScheme facilitator.

        Args:
            provider: TVM provider for verification and settlement.
            config: Optional configuration.
        """
        self._provider = provider
        self._config = config or ExactTvmSchemeConfig()
        self._state_store = _PaymentStateStore()
        self._verify_config = VerifyConfig(
            relay_address=self._config.relay_address,
            max_relay_commission=self._config.max_relay_commission,
            supported_networks=self._config.supported_networks,
        )

    def get_extra(self, network: str) -> dict[str, Any] | None:
        """Return extra data for SupportedKind."""
        if self._config.relay_address:
            return {"relayAddress": self._config.relay_address}
        return None

    def get_signers(self, network: str) -> list[str]:
        """Get signer addresses. TVM facilitator doesn't sign - returns empty."""
        return []

    async def verify(
        self,
        payload: dict[str, Any],
        requirements: dict[str, Any],
        context: Any = None,
    ) -> dict[str, Any]:
        """Verify a TVM payment payload.

        Args:
            payload: x402 PaymentPayload.payload dict.
            requirements: x402 PaymentRequirements dict.
            context: Optional facilitator context.

        Returns:
            Dict matching VerifyResponse schema.
        """
        try:
            tvm_payload = TvmPaymentPayload.from_dict(payload)
        except Exception as e:
            return {
                "is_valid": False,
                "invalid_reason": f"Invalid payload: {e}",
                "payer": None,
            }

        scheme = requirements.get("scheme", "")
        network = str(requirements.get("network", ""))
        required_amount = str(requirements.get("amount", "0"))
        required_pay_to = str(requirements.get("pay_to", ""))
        required_asset = str(requirements.get("asset", ""))
        payer = tvm_payload.sender

        result = await verify_payment(
            payload=tvm_payload,
            scheme=scheme,
            network=network,
            required_amount=required_amount,
            required_pay_to=required_pay_to,
            required_asset=required_asset,
            provider=self._provider,
            config=self._verify_config,
        )

        if result.ok:
            boc_hash = compute_boc_hash(tvm_payload.settlement_boc)
            record = self._state_store.get_or_create(boc_hash, payer=payer)
            if record.state == PaymentState.SEEN:
                record.transition(PaymentState.VERIFIED)

        return {
            "is_valid": result.ok,
            "invalid_reason": result.reason if not result.ok else None,
            "payer": payer,
        }

    async def settle(
        self,
        payload: dict[str, Any],
        requirements: dict[str, Any],
        context: Any = None,
    ) -> dict[str, Any]:
        """Settle a TVM payment on-chain.

        Idempotent: if already settled, returns the existing tx hash.

        Args:
            payload: x402 PaymentPayload.payload dict.
            requirements: x402 PaymentRequirements dict.
            context: Optional facilitator context.

        Returns:
            Dict matching SettleResponse schema.
        """
        try:
            tvm_payload = TvmPaymentPayload.from_dict(payload)
        except Exception as e:
            return {
                "success": False,
                "error_reason": f"Invalid payload: {e}",
                "payer": None,
                "transaction": "",
                "network": "",
            }

        payer = tvm_payload.sender
        network = str(requirements.get("network", ""))
        boc_hash = compute_boc_hash(tvm_payload.settlement_boc)

        # Idempotency check
        already_settled, existing_tx = self._state_store.is_settled(boc_hash)
        if already_settled:
            logger.info("Payment %s already settled: %s", boc_hash[:12], existing_tx)
            return {
                "success": True,
                "transaction": existing_tx,
                "network": network,
                "payer": payer,
            }

        # Verify first
        verify_result = await self.verify(payload, requirements, context)
        if not verify_result["is_valid"]:
            return {
                "success": False,
                "error_reason": verify_result.get("invalid_reason", "Verification failed"),
                "payer": payer,
                "transaction": "",
                "network": network,
            }

        # Transition to settling
        record = self._state_store.get_or_create(boc_hash, payer=payer)
        try:
            record.transition(PaymentState.SETTLING)
        except ValueError:
            pass

        # Submit via gasless relay
        try:
            msg_hash = await self._provider.gasless_send(
                boc=tvm_payload.settlement_boc,
                wallet_public_key=tvm_payload.wallet_public_key,
            )

            record.tx_hash = msg_hash or boc_hash[:16]
            record.transition(PaymentState.SUBMITTED)

            tx_hash = await self._wait_for_confirmation(
                tvm_payload, record, timeout=self._config.settlement_timeout
            )

            if tx_hash:
                record.tx_hash = tx_hash
                record.transition(PaymentState.CONFIRMED)
                return {
                    "success": True,
                    "transaction": tx_hash,
                    "network": network,
                    "payer": payer,
                }
            else:
                return {
                    "success": True,
                    "transaction": record.tx_hash,
                    "network": network,
                    "payer": payer,
                }

        except Exception as e:
            logger.error("Settlement failed for %s: %s", boc_hash[:12], e)
            try:
                record.transition(PaymentState.FAILED)
                record.error = str(e)
            except ValueError:
                pass

            return {
                "success": False,
                "error_reason": f"{ERR_SETTLEMENT_FAILED}: {e}",
                "payer": payer,
                "transaction": "",
                "network": network,
            }

    async def _wait_for_confirmation(
        self,
        payload: TvmPaymentPayload,
        record: Any,
        timeout: int = 15,
    ) -> str | None:
        """Poll for transaction confirmation."""
        start = time.time()
        sender = normalize_address(payload.sender)

        while time.time() - start < timeout:
            try:
                current_seqno = await self._provider.get_seqno(sender)
                body = parse_external_message(payload.settlement_boc)
                w5_msg = parse_w5_body(body)

                if current_seqno > w5_msg.seqno:
                    return record.tx_hash
            except Exception:
                pass

            await asyncio.sleep(2)

        return None
