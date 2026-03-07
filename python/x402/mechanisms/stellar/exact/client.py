"""Stellar client implementation for the Exact payment scheme."""

import math
from typing import Any

from stellar_sdk import (
    Keypair,
    Network,
    SorobanServer,
    TransactionBuilder,
    scval,
)
from stellar_sdk.xdr import TransactionEnvelope

from ..constants import (
    DEFAULT_ESTIMATED_LEDGER_SECONDS,
    DEFAULT_TIMEOUT_SECONDS,
    SUPPORTED_X402_VERSION,
)
from ..types import ExactStellarPayloadV2
from ..utils import (
    get_network_passphrase,
    get_rpc_client,
    get_rpc_url,
    is_stellar_network,
    validate_stellar_asset_address,
    validate_stellar_destination_address,
)
from .constants import SCHEME_EXACT


class ExactStellarClient:
    """Stellar client for the Exact payment scheme.

    Builds a Soroban transfer() invocation, signs auth entries,
    and serializes to base64 XDR for the facilitator.
    """

    def __init__(self, keypair: Keypair, rpc_url: str | None = None):
        self._keypair = keypair
        self._rpc_url = rpc_url

    @property
    def address(self) -> str:
        return self._keypair.public_key

    async def create_payment_payload(
        self,
        x402_version: int,
        network: str,
        asset: str,
        pay_to: str,
        amount: str,
        max_timeout_seconds: int = DEFAULT_TIMEOUT_SECONDS,
        extra: dict[str, Any] | None = None,
    ) -> dict[str, Any]:
        """Create a signed payment payload for the Exact scheme.

        Builds a transfer(from, to, amount) invocation on the token contract,
        signs the auth entries with the client's keypair, and returns the
        base64-encoded transaction XDR.
        """
        if x402_version != SUPPORTED_X402_VERSION:
            raise ValueError(f"Unsupported x402 version: {x402_version}")

        if not is_stellar_network(network):
            raise ValueError(f"Not a Stellar network: {network}")

        if not validate_stellar_asset_address(asset):
            raise ValueError(f"Invalid Stellar asset address: {asset}")

        if not validate_stellar_destination_address(pay_to):
            raise ValueError(f"Invalid Stellar destination: {pay_to}")

        extra = extra or {}
        if not extra.get("areFeesSponsored", False):
            raise ValueError("Exact scheme requires areFeesSponsored to be true")

        network_passphrase = get_network_passphrase(network)
        server = get_rpc_client(network, self._rpc_url)

        # Get current ledger for expiration
        latest = server.get_latest_ledger()
        current_ledger = latest.sequence
        max_ledger = current_ledger + math.ceil(
            max_timeout_seconds / DEFAULT_ESTIMATED_LEDGER_SECONDS
        )

        # Build the SEP-41 transfer invocation
        source_account = server.load_account(self._keypair.public_key)
        builder = TransactionBuilder(
            source_account=source_account,
            network_passphrase=network_passphrase,
            base_fee=10_000,
        )
        builder.set_timeout(max_timeout_seconds)
        builder.append_invoke_contract_function_op(
            contract_id=asset,
            function_name="transfer",
            parameters=[
                scval.to_address(self._keypair.public_key),
                scval.to_address(pay_to),
                scval.to_int128(int(amount)),
            ],
        )

        tx = builder.build()

        # Simulate to get auth entries
        sim_response = server.simulate_transaction(tx)
        if sim_response.error:
            raise RuntimeError(f"Simulation failed: {sim_response.error}")

        # Assemble with simulation results (adds auth entries + resource info)
        from stellar_sdk import SorobanServer as _SorobanServer

        tx = _SorobanServer.prepare_transaction(tx, sim_response)

        # Sign auth entries with client keypair
        tx.sign(self._keypair)

        # Return the payload
        payload = ExactStellarPayloadV2(transaction=tx.to_xdr())

        return {
            "x402Version": x402_version,
            "scheme": SCHEME_EXACT,
            "network": network,
            "payload": payload.to_dict(),
        }
