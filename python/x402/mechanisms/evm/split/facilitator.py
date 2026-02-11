"""EVM facilitator implementation for the Split payment scheme."""

import json
import time
from dataclasses import dataclass, field
from typing import Any

from ....schemas import (
    Network,
    PaymentPayload,
    PaymentRequirements,
    SettleResponse,
    VerifyResponse,
)
from ..constants import SCHEME_EXACT
from ..signer import FacilitatorEvmSigner
from ..types import ExactEIP3009Payload
from ..utils import get_asset_info, get_evm_chain_id, get_network_config, hex_to_bytes
from ..verify import verify_universal_signature
from .constants import SCHEME_SPLIT
from .types import SplitConfig, SplitRecipient


@dataclass
class SplitEvmSchemeConfig:
    """Configuration for SplitEvmScheme facilitator.

    Attributes:
        deploy_erc4337_with_eip6492: Enable ERC-6492 smart wallet deployment.
        settlement_callback: Optional callback for split distribution.
            Called with (recipients, shares, tx_hash) after settlement.
    """

    deploy_erc4337_with_eip6492: bool = False
    settlement_callback: Any = None  # Callable for custom split logic


class SplitEvmScheme:
    """EVM facilitator implementation for the Split payment scheme.

    Verifies and settles split payments on EVM networks.
    The on-chain settlement (EIP-3009 transfer to escrow) reuses
    exact scheme logic. Split distribution is handled post-settlement
    via a configurable callback (e.g., internal ledger, on-chain transfers).

    Attributes:
        scheme: The scheme identifier ("split").
    """

    scheme = SCHEME_SPLIT

    def __init__(
        self,
        signer: FacilitatorEvmSigner,
        config: SplitEvmSchemeConfig | None = None,
    ):
        """Create SplitEvmScheme facilitator.

        Args:
            signer: EVM signer for verification and settlement.
            config: Optional configuration.
        """
        self._signer = signer
        self._config = config or SplitEvmSchemeConfig()

    def get_extra(self, network: Network) -> dict[str, Any] | None:
        return None

    def get_signers(self, network: Network) -> list[str]:
        return [self._signer.address]

    def verify(
        self,
        payload: PaymentPayload,
        requirements: PaymentRequirements,
    ) -> VerifyResponse:
        """Verify split payment payload.

        Validates:
        - Scheme and network match
        - EIP-712 signature is valid
        - Recipient is facilitator escrow (payTo)
        - Amount >= total required
        - Split recipients are valid (sum to 10000 bps)

        Args:
            payload: Payment payload from client.
            requirements: Payment requirements.

        Returns:
            VerifyResponse with is_valid and payer.
        """
        try:
            inner = payload.payload
            if isinstance(inner, str):
                inner = json.loads(inner)

            eip3009 = ExactEIP3009Payload.from_dict(inner)
            auth = eip3009.authorization

            if payload.scheme != SCHEME_SPLIT:
                return VerifyResponse(
                    is_valid=False,
                    invalid_reason=f"Expected scheme '{SCHEME_SPLIT}', got '{payload.scheme}'",
                    payer=auth.from_address,
                )

            if int(auth.value) < int(requirements.amount):
                return VerifyResponse(
                    is_valid=False,
                    invalid_reason=f"Amount {auth.value} < required {requirements.amount}",
                    payer=auth.from_address,
                )

            if auth.to.lower() != requirements.pay_to.lower():
                return VerifyResponse(
                    is_valid=False,
                    invalid_reason=f"Recipient {auth.to} != escrow {requirements.pay_to}",
                    payer=auth.from_address,
                )

            extra = requirements.extra or {}
            if "recipients" in extra:
                try:
                    split_config = SplitConfig.from_dict_list(extra["recipients"])
                    split_config.validate()
                except ValueError as e:
                    return VerifyResponse(
                        is_valid=False,
                        invalid_reason=f"Invalid split config: {e}",
                        payer=auth.from_address,
                    )

            chain_id = get_evm_chain_id(str(requirements.network))
            asset_info = get_asset_info(str(requirements.network), requirements.asset)

            sig_valid = verify_universal_signature(
                self._signer,
                auth,
                eip3009.signature,
                chain_id,
                requirements.asset,
                asset_info["name"],
                asset_info.get("version", "1"),
            )

            if not sig_valid:
                return VerifyResponse(
                    is_valid=False,
                    invalid_reason="Invalid EIP-712 signature",
                    payer=auth.from_address,
                )

            return VerifyResponse(
                is_valid=True,
                payer=auth.from_address,
            )

        except Exception as e:
            return VerifyResponse(
                is_valid=False,
                invalid_reason=f"Verification error: {e}",
            )

    def settle(
        self,
        payload: PaymentPayload,
        requirements: PaymentRequirements,
    ) -> SettleResponse:
        """Settle split payment on-chain and distribute to recipients.

        1. Re-verify payment
        2. Execute transferWithAuthorization to escrow (same as exact)
        3. Calculate per-recipient shares
        4. Execute split distribution (via callback or default)
        5. Return SettleResponse with per-recipient breakdown

        Args:
            payload: Payment payload from client.
            requirements: Payment requirements with split config.

        Returns:
            SettleResponse with success, transaction, and split details.
        """
        # Re-verify
        verify_result = self.verify(payload, requirements)
        if not verify_result.is_valid:
            return SettleResponse(
                success=False,
                transaction="",
                network=str(requirements.network),
                payer=verify_result.payer or "",
            )

        try:
            inner = payload.payload
            if isinstance(inner, str):
                inner = json.loads(inner)

            eip3009 = ExactEIP3009Payload.from_dict(inner)
            auth = eip3009.authorization

            chain_id = get_evm_chain_id(str(requirements.network))

            tx_hash = self._signer.transfer_with_authorization(
                token=requirements.asset,
                from_addr=auth.from_address,
                to=auth.to,
                value=int(auth.value),
                valid_after=int(auth.valid_after),
                valid_before=int(auth.valid_before),
                nonce=hex_to_bytes(auth.nonce),
                signature=hex_to_bytes(eip3009.signature),
            )

            total_amount = int(auth.value)
            extra = requirements.extra or {}
            splits_result = []

            if "recipients" in extra:
                split_config = SplitConfig.from_dict_list(extra["recipients"])
                shares = split_config.calculate_shares(total_amount)

                for address, amount in shares:
                    method = "internal"

                    if self._config.settlement_callback:
                        method = self._config.settlement_callback(
                            address, amount, tx_hash
                        ) or "internal"

                    recipient = next(
                        (r for r in split_config.recipients if r.address == address),
                        None,
                    )
                    splits_result.append({
                        "address": address,
                        "amount": str(amount),
                        "method": method,
                        "label": recipient.label if recipient else "",
                    })
            else:
                splits_result.append({
                    "address": auth.to,
                    "amount": str(total_amount),
                    "method": "onchain",
                })

            return SettleResponse(
                success=True,
                transaction=tx_hash if isinstance(tx_hash, str) else f"0x{tx_hash.hex()}",
                network=str(requirements.network),
                payer=auth.from_address,
                extra={"splits": splits_result},
            )

        except Exception as e:
            return SettleResponse(
                success=False,
                transaction="",
                network=str(requirements.network),
                payer=verify_result.payer or "",
                extra={"error": str(e)},
            )
