"""Stellar facilitator implementation for the Exact payment scheme."""

import math
from typing import Any

from stellar_sdk import (
    Address,
    Keypair,
    SorobanServer,
    TransactionBuilder,
    TransactionEnvelope,
)
from stellar_sdk.xdr import (
    HostFunctionType,
    OperationType,
    SCValType,
    SorobanCredentialsType,
)

from ....schemas import (
    Network,
    PaymentPayload,
    PaymentRequirements,
    SettleResponse,
    VerifyResponse,
)
from ..constants import (
    DEFAULT_ESTIMATED_LEDGER_SECONDS,
    DEFAULT_MAX_TRANSACTION_FEE_STROOPS,
    DEFAULT_TIMEOUT_SECONDS,
    SUPPORTED_X402_VERSION,
)
from ..shared import gather_auth_entry_signature_status, stellar_address_from_sc_address
from ..types import ExactStellarPayloadV2
from ..utils import (
    get_network_passphrase,
    get_rpc_client,
    is_stellar_network,
    calculate_max_ledger,
)
from .constants import SCHEME_EXACT


def _invalid(reason: str, payer: str | None = None) -> VerifyResponse:
    return VerifyResponse(is_valid=False, invalid_reason=reason, payer=payer)


def _valid(payer: str) -> VerifyResponse:
    return VerifyResponse(is_valid=True, payer=payer)


class ExactStellarScheme:
    """Stellar facilitator for the Exact payment scheme.

    Verifies and settles Soroban token transfers following the x402
    exact scheme specification for Stellar.
    """

    scheme = SCHEME_EXACT

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

    def get_extra(self, network: Network) -> dict[str, Any] | None:
        return {"areFeesSponsored": self._are_fees_sponsored}

    def get_signers(self, network: Network) -> list[str]:
        return [self._keypair.public_key]

    async def verify(
        self,
        payload: PaymentPayload,
        requirements: PaymentRequirements,
    ) -> VerifyResponse:
        from_address: str | None = None

        try:
            # 1. Protocol validation
            if payload.x402_version != SUPPORTED_X402_VERSION:
                return _invalid("invalid_x402_version")

            if payload.scheme != SCHEME_EXACT or requirements.scheme != SCHEME_EXACT:
                return _invalid("unsupported_scheme")

            network = str(requirements.network)
            if not is_stellar_network(network):
                return _invalid("invalid_network")

            network_passphrase = get_network_passphrase(network)
            server = get_rpc_client(network, self._rpc_url)

            # 2. Parse and decode transaction
            stellar_payload = self._parse_payload(payload.payload)
            if stellar_payload is None:
                return _invalid("invalid_stellar_payload_malformed")

            try:
                envelope = TransactionEnvelope.from_xdr(
                    stellar_payload.transaction, network_passphrase
                )
            except Exception:
                return _invalid("invalid_stellar_payload_malformed")

            tx = envelope.transaction

            # 3. Validate transaction structure
            if not tx.operations or len(tx.operations) != 1:
                return _invalid("invalid_stellar_payload_wrong_operation")

            operation = tx.operations[0]
            if operation.type_code() != OperationType.INVOKE_HOST_FUNCTION:
                return _invalid("invalid_stellar_payload_wrong_operation")

            # 4. Facilitator safety — source accounts
            tx_source = self._get_tx_source(tx)
            op_source = self._get_op_source(operation)

            if tx_source == self._keypair.public_key:
                return _invalid("invalid_stellar_payload_unsafe_tx_source")
            if op_source and op_source == self._keypair.public_key:
                return _invalid("invalid_stellar_payload_unsafe_op_source")

            # 5. Extract contract invocation details
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

            # 6. Validate transfer arguments
            from_address = self._sc_val_to_address(args[0])
            to_address = self._sc_val_to_address(args[1])
            amount = self._sc_val_to_i128(args[2])

            if from_address is None or to_address is None or amount is None:
                return _invalid("invalid_stellar_payload_bad_args", from_address)

            if from_address == self._keypair.public_key:
                return _invalid("invalid_stellar_payload_facilitator_is_payer", from_address)

            if to_address != str(requirements.pay_to):
                return _invalid("invalid_stellar_payload_wrong_recipient", from_address)

            expected_amount = int(requirements.amount)
            if amount != expected_amount:
                return _invalid("invalid_stellar_payload_wrong_amount", from_address)

            # 7. Re-simulate against current ledger
            sim_response = server.simulate_transaction(envelope)
            if sim_response.error:
                return _invalid("invalid_stellar_payload_simulation_failed", from_address)

            # 8. Validate fees
            client_fee = int(tx.fee)
            min_resource_fee = int(sim_response.min_resource_fee or 0)

            if client_fee < min_resource_fee:
                return _invalid("invalid_stellar_payload_fee_below_minimum", from_address)

            if client_fee > self._max_fee_stroops:
                return _invalid("invalid_stellar_payload_fee_exceeds_maximum", from_address)

            # 9. Validate auth entries
            auth_status = gather_auth_entry_signature_status(envelope)

            if self._keypair.public_key in auth_status.already_signed:
                return _invalid("invalid_stellar_payload_facilitator_in_auth", from_address)
            if self._keypair.public_key in auth_status.pending_signature:
                return _invalid("invalid_stellar_payload_facilitator_in_auth", from_address)

            if from_address not in auth_status.already_signed:
                return _invalid("invalid_stellar_payload_missing_signature", from_address)

            if auth_status.pending_signature:
                return _invalid("invalid_stellar_payload_missing_signatures", from_address)

            # 10. Validate auth entry expiration
            max_timeout = int(requirements.max_timeout_seconds or DEFAULT_TIMEOUT_SECONDS)
            latest = server.get_latest_ledger()
            max_ledger = calculate_max_ledger(
                latest.sequence, max_timeout, DEFAULT_ESTIMATED_LEDGER_SECONDS
            )

            expiration_valid = self._validate_auth_expiration(
                invoke_op, max_ledger
            )
            if not expiration_valid:
                return _invalid("invalid_stellar_payload_auth_expired", from_address)

            return _valid(from_address)

        except Exception as e:
            return _invalid(f"unexpected_verify_error: {e}", from_address)

    async def settle(
        self,
        payload: PaymentPayload,
        requirements: PaymentRequirements,
    ) -> SettleResponse:
        network = str(requirements.network)
        payer: str | None = None

        try:
            # Step 1: Verify first
            verify_result = await self.verify(payload, requirements)
            if not verify_result.is_valid:
                return SettleResponse(
                    success=False,
                    transaction="",
                    network=network,
                    payer=verify_result.payer or "",
                    extra={"error": verify_result.invalid_reason},
                )

            payer = verify_result.payer
            network_passphrase = get_network_passphrase(network)
            server = get_rpc_client(network, self._rpc_url)

            # Step 2: Parse transaction
            stellar_payload = self._parse_payload(payload.payload)
            envelope = TransactionEnvelope.from_xdr(
                stellar_payload.transaction, network_passphrase
            )
            tx = envelope.transaction
            operation = tx.operations[0]
            invoke_op = operation.body.invoke_host_function_op

            # Step 3: Rebuild transaction with facilitator as source
            facilitator_account = server.load_account(self._keypair.public_key)

            client_fee = int(tx.fee)
            fee = min(client_fee, self._max_fee_stroops)
            max_timeout = int(requirements.max_timeout_seconds or DEFAULT_TIMEOUT_SECONDS)

            from stellar_sdk import InvokeHostFunction

            rebuilt = TransactionBuilder(
                source_account=facilitator_account,
                network_passphrase=network_passphrase,
                base_fee=fee,
            )
            rebuilt.set_timeout(max_timeout)

            # Copy the invoke operation with auth entries
            rebuilt.append_operation(
                InvokeHostFunction(
                    host_function=invoke_op.host_function,
                    auth=invoke_op.auth,
                )
            )

            rebuilt_tx = rebuilt.build()

            # Simulate the rebuilt tx
            sim_response = server.simulate_transaction(rebuilt_tx)
            if sim_response.error:
                return SettleResponse(
                    success=False,
                    transaction="",
                    network=network,
                    payer=payer or "",
                    extra={"error": f"Simulation failed: {sim_response.error}"},
                )

            # Prepare with simulation results
            prepared_tx = server.prepare_transaction(rebuilt_tx, sim_response)

            # Step 4: Sign with facilitator key
            prepared_tx.sign(self._keypair)

            # Step 5: Submit
            send_result = server.send_transaction(prepared_tx)

            if send_result.status != "PENDING":
                return SettleResponse(
                    success=False,
                    transaction="",
                    network=network,
                    payer=payer or "",
                    extra={"error": f"Submission failed: {send_result.status}"},
                )

            tx_hash = send_result.hash

            # Step 6: Poll for confirmation
            import time

            poll_interval = 2
            max_polls = max_timeout // poll_interval
            for _ in range(max_polls):
                time.sleep(poll_interval)
                result = server.get_transaction(tx_hash)
                if result.status == "SUCCESS":
                    return SettleResponse(
                        success=True,
                        transaction=tx_hash,
                        network=network,
                        payer=payer or "",
                    )
                elif result.status == "FAILED":
                    return SettleResponse(
                        success=False,
                        transaction=tx_hash,
                        network=network,
                        payer=payer or "",
                        extra={"error": "Transaction failed on-chain"},
                    )

            return SettleResponse(
                success=False,
                transaction=tx_hash,
                network=network,
                payer=payer or "",
                extra={"error": "Transaction timed out"},
            )

        except Exception as e:
            return SettleResponse(
                success=False,
                transaction="",
                network=network,
                payer=payer or "",
                extra={"error": str(e)},
            )

    # --- Internal helpers ---

    def _parse_payload(self, payload: Any) -> ExactStellarPayloadV2 | None:
        try:
            if isinstance(payload, dict) and "transaction" in payload:
                return ExactStellarPayloadV2.from_dict(payload)
            if isinstance(payload, str):
                return ExactStellarPayloadV2(transaction=payload)
            return None
        except Exception:
            return None

    def _get_tx_source(self, tx: Any) -> str | None:
        try:
            return stellar_address_from_sc_address(tx.source_account)
        except Exception:
            try:
                source_xdr = tx.source_account
                if hasattr(source_xdr, "account_id"):
                    pk = source_xdr.account_id.ed25519.uint256
                    return Keypair.from_raw_ed25519_public_key(pk).public_key
                return None
            except Exception:
                return None

    def _get_op_source(self, operation: Any) -> str | None:
        try:
            if operation.source_account:
                return stellar_address_from_sc_address(operation.source_account)
            return None
        except Exception:
            return None

    def _sc_val_to_address(self, sc_val: Any) -> str | None:
        try:
            if sc_val.type == SCValType.SCV_ADDRESS:
                return stellar_address_from_sc_address(sc_val.address)
            return None
        except Exception:
            return None

    def _sc_val_to_i128(self, sc_val: Any) -> int | None:
        try:
            if sc_val.type == SCValType.SCV_I128:
                parts = sc_val.i128
                return (parts.hi.int64 << 64) | parts.lo.uint64
            return None
        except Exception:
            return None

    def _validate_auth_expiration(self, invoke_op: Any, max_ledger: int) -> bool:
        try:
            auth_entries = invoke_op.auth or []
            for entry in auth_entries:
                if entry.credentials.type == SorobanCredentialsType.SOROBAN_CREDENTIALS_ADDRESS:
                    expiration = entry.credentials.address.signature_expiration_ledger
                    if hasattr(expiration, "uint32"):
                        exp_val = expiration.uint32
                    else:
                        exp_val = int(expiration)
                    if exp_val > max_ledger:
                        return False
            return True
        except Exception:
            return False
