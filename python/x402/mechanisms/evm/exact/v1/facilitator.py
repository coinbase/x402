"""EVM facilitator implementation for Exact payment scheme (V1 legacy)."""

import json
import time
from dataclasses import dataclass
from typing import Any

from .....schemas import Network, SettleResponse, VerifyResponse
from .....schemas.v1 import PaymentPayloadV1, PaymentRequirementsV1

from ...constants import (
    ERR_INSUFFICIENT_AMOUNT,
    ERR_INSUFFICIENT_BALANCE,
    ERR_INVALID_SIGNATURE,
    ERR_MISSING_EIP712_DOMAIN,
    ERR_NETWORK_MISMATCH,
    ERR_RECIPIENT_MISMATCH,
    ERR_SMART_WALLET_DEPLOYMENT_FAILED,
    ERR_TRANSACTION_FAILED,
    ERR_UNDEPLOYED_SMART_WALLET,
    ERR_UNSUPPORTED_SCHEME,
    ERR_VALID_AFTER_FUTURE,
    ERR_VALID_BEFORE_EXPIRED,
    SCHEME_EXACT,
    TRANSFER_WITH_AUTHORIZATION_BYTES_ABI,
    TRANSFER_WITH_AUTHORIZATION_VRS_ABI,
    TX_STATUS_SUCCESS,
)
from ...eip712 import hash_eip3009_authorization
from ...erc6492 import has_deployment_info, parse_erc6492_signature
from ...signer import FacilitatorEvmSigner
from ...types import ERC6492SignatureData, ExactEIP3009Payload
from ...utils import bytes_to_hex, get_asset_info, get_evm_chain_id, hex_to_bytes
from ...verify import verify_universal_signature


@dataclass
class ExactEvmSchemeV1Config:
    """Configuration for ExactEvmSchemeV1 facilitator."""

    deploy_erc4337_with_eip6492: bool = False
    """Enable automatic smart wallet deployment via EIP-6492."""


class ExactEvmSchemeV1:
    """EVM facilitator implementation for Exact payment scheme (V1).

    V1 differences:
    - scheme/network at payload top level
    - Uses maxAmountRequired from requirements
    - Legacy network names
    - extra field is JSON-encoded

    Attributes:
        scheme: The scheme identifier ("exact").
        caip_family: The CAIP family pattern ("eip155:*").
    """

    scheme = SCHEME_EXACT
    caip_family = "eip155:*"

    def __init__(
        self,
        signer: FacilitatorEvmSigner,
        config: ExactEvmSchemeV1Config | None = None,
    ):
        """Create ExactEvmSchemeV1 facilitator.

        Args:
            signer: EVM signer for verification/settlement.
            config: Optional configuration.
        """
        self._signer = signer
        self._config = config or ExactEvmSchemeV1Config()

    def get_extra(self, network: Network) -> dict[str, Any] | None:
        """Get mechanism-specific extra data. EVM: None.

        Args:
            network: Network identifier.

        Returns:
            None for EVM scheme.
        """
        return None

    def get_signers(self, network: Network) -> list[str]:
        """Get facilitator wallet addresses.

        Args:
            network: Network identifier.

        Returns:
            List of facilitator addresses.
        """
        return self._signer.get_addresses()

    def verify(
        self,
        payload: PaymentPayloadV1,
        requirements: PaymentRequirementsV1,
    ) -> VerifyResponse:
        """Verify EIP-3009 payment payload (V1).

        V1 validation differences:
        - scheme/network at top level of payload
        - Uses maxAmountRequired for amount check
        - extra is JSON-encoded

        Args:
            payload: V1 payment payload.
            requirements: V1 payment requirements.

        Returns:
            VerifyResponse with is_valid and payer.
        """
        evm_payload = ExactEIP3009Payload.from_dict(payload.payload)
        payer = evm_payload.authorization.from_address
        network = requirements.network

        # V1: Validate scheme at top level
        if payload.scheme != SCHEME_EXACT or requirements.scheme != SCHEME_EXACT:
            return VerifyResponse(
                is_valid=False, invalid_reason=ERR_UNSUPPORTED_SCHEME, payer=payer
            )

        # V1: Validate network at top level
        if payload.network != requirements.network:
            return VerifyResponse(
                is_valid=False, invalid_reason=ERR_NETWORK_MISMATCH, payer=payer
            )

        # V1: Legacy chain ID lookup
        try:
            chain_id = get_evm_chain_id(network)
            asset_info = get_asset_info(network, requirements.asset)
        except ValueError as e:
            return VerifyResponse(is_valid=False, invalid_reason=str(e), payer=payer)

        # V1: Parse JSON-encoded extra
        extra = requirements.extra or {}
        if isinstance(extra, str):
            extra = json.loads(extra)

        if "name" not in extra or "version" not in extra:
            return VerifyResponse(
                is_valid=False, invalid_reason=ERR_MISSING_EIP712_DOMAIN, payer=payer
            )

        # Validate recipient
        if evm_payload.authorization.to.lower() != requirements.pay_to.lower():
            return VerifyResponse(
                is_valid=False, invalid_reason=ERR_RECIPIENT_MISMATCH, payer=payer
            )

        # V1: Use maxAmountRequired
        if int(evm_payload.authorization.value) < int(requirements.max_amount_required):
            return VerifyResponse(
                is_valid=False, invalid_reason=ERR_INSUFFICIENT_AMOUNT, payer=payer
            )

        # V1: Check validBefore is in future (6 second buffer)
        now = int(time.time())
        if int(evm_payload.authorization.valid_before) < now + 6:
            return VerifyResponse(
                is_valid=False, invalid_reason=ERR_VALID_BEFORE_EXPIRED, payer=payer
            )

        # V1: Check validAfter is not in future
        if int(evm_payload.authorization.valid_after) > now:
            return VerifyResponse(
                is_valid=False, invalid_reason=ERR_VALID_AFTER_FUTURE, payer=payer
            )

        # Check balance
        try:
            balance = self._signer.get_balance(payer, asset_info["address"])
            if balance < int(requirements.max_amount_required):
                return VerifyResponse(
                    is_valid=False, invalid_reason=ERR_INSUFFICIENT_BALANCE, payer=payer
                )
        except Exception:
            pass  # Continue if balance check fails

        # Verify signature
        if not evm_payload.signature:
            return VerifyResponse(
                is_valid=False, invalid_reason=ERR_INVALID_SIGNATURE, payer=payer
            )

        signature = hex_to_bytes(evm_payload.signature)
        hash_bytes = hash_eip3009_authorization(
            evm_payload.authorization,
            chain_id,
            asset_info["address"],
            extra["name"],
            extra["version"],
        )

        try:
            valid, _ = verify_universal_signature(
                self._signer, payer, hash_bytes, signature, allow_undeployed=True
            )
            if not valid:
                return VerifyResponse(
                    is_valid=False, invalid_reason=ERR_INVALID_SIGNATURE, payer=payer
                )
        except Exception:
            return VerifyResponse(
                is_valid=False, invalid_reason=ERR_INVALID_SIGNATURE, payer=payer
            )

        return VerifyResponse(is_valid=True, payer=payer)

    def settle(
        self,
        payload: PaymentPayloadV1,
        requirements: PaymentRequirementsV1,
    ) -> SettleResponse:
        """Settle EIP-3009 payment on-chain (V1).

        Same settlement logic as V2, but uses V1 payload/requirements.

        Args:
            payload: V1 payment payload.
            requirements: V1 payment requirements.

        Returns:
            SettleResponse with success, transaction, and payer.
        """
        # First verify
        verify_result = self.verify(payload, requirements)
        if not verify_result.is_valid:
            return SettleResponse(
                success=False,
                error_reason=verify_result.invalid_reason,
                network=payload.network,
                payer=verify_result.payer,
                transaction="",
            )

        evm_payload = ExactEIP3009Payload.from_dict(payload.payload)
        payer = evm_payload.authorization.from_address
        network = requirements.network
        asset_info = get_asset_info(network, requirements.asset)

        signature = hex_to_bytes(evm_payload.signature)
        sig_data = parse_erc6492_signature(signature)

        # Deploy smart wallet if needed
        if has_deployment_info(sig_data):
            code = self._signer.get_code(payer)
            if len(code) == 0:
                if self._config.deploy_erc4337_with_eip6492:
                    try:
                        self._deploy_smart_wallet(sig_data)
                    except Exception as e:
                        return SettleResponse(
                            success=False,
                            error_reason=str(e),
                            network=network,
                            payer=payer,
                            transaction="",
                        )
                else:
                    return SettleResponse(
                        success=False,
                        error_reason=ERR_UNDEPLOYED_SMART_WALLET,
                        network=network,
                        payer=payer,
                        transaction="",
                    )

        inner_sig = sig_data.inner_signature
        is_ecdsa = len(inner_sig) == 65

        try:
            if is_ecdsa:
                r, s, v = inner_sig[:32], inner_sig[32:64], inner_sig[64]
                tx_hash = self._signer.write_contract(
                    asset_info["address"],
                    TRANSFER_WITH_AUTHORIZATION_VRS_ABI,
                    "transferWithAuthorization",
                    payer,
                    evm_payload.authorization.to,
                    int(evm_payload.authorization.value),
                    int(evm_payload.authorization.valid_after),
                    int(evm_payload.authorization.valid_before),
                    hex_to_bytes(evm_payload.authorization.nonce),
                    v,
                    r,
                    s,
                )
            else:
                tx_hash = self._signer.write_contract(
                    asset_info["address"],
                    TRANSFER_WITH_AUTHORIZATION_BYTES_ABI,
                    "transferWithAuthorization",
                    payer,
                    evm_payload.authorization.to,
                    int(evm_payload.authorization.value),
                    int(evm_payload.authorization.valid_after),
                    int(evm_payload.authorization.valid_before),
                    hex_to_bytes(evm_payload.authorization.nonce),
                    inner_sig,
                )

            receipt = self._signer.wait_for_transaction_receipt(tx_hash)
            if receipt.status != TX_STATUS_SUCCESS:
                return SettleResponse(
                    success=False,
                    error_reason=ERR_TRANSACTION_FAILED,
                    transaction=tx_hash,
                    network=network,
                    payer=payer,
                )

            return SettleResponse(
                success=True,
                transaction=tx_hash,
                network=network,
                payer=payer,
            )

        except Exception as e:
            return SettleResponse(
                success=False,
                error_reason=str(e),
                network=network,
                payer=payer,
                transaction="",
            )

    def _deploy_smart_wallet(self, sig_data: ERC6492SignatureData) -> None:
        """Deploy ERC-4337 smart wallet via ERC-6492 factory.

        Args:
            sig_data: Parsed signature with factory and calldata.

        Raises:
            RuntimeError: If deployment fails.
        """
        factory_addr = bytes_to_hex(sig_data.factory)
        tx_hash = self._signer.send_transaction(factory_addr, sig_data.factory_calldata)
        receipt = self._signer.wait_for_transaction_receipt(tx_hash)
        if receipt.status != TX_STATUS_SUCCESS:
            raise RuntimeError(ERR_SMART_WALLET_DEPLOYMENT_FAILED)

