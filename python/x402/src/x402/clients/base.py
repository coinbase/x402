import time
from web3 import Web3
from x402.chains import get_chain_id, get_token_name, get_token_version
from x402.types import (
    PaymentRequirements,
    UnsupportedSchemeException,
)
from eth_account import Account
import secrets


class x402Client:
    def __init__(self, web3: Web3):
        self.web3 = web3

    def _signed_exact_evm_payment_payload(
        self, payment_requirements: PaymentRequirements
    ):
        """Create and sign an exact EVM payment payload"""

        if payment_requirements.scheme != "exact":
            raise UnsupportedSchemeException(
                f"Unsupported scheme: {payment_requirements.scheme}"
            )

        chain_id = get_chain_id(payment_requirements.network)
        token_name = get_token_name(str(chain_id), payment_requirements.asset)
        token_version = get_token_version(str(chain_id), payment_requirements.asset)

        types = {
            "EIP712Domain": [
                {"name": "name", "type": "string"},
                {"name": "version", "type": "string"},
                {"name": "chainId", "type": "uint256"},
                {"name": "verifyingContract", "type": "address"},
            ],
            "TransferWithAuthorization": [
                {"name": "from", "type": "address"},
                {"name": "to", "type": "address"},
                {"name": "value", "type": "uint256"},
                {"name": "validAfter", "type": "uint256"},
                {"name": "validBefore", "type": "uint256"},
                {"name": "nonce", "type": "bytes32"},
            ],
        }
        domain = {
            "name": token_name,
            "version": token_version,
            "chainId": chain_id,
            "verifyingContract": payment_requirements.asset,
        }
        primaryType = "TransferWithAuthorization"
        message = {
            "from": self.web3.eth.account,
            "to": payment_requirements.pay_to,
            "value": payment_requirements.max_amount_required,
            "validAfter": int(time.time()) - payment_requirements.max_timeout_seconds,
            "validBefore": int(time.time()) + payment_requirements.max_timeout_seconds,
            "nonce": secrets.token_bytes(32),
        }

        signed_message = self.web3.eth.account.sign_typed_data(types, domain, message)
        return signed_message
