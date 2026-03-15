"""TVM client implementation for the Exact payment scheme."""

from __future__ import annotations

import secrets
import time
from typing import Any

from ..constants import SCHEME_EXACT
from ..signer import ClientTvmSigner, FacilitatorTvmSigner
from ..utils import normalize_address


class ExactTvmScheme:
    """TVM client for the 'exact' payment scheme.

    Implements the SchemeNetworkClient protocol from x402 SDK.
    Creates payment payloads using TONAPI gasless flow.

    Attributes:
        scheme: The scheme identifier ("exact").
    """

    scheme = SCHEME_EXACT

    def __init__(
        self,
        signer: ClientTvmSigner,
        provider: FacilitatorTvmSigner,
    ):
        """Initialize TVM client scheme.

        Args:
            signer: TVM signer for payment authorizations.
            provider: TVM provider for seqno/jetton wallet lookup and gasless estimation.
        """
        self._signer = signer
        self._provider = provider

    async def create_payment_payload(
        self,
        requirements: dict[str, Any],
    ) -> dict[str, Any]:
        """Create a signed TVM payment payload.

        This orchestrates the full gasless payment flow:
        1. Build jetton transfer message
        2. Get gasless estimate from TONAPI
        3. Sign the W5 transfer with all estimated messages
        4. Return the payload for x402 header

        Args:
            requirements: PaymentRequirements dict with scheme, network, asset,
                         amount, pay_to, etc.

        Returns:
            Inner payload dict for x402 PaymentPayload.
        """
        pay_to = str(requirements["pay_to"])
        asset = str(requirements["asset"])
        amount = str(requirements["amount"])
        wallet_address = normalize_address(self._signer.address)

        # Get current seqno
        seqno = await self._provider.get_seqno(wallet_address)

        # Resolve sender's jetton wallet
        jetton_wallet = await self._provider.get_jetton_wallet(asset, wallet_address)

        valid_until = int(time.time()) + 300  # 5 min validity
        nonce = secrets.token_hex(16)

        # Get gasless estimate
        estimate = await self._provider.gasless_estimate(
            wallet_address=wallet_address,
            wallet_public_key=self._signer.public_key,
            jetton_master=asset,
            messages=[{
                "address": jetton_wallet,
                "amount": "0",
                "destination": pay_to,
                "jetton_amount": amount,
            }],
        )

        # Sign the complete W5 transfer
        estimated_messages = estimate.get("messages", [])
        settlement_boc = await self._signer.sign_transfer(
            seqno=seqno,
            valid_until=valid_until,
            messages=estimated_messages,
        )

        commission = str(estimate.get("commission", "0"))

        return {
            "from": wallet_address,
            "to": pay_to,
            "tokenMaster": asset,
            "amount": amount,
            "validUntil": valid_until,
            "nonce": nonce,
            "signedMessages": estimated_messages,
            "commission": commission,
            "settlementBoc": settlement_boc,
            "walletPublicKey": self._signer.public_key,
        }
