"""Exact scheme client implementation for Hypercore L1."""

import time
from typing import Any

from x402.schemas import (
    PaymentRequirements,
)

from ..constants import NETWORK_CONFIGS, SCHEME_EXACT


class ExactHypercoreScheme:
    """Client scheme for Hypercore L1 exact payments."""

    def __init__(self, signer: Any):
        """Initialize client with a Hyperliquid signer.

        Args:
            signer: Hyperliquid signer with sign_send_asset method.
        """
        self.signer = signer
        self.scheme = SCHEME_EXACT

    def create_payment_payload(
        self, requirements: PaymentRequirements
    ) -> dict[str, Any]:
        """Create a payment payload for Hypercore L1.

        Args:
            requirements: Payment requirements from server.

        Returns:
            Inner payload dict with signed SendAsset action.
        """
        nonce = int(time.time() * 1000)

        network = str(requirements.network)
        config = NETWORK_CONFIGS.get(network)
        if not config:
            raise ValueError(f"Unsupported network: {network}")

        extra = requirements.extra or {}
        is_mainnet = extra.get("isMainnet", True)
        hyperliquid_chain = "Mainnet" if is_mainnet else "Testnet"

        amount_int = int(requirements.amount)
        decimals = config["default_asset"]["decimals"]
        amount_usd = f"{(amount_int / (10 ** decimals)):.{decimals}f}"

        action = {
            "type": "sendAsset",
            "hyperliquidChain": hyperliquid_chain,
            "signatureChainId": "0x3e7",
            "destination": requirements.pay_to.lower(),
            "sourceDex": "spot",
            "destinationDex": "spot",
            "token": requirements.asset,
            "amount": amount_usd,
            "fromSubAccount": "",
            "nonce": nonce,
        }

        signature = self.signer.sign_send_asset(action)

        return {
            "action": action,
            "signature": signature,
            "nonce": nonce,
        }
