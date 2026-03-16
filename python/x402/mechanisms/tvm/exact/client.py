"""TVM client implementation for the Exact payment scheme."""

from __future__ import annotations

import secrets
from typing import Any

try:
    import httpx
except ImportError as e:
    raise ImportError(
        "TVM exact client requires httpx. Install with: pip install httpx"
    ) from e

from ..constants import SCHEME_EXACT
from ..signer import ClientTvmSigner
from ..utils import normalize_address


class ExactTvmScheme:
    """TVM client for the 'exact' payment scheme.

    Implements the SchemeNetworkClient protocol from x402 SDK.
    Uses self-relay architecture: calls facilitator /prepare to get
    signing data, signs locally, returns payload.

    Attributes:
        scheme: The scheme identifier ("exact").
    """

    scheme = SCHEME_EXACT

    def __init__(
        self,
        signer: ClientTvmSigner,
    ):
        """Initialize TVM client scheme.

        Args:
            signer: TVM signer for payment authorizations.
        """
        self._signer = signer

    async def create_payment_payload(
        self,
        requirements: dict[str, Any],
    ) -> dict[str, Any]:
        """Create a signed TVM payment payload.

        Self-relay flow:
        1. POST to facilitatorUrl/prepare with wallet info and payment requirements
        2. Facilitator returns seqno, validUntil, messages to sign
        3. Sign the W5 transfer locally
        4. Return the payload for x402 header

        Args:
            requirements: PaymentRequirements dict with scheme, network, asset,
                         amount, pay_to, extra.facilitatorUrl, etc.

        Returns:
            Inner payload dict for x402 PaymentPayload.
        """
        pay_to = str(requirements["pay_to"])
        asset = str(requirements["asset"])
        amount = str(requirements["amount"])
        wallet_address = normalize_address(self._signer.address)

        # Get facilitator URL from requirements extra
        extra = requirements.get("extra", {})
        facilitator_url = extra.get("facilitatorUrl", "")
        if not facilitator_url:
            raise ValueError("Missing facilitatorUrl in payment requirements extra")

        nonce = secrets.token_hex(16)

        # Call facilitator /prepare
        async with httpx.AsyncClient() as client:
            resp = await client.post(
                f"{facilitator_url.rstrip('/')}/prepare",
                json={
                    "walletAddress": wallet_address,
                    "walletPublicKey": self._signer.public_key,
                    "paymentRequirements": requirements,
                },
            )
            resp.raise_for_status()
            prepare_data = resp.json()

        seqno = prepare_data["seqno"]
        valid_until = prepare_data["validUntil"]
        messages = prepare_data["messages"]

        # Sign the W5 transfer with messages from facilitator
        settlement_boc = await self._signer.sign_transfer(
            seqno=seqno,
            valid_until=valid_until,
            messages=messages,
        )

        return {
            "from": wallet_address,
            "to": pay_to,
            "tokenMaster": asset,
            "amount": amount,
            "validUntil": valid_until,
            "nonce": nonce,
            "settlementBoc": settlement_boc,
            "walletPublicKey": self._signer.public_key,
        }
