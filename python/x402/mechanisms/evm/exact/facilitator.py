"""EVM facilitator implementation for the Exact payment scheme (V2)."""

import time
from dataclasses import dataclass
from typing import Any

from ....schemas import (
    Network,
    PaymentPayload,
    PaymentRequirements,
    SettleResponse,
    VerifyResponse,
)
from ..constants import (
    AUTHORIZATION_STATE_ABI,
    ERR_INSUFFICIENT_AMOUNT,
    ERR_INSUFFICIENT_BALANCE,
    ERR_INVALID_SIGNATURE,
    ERR_MISSING_EIP712_DOMAIN,
    ERR_NETWORK_MISMATCH,
    ERR_NONCE_ALREADY_USED,
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
from ..eip712 import hash_eip3009_authorization
from ..erc6492 import has_deployment_info, parse_erc6492_signature
from ..signer import FacilitatorEvmSigner
from ..types import ERC6492SignatureData, ExactEIP3009Payload
from ..utils import bytes_to_hex, get_asset_info, get_network_config, hex_to_bytes
from ..verify import verify_universal_signature


@dataclass
class ExactEvmSchemeConfig:
    """Configuration for ExactEvmScheme facilitator."""

    deploy_erc4337_with_eip6492: bool = False
    """Enable automatic smart wallet deployment via EIP-6492."""


class ExactEvmScheme:
    """EVM facilitator implementation for the Exact payment scheme (V2).

    Verifies and settles EIP-3009 payments on EVM networks.

    Attributes:
        scheme: The scheme identifier ("exact").
        caip_family: The CAIP family pattern ("eip155:*").
    """

    scheme = SCHEME_EXACT
    caip_family = "eip155:*"

    def __init__(
        self,
        signer: FacilitatorEvmSigner,
        config: ExactEvmSchemeConfig | None = None,
    ):
        """Create ExactEvmScheme facilitator.

        Args:
            signer: EVM signer for verification and settlement.
            config: Optional configuration.
        """
        self._signer = signer
        self._config = config or ExactEvmSchemeConfig()

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
        payload: PaymentPayload,
        requirements: PaymentRequirements,
    ) -> VerifyResponse:
        """Verify EIP-3009 payment payload.

        Validates:
        - Scheme and network match
        - Signature is valid (EOA, EIP-1271, or ERC-6492)
        - Recipient matches requirements.pay_to
        - Amount >= requirements.amount
        - Validity window is correct
        - Nonce hasn't been used
        - Payer has sufficient balance

        Args:
            payload: Payment payload from client.
            requirements: Payment requirements.

        Returns:
            VerifyResponse with is_valid and payer.
        """
        evm_payload = ExactEIP3009Payload.from_dict(payload.payload)
        payer = evm_payload.authorization.from_address
        network = str(requirements.network)

        # Validate scheme
        if payload.accepted.scheme != SCHEME_EXACT:
            return VerifyResponse(
                is_valid=False, invalid_reason=ERR_UNSUPPORTED_SCHEME, payer=payer
            )

        # Validate network
        if payload.accepted.network != requirements.network:
            return VerifyResponse(is_valid=False, invalid_reason=ERR_NETWORK_MISMATCH, payer=payer)

        # Get configs
        try:
            config = get_network_config(network)
            asset_info = get_asset_info(network, requirements.asset)
        except ValueError as e:
            return VerifyResponse(is_valid=False, invalid_reason=str(e), payer=payer)

        # Check EIP-712 domain params
        extra = requirements.extra or {}
        if "name" not in extra or "version" not in extra:
            return VerifyResponse(
                is_valid=False, invalid_reason=ERR_MISSING_EIP712_DOMAIN, payer=payer
            )

        # Validate recipient
        if evm_payload.authorization.to.lower() != requirements.pay_to.lower():
            return VerifyResponse(
                is_valid=False, invalid_reason=ERR_RECIPIENT_MISMATCH, payer=payer
            )

        # Validate amount
        if int(evm_payload.authorization.value) < int(requirements.amount):
            return VerifyResponse(
                is_valid=False, invalid_reason=ERR_INSUFFICIENT_AMOUNT, payer=payer
            )

        # Validate timing
        now = int(time.time())

        # Check validBefore is in future (6 second buffer)
        if int(evm_payload.authorization.valid_before) < now + 6:
            return VerifyResponse(
                is_valid=False, invalid_reason=ERR_VALID_BEFORE_EXPIRED, payer=payer
            )

        # Check validAfter is not in future
        if int(evm_payload.authorization.valid_after) > now:
            return VerifyResponse(
                is_valid=False, invalid_reason=ERR_VALID_AFTER_FUTURE, payer=payer
            )

        # Check nonce
        try:
            nonce_used = self._check_nonce_used(
                payer, evm_payload.authorization.nonce, asset_info["address"]
            )
            if nonce_used:
                return VerifyResponse(
                    is_valid=False, invalid_reason=ERR_NONCE_ALREADY_USED, payer=payer
                )
        except Exception:
            pass  # Continue if nonce check fails

        # Check balance
        try:
            balance = self._signer.get_balance(payer, asset_info["address"])
            if balance < int(evm_payload.authorization.value):
                return VerifyResponse(
                    is_valid=False, invalid_reason=ERR_INSUFFICIENT_BALANCE, payer=payer
                )
        except Exception:
            pass  # Continue if balance check fails

        # Verify signature
        if not evm_payload.signature:
            return VerifyResponse(is_valid=False, invalid_reason=ERR_INVALID_SIGNATURE, payer=payer)

        signature = hex_to_bytes(evm_payload.signature)
        hash_bytes = hash_eip3009_authorization(
            evm_payload.authorization,
            config["chain_id"],
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
        except Exception as e:
            return VerifyResponse(is_valid=False, invalid_reason=str(e), payer=payer)

        return VerifyResponse(is_valid=True, payer=payer)

    def settle(
        self,
        payload: PaymentPayload,
        requirements: PaymentRequirements,
    ) -> SettleResponse:
        """Settle EIP-3009 payment on-chain.

        - Re-verifies payment
        - Deploys smart wallet if configured and needed (ERC-6492)
        - Calls transferWithAuthorization (v,r,s or bytes overload)
        - Waits for transaction confirmation

        Args:
            payload: Verified payment payload.
            requirements: Payment requirements.

        Returns:
            SettleResponse with success, transaction, and payer.
        """
        # First verify
        verify_result = self.verify(payload, requirements)
        if not verify_result.is_valid:
            return SettleResponse(
                success=False,
                error_reason=verify_result.invalid_reason,
                network=str(payload.accepted.network),
                payer=verify_result.payer,
                transaction="",
            )

        evm_payload = ExactEIP3009Payload.from_dict(payload.payload)
        payer = evm_payload.authorization.from_address
        network = str(requirements.network)
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

        # Use inner signature for settlement
        inner_sig = sig_data.inner_signature
        is_ecdsa = len(inner_sig) == 65

        try:
            if is_ecdsa:
                # EOA: v,r,s overload
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
                # Smart wallet: bytes overload
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

    def _check_nonce_used(self, from_addr: str, nonce: str, token: str) -> bool:
        """Check if EIP-3009 nonce has been used.

        Args:
            from_addr: Authorizer address.
            nonce: Nonce hex string.
            token: Token contract address.

        Returns:
            True if nonce has been used.
        """
        result = self._signer.read_contract(
            token,
            AUTHORIZATION_STATE_ABI,
            "authorizationState",
            from_addr,
            hex_to_bytes(nonce),
        )
        return bool(result)

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
