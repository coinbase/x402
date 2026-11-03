"""EVM facilitator implementation for the Upto payment scheme."""

import random
from dataclasses import dataclass
from typing import Any

from ....pending_settlement_store import InMemoryPendingSettlementStore, PendingSettlementStore
from ....schemas import (
    Network,
    PaymentPayload,
    PaymentRequirements,
    SettleResponse,
    VerifyResponse,
)
from ..constants import ERR_UPTO_INVALID_PAYLOAD, SCHEME_UPTO
from ..signer import FacilitatorEvmSigner
from ..types import (
    UptoEIP3009Payload,
    is_upto_eip3009_payload,
    is_upto_permit2_payload,
)
from .eip3009_utils import settle_upto_eip3009, verify_upto_eip3009
from .permit2_utils import settle_upto_permit2, verify_upto_permit2


@dataclass
class UptoEvmSchemeConfig:
    """Configuration for upto facilitator behavior."""

    simulate_in_settle: bool = False
    """Simulate Permit2 settlement during settle. ERC-3009 always simulates the actual amount."""


class UptoEvmScheme:
    """EVM facilitator implementation for the Upto payment scheme.

    Attributes:
        scheme: The scheme identifier ("upto").
        caip_family: The CAIP family pattern ("eip155:*").
    """

    scheme = SCHEME_UPTO
    caip_family = "eip155:*"

    def __init__(
        self,
        signer: FacilitatorEvmSigner,
        config: UptoEvmSchemeConfig | None = None,
        pending_store: PendingSettlementStore | None = None,
    ):
        self._signer = signer
        self._config = config or UptoEvmSchemeConfig()
        self._pending_store: PendingSettlementStore = (
            pending_store or InMemoryPendingSettlementStore()
        )

    def get_extra(self, network: Network) -> dict[str, Any] | None:
        """Return one signer under both method-specific settlement address keys."""
        addresses = self._signer.get_addresses()
        if not addresses:
            return None
        address = random.choice(addresses)
        return {"facilitatorAddress": address, "settlerAddress": address}

    def get_signers(self, network: Network) -> list[str]:
        return self._signer.get_addresses()

    def verify(
        self,
        payload: PaymentPayload,
        requirements: PaymentRequirements,
        context=None,
    ) -> VerifyResponse:
        if is_upto_eip3009_payload(payload.payload):
            eip3009_payload = UptoEIP3009Payload.from_dict(payload.payload)
            return verify_upto_eip3009(
                self._signer, payload, requirements, eip3009_payload, simulate=True
            )
        if not is_upto_permit2_payload(payload.payload):
            return VerifyResponse(is_valid=False, invalid_reason=ERR_UPTO_INVALID_PAYLOAD, payer="")
        return verify_upto_permit2(self._signer, payload, requirements, context, simulate=True)

    def settle(
        self,
        payload: PaymentPayload,
        requirements: PaymentRequirements,
        context=None,
    ) -> SettleResponse:
        if is_upto_eip3009_payload(payload.payload):
            eip3009_payload = UptoEIP3009Payload.from_dict(payload.payload)
            return settle_upto_eip3009(
                self._signer,
                payload,
                requirements,
                eip3009_payload,
                context,
                pending_store=self._pending_store,
            )
        if not is_upto_permit2_payload(payload.payload):
            return SettleResponse(
                success=False,
                error_reason=ERR_UPTO_INVALID_PAYLOAD,
                network=str(payload.accepted.network),
                payer="",
                transaction="",
            )
        return settle_upto_permit2(
            self._signer,
            payload,
            requirements,
            context,
            simulate_in_settle=self._config.simulate_in_settle,
            pending_store=self._pending_store,
        )
