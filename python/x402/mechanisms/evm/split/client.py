"""EVM client implementation for the Split payment scheme."""

from datetime import timedelta
from typing import Any

from ....schemas import PaymentRequirements
from ..eip712 import build_typed_data_for_signing
from ..signer import ClientEvmSigner
from ..types import ExactEIP3009Authorization, ExactEIP3009Payload, TypedDataField
from ..utils import (
    create_nonce,
    create_validity_window,
    get_asset_info,
    get_evm_chain_id,
)
from .constants import SCHEME_SPLIT


class SplitEvmScheme:
    """EVM client implementation for the Split payment scheme.

    From the client's perspective, a split payment is identical to an exact
    payment — the client signs a single EIP-3009 authorization to the
    facilitator's escrow address. The facilitator handles distribution.

    Implements SchemeNetworkClient protocol.
    """

    scheme = SCHEME_SPLIT

    def __init__(self, signer: ClientEvmSigner):
        """Create SplitEvmScheme.

        Args:
            signer: EVM signer for payment authorizations.
        """
        self._signer = signer

    def create_payment_payload(
        self,
        requirements: PaymentRequirements,
    ) -> dict[str, Any]:
        """Create signed EIP-3009 inner payload.

        The payload is identical to exact — client pays the total amount
        to the facilitator's escrow address (requirements.pay_to).
        The split is handled server-side by the facilitator.

        Args:
            requirements: Payment requirements (includes recipients in extra).

        Returns:
            Inner payload dict (authorization + signature).
        """
        nonce = create_nonce()
        valid_after, valid_before = create_validity_window(
            timedelta(seconds=requirements.max_timeout_seconds or 3600)
        )

        authorization = ExactEIP3009Authorization(
            from_address=self._signer.address,
            to=requirements.pay_to,
            value=requirements.amount,
            valid_after=str(valid_after),
            valid_before=str(valid_before),
            nonce=nonce,
        )

        signature = self._sign_authorization(authorization, requirements)

        payload = ExactEIP3009Payload(authorization=authorization, signature=signature)

        return payload.to_dict()

    def _sign_authorization(
        self,
        authorization: ExactEIP3009Authorization,
        requirements: PaymentRequirements,
    ) -> str:
        """Sign EIP-3009 authorization using EIP-712.

        Same as exact scheme — the split is transparent to the signer.

        Args:
            authorization: The authorization to sign.
            requirements: Payment requirements with EIP-712 domain info.

        Returns:
            Hex-encoded signature with 0x prefix.
        """
        chain_id = get_evm_chain_id(str(requirements.network))

        extra = requirements.extra or {}
        if "name" not in extra:
            try:
                asset_info = get_asset_info(str(requirements.network), requirements.asset)
                extra["name"] = asset_info["name"]
                extra["version"] = asset_info.get("version", "1")
            except ValueError:
                raise ValueError(
                    "EIP-712 domain parameters (name, version) required in extra"
                ) from None

        name = extra["name"]
        version = extra.get("version", "1")

        domain, types, primary_type, message = build_typed_data_for_signing(
            authorization,
            chain_id,
            requirements.asset,
            name,
            version,
        )

        typed_fields: dict[str, list[TypedDataField]] = {}
        for type_name, fields in types.items():
            typed_fields[type_name] = [
                TypedDataField(name=f["name"], type=f["type"]) for f in fields
            ]

        sig_bytes = self._signer.sign_typed_data(domain, typed_fields, primary_type, message)

        return "0x" + sig_bytes.hex()
