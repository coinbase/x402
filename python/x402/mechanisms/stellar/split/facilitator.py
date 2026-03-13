"""Stellar facilitator implementation for the Split payment scheme."""

import time
from typing import Any

from stellar_sdk import Keypair

from ....schemas import (
    Network,
    PaymentPayload,
    PaymentRequirements,
    SettleResponse,
    VerifyResponse,
)
from ..constants import (
    DEFAULT_MAX_TRANSACTION_FEE_STROOPS,
    DEFAULT_TIMEOUT_SECONDS,
    SUPPORTED_X402_VERSION,
)
from ..exact.facilitator import ExactStellarScheme
from ..utils import (
    get_network_passphrase,
    get_rpc_client,
    is_stellar_network,
    validate_stellar_destination_address,
)
from .constants import SCHEME_SPLIT
from .types import StellarSplitConfig, StellarSplitRecipient, calculate_split_amounts


def _invalid(reason: str, payer: str | None = None) -> VerifyResponse:
    return VerifyResponse(is_valid=False, invalid_reason=reason, payer=payer)


class SplitStellarScheme:
    """Stellar facilitator for the Split payment scheme.

    Extends the exact scheme by adding recipient validation and
    post-settlement distribution logic.
    """

    scheme = SCHEME_SPLIT

    def __init__(
        self,
        keypair: Keypair,
        rpc_url: str | None = None,
        are_fees_sponsored: bool = True,
        max_fee_stroops: int = DEFAULT_MAX_TRANSACTION_FEE_STROOPS,
    ):
        self._keypair = keypair
        self._rpc_url = rpc_url
        self._are_fees_sponsored = are_fees_sponsored
        self._max_fee_stroops = max_fee_stroops

        # Reuse exact scheme for core verify/settle
        self._exact = ExactStellarScheme(
            keypair=keypair,
            rpc_url=rpc_url,
            are_fees_sponsored=are_fees_sponsored,
            max_fee_stroops=max_fee_stroops,
        )

    def get_extra(self, network: Network) -> dict[str, Any] | None:
        return {"areFeesSponsored": self._are_fees_sponsored}

    def get_signers(self, network: Network) -> list[str]:
        return [self._keypair.public_key]

    async def verify(
        self,
        payload: PaymentPayload,
        requirements: PaymentRequirements,
    ) -> VerifyResponse:
        """Verify a split payment.

        Validates the split configuration (recipients, bps) and
        delegates core transaction verification to the exact scheme.
        """
        # 1. Validate scheme
        if payload.scheme != SCHEME_SPLIT or requirements.scheme != SCHEME_SPLIT:
            return _invalid("unsupported_scheme")

        # 2. Validate split config from requirements
        split_config = self._parse_split_config(requirements)
        if split_config is None:
            return _invalid("invalid_split_config")

        try:
            split_config.validate()
        except ValueError as e:
            return _invalid(f"invalid_split_config: {e}")

        # 3. Validate all recipient addresses
        for recipient in split_config.recipients:
            if not validate_stellar_destination_address(recipient.address):
                return _invalid(f"invalid_recipient_address: {recipient.address}")

        # 4. Verify the underlying transaction structure
        return await self._verify_transaction_structure(payload, requirements)

    async def _verify_transaction_structure(
        self,
        payload: PaymentPayload,
        requirements: PaymentRequirements,
    ) -> VerifyResponse:
        """Verify the underlying transaction (same checks as exact)."""
        from ..types import ExactStellarPayloadV2
        from ..shared import gather_auth_entry_signature_status, stellar_address_from_sc_address
        from ..utils import calculate_max_ledger
        from ..constants import DEFAULT_ESTIMATED_LEDGER_SECONDS
        from stellar_sdk import TransactionEnvelope, Address
        from stellar_sdk.xdr import (
            HostFunctionType,
            OperationType,
            SCValType,
            SorobanCredentialsType,
        )

        from_address: str | None = None

        try:
            if payload.x402_version != SUPPORTED_X402_VERSION:
                return _invalid("invalid_x402_version")

            network = str(requirements.network)
            if not is_stellar_network(network):
                return _invalid("invalid_network")

            network_passphrase = get_network_passphrase(network)
            server = get_rpc_client(network, self._rpc_url)

            # Parse payload
            stellar_payload = self._exact._parse_payload(payload.payload)
            if stellar_payload is None:
                return _invalid("invalid_stellar_payload_malformed")

            try:
                envelope = TransactionEnvelope.from_xdr(
                    stellar_payload.transaction, network_passphrase
                )
            except Exception:
                return _invalid("invalid_stellar_payload_malformed")

            tx = envelope.transaction

            # Validate structure
            if not tx.operations or len(tx.operations) != 1:
                return _invalid("invalid_stellar_payload_wrong_operation")

            operation = tx.operations[0]
            if operation.type_code() != OperationType.INVOKE_HOST_FUNCTION:
                return _invalid("invalid_stellar_payload_wrong_operation")

            # Safety checks
            tx_source = self._exact._get_tx_source(tx)
            if tx_source == self._keypair.public_key:
                return _invalid("invalid_stellar_payload_unsafe_tx_source")

            # Extract invocation
            invoke_op = operation.body.invoke_host_function_op
            func = invoke_op.host_function

            if func.type != HostFunctionType.HOST_FUNCTION_TYPE_INVOKE_CONTRACT:
                return _invalid("invalid_stellar_payload_wrong_operation")

            invoke_args = func.invoke_contract
            contract_address = Address.from_xdr_sc_address(
                invoke_args.contract_address
            ).address
            function_name = invoke_args.function_name.sc_symbol.decode()
            args = invoke_args.args

            if contract_address != str(requirements.asset):
                return _invalid("invalid_stellar_payload_wrong_asset")

            if function_name != "transfer" or len(args) != 3:
                return _invalid("invalid_stellar_payload_wrong_function")

            # Validate transfer args
            from_address = self._exact._sc_val_to_address(args[0])
            to_address = self._exact._sc_val_to_address(args[1])
            amount = self._exact._sc_val_to_i128(args[2])

            if from_address is None or to_address is None or amount is None:
                return _invalid("invalid_stellar_payload_bad_args", from_address)

            if from_address == self._keypair.public_key:
                return _invalid("invalid_stellar_payload_facilitator_is_payer", from_address)

            # For split: to_address should be payTo (facilitator escrow)
            if to_address != str(requirements.pay_to):
                return _invalid("invalid_stellar_payload_wrong_recipient", from_address)

            expected_amount = int(requirements.amount)
            if amount != expected_amount:
                return _invalid("invalid_stellar_payload_wrong_amount", from_address)

            # Simulate
            sim_response = server.simulate_transaction(envelope)
            if sim_response.error:
                return _invalid("invalid_stellar_payload_simulation_failed", from_address)

            # Fee validation
            client_fee = int(tx.fee)
            min_resource_fee = int(sim_response.min_resource_fee or 0)
            if client_fee < min_resource_fee:
                return _invalid("invalid_stellar_payload_fee_below_minimum", from_address)
            if client_fee > self._max_fee_stroops:
                return _invalid("invalid_stellar_payload_fee_exceeds_maximum", from_address)

            # Auth validation
            auth_status = gather_auth_entry_signature_status(envelope)
            if self._keypair.public_key in auth_status.already_signed:
                return _invalid("invalid_stellar_payload_facilitator_in_auth", from_address)
            if from_address not in auth_status.already_signed:
                return _invalid("invalid_stellar_payload_missing_signature", from_address)

            # Auth expiration
            max_timeout = int(requirements.max_timeout_seconds or DEFAULT_TIMEOUT_SECONDS)
            latest = server.get_latest_ledger()
            max_ledger = calculate_max_ledger(
                latest.sequence, max_timeout, DEFAULT_ESTIMATED_LEDGER_SECONDS
            )
            if not self._exact._validate_auth_expiration(invoke_op, max_ledger):
                return _invalid("invalid_stellar_payload_auth_expired", from_address)

            return VerifyResponse(is_valid=True, payer=from_address)

        except Exception as e:
            return _invalid(f"unexpected_verify_error: {e}", from_address)

    async def settle(
        self,
        payload: PaymentPayload,
        requirements: PaymentRequirements,
    ) -> SettleResponse:
        """Settle a split payment.

        1. Execute the transfer to escrow (same as exact)
        2. Calculate per-recipient amounts
        3. Record distribution (internal credits for now)
        """
        network = str(requirements.network)

        # Step 1: Verify
        verify_result = await self.verify(payload, requirements)
        if not verify_result.is_valid:
            return SettleResponse(
                success=False,
                transaction="",
                network=network,
                payer=verify_result.payer or "",
                extra={"error": verify_result.invalid_reason},
            )

        # Step 2: Parse split config
        split_config = self._parse_split_config(requirements)
        if split_config is None:
            return SettleResponse(
                success=False,
                transaction="",
                network=network,
                payer=verify_result.payer or "",
                extra={"error": "invalid_split_config"},
            )

        # Step 3: Execute on-chain transfer (reuse exact settle logic)
        # Temporarily adapt for exact settlement
        network_passphrase = get_network_passphrase(network)
        server = get_rpc_client(network, self._rpc_url)

        stellar_payload = self._exact._parse_payload(payload.payload)
        envelope = TransactionEnvelope.from_xdr(
            stellar_payload.transaction, network_passphrase
        )
        tx = envelope.transaction
        operation = tx.operations[0]
        invoke_op = operation.body.invoke_host_function_op

        from stellar_sdk import TransactionBuilder, InvokeHostFunction

        facilitator_account = server.load_account(self._keypair.public_key)
        client_fee = int(tx.fee)
        fee = min(client_fee, self._max_fee_stroops)
        max_timeout = int(requirements.max_timeout_seconds or DEFAULT_TIMEOUT_SECONDS)

        rebuilt = TransactionBuilder(
            source_account=facilitator_account,
            network_passphrase=network_passphrase,
            base_fee=fee,
        )
        rebuilt.set_timeout(max_timeout)
        rebuilt.append_operation(
            InvokeHostFunction(
                host_function=invoke_op.host_function,
                auth=invoke_op.auth,
            )
        )
        rebuilt_tx = rebuilt.build()

        sim_response = server.simulate_transaction(rebuilt_tx)
        if sim_response.error:
            return SettleResponse(
                success=False,
                transaction="",
                network=network,
                payer=verify_result.payer or "",
                extra={"error": f"Simulation failed: {sim_response.error}"},
            )

        prepared_tx = server.prepare_transaction(rebuilt_tx, sim_response)
        prepared_tx.sign(self._keypair)

        send_result = server.send_transaction(prepared_tx)
        if send_result.status != "PENDING":
            return SettleResponse(
                success=False,
                transaction="",
                network=network,
                payer=verify_result.payer or "",
                extra={"error": f"Submission failed: {send_result.status}"},
            )

        tx_hash = send_result.hash

        # Poll for confirmation
        poll_interval = 2
        max_polls = max_timeout // poll_interval
        settled = False
        for _ in range(max_polls):
            time.sleep(poll_interval)
            result = server.get_transaction(tx_hash)
            if result.status == "SUCCESS":
                settled = True
                break
            elif result.status == "FAILED":
                return SettleResponse(
                    success=False,
                    transaction=tx_hash,
                    network=network,
                    payer=verify_result.payer or "",
                    extra={"error": "Transaction failed on-chain"},
                )

        if not settled:
            return SettleResponse(
                success=False,
                transaction=tx_hash,
                network=network,
                payer=verify_result.payer or "",
                extra={"error": "Transaction timed out"},
            )

        # Step 4: Calculate splits and record distribution
        total_amount = int(requirements.amount)
        splits = calculate_split_amounts(total_amount, split_config.recipients)

        split_details = [
            {
                "address": addr,
                "amount": str(amt),
                "method": "internal",
            }
            for addr, amt in splits
        ]

        return SettleResponse(
            success=True,
            transaction=tx_hash,
            network=network,
            payer=verify_result.payer or "",
            extra={"splits": split_details},
        )

    def _parse_split_config(
        self, requirements: PaymentRequirements
    ) -> StellarSplitConfig | None:
        try:
            extra = requirements.extra or {}
            if isinstance(extra, dict) and "recipients" in extra:
                return StellarSplitConfig.from_dict(extra)
            return None
        except Exception:
            return None
