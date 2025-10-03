import time
import json
from typing import Dict, Any
from typing_extensions import TypedDict

from eth_account import Account
from eth_account.messages import encode_typed_data
from eth_utils import to_checksum_address
from hexbytes import HexBytes

from x402.encoding import safe_base64_encode, safe_base64_decode
from x402.types import (
    PaymentRequirements,
    DeferredEvmPayloadVoucher,
    DeferredPaymentPayload,
    DeferredPaymentRequirementsExtraNewVoucher,
    DeferredPaymentRequirementsExtraAggregationVoucher,
)
from x402.chains import get_chain_id

# Constants
EXPIRY_TIME = 60 * 60 * 24 * 30  # 30 days
DEFERRED_SCHEME = "deferred"


class PaymentHeader(TypedDict):
    x402Version: int
    scheme: str
    network: str
    payload: dict[str, Any]


def prepare_payment_header(
    sender_address: str, x402_version: int, payment_requirements: PaymentRequirements
) -> Dict[str, Any]:
    """Prepare an unsigned deferred payment header."""
    # Check if extra is a dict and has 'type' field
    if not payment_requirements.extra or "type" not in payment_requirements.extra:
        raise ValueError("Payment requirements extra must contain 'type' field")
    
    extra_type = payment_requirements.extra["type"]
    
    if extra_type == "new":
        voucher = create_new_voucher(sender_address, payment_requirements)
    elif extra_type == "aggregation":
        voucher = aggregate_voucher(sender_address, payment_requirements)
    else:
        raise ValueError(f"Unknown voucher type: {extra_type}")
    
    return {
        "x402Version": x402_version,
        "scheme": DEFERRED_SCHEME,
        "network": payment_requirements.network,
        "payload": {
            "signature": None,
            "voucher": voucher.model_dump(by_alias=True),
        },
    }


def create_new_voucher(
    buyer: str, payment_requirements: PaymentRequirements
) -> DeferredEvmPayloadVoucher:
    """Create a new voucher with the given payment requirements."""
    # Validate extra data structure
    try:
        extra = DeferredPaymentRequirementsExtraNewVoucher(**payment_requirements.extra)
    except Exception as e:
        raise ValueError(f"Invalid extra data for new voucher: {e}")
    
    return DeferredEvmPayloadVoucher(
        id=extra.voucher["id"],
        buyer=to_checksum_address(buyer),
        seller=to_checksum_address(payment_requirements.pay_to),
        value_aggregate=payment_requirements.max_amount_required,
        asset=to_checksum_address(payment_requirements.asset),
        timestamp=int(time.time()),
        nonce=0,
        escrow=to_checksum_address(extra.voucher["escrow"]),
        chain_id=int(get_chain_id(payment_requirements.network)),
        expiry=int(time.time()) + EXPIRY_TIME,
    )


def aggregate_voucher(
    buyer: str, payment_requirements: PaymentRequirements
) -> DeferredEvmPayloadVoucher:
    """Aggregate a voucher with new payment requirements."""
    # Validate extra data structure
    try:
        extra = DeferredPaymentRequirementsExtraAggregationVoucher(**payment_requirements.extra)
    except Exception as e:
        raise ValueError(f"Invalid extra data for voucher aggregation: {e}")
    
    voucher = extra.voucher
    now = int(time.time())
    
    # Verify previous voucher matches payment requirements
    if payment_requirements.pay_to.lower() != voucher.seller.lower():
        raise ValueError("Invalid voucher seller")
    if payment_requirements.asset.lower() != voucher.asset.lower():
        raise ValueError("Invalid voucher asset")
    if int(get_chain_id(payment_requirements.network)) != voucher.chain_id:
        raise ValueError("Invalid voucher chainId")
    if now > voucher.expiry:
        raise ValueError("Voucher expired")
    if now < voucher.timestamp:
        raise ValueError("Voucher timestamp is in the future")
    
    # Verify signature is valid and the voucher's buyer is the client
    is_valid = verify_voucher(voucher, extra.signature, buyer)
    if not is_valid:
        raise ValueError("Invalid voucher signature")
    
    # Create aggregated voucher
    new_value_aggregate = str(
        int(payment_requirements.max_amount_required) + int(voucher.value_aggregate)
    )
    
    return DeferredEvmPayloadVoucher(
        id=voucher.id,
        buyer=to_checksum_address(buyer),
        seller=voucher.seller,
        value_aggregate=new_value_aggregate,
        asset=voucher.asset,
        timestamp=now,
        nonce=voucher.nonce + 1,
        escrow=voucher.escrow,
        chain_id=voucher.chain_id,
        expiry=now + EXPIRY_TIME,
    )


def get_voucher_typed_data(voucher: DeferredEvmPayloadVoucher) -> Dict[str, Any]:
    """Get the EIP-712 typed data for a voucher."""
    return {
        "types": {
            "EIP712Domain": [
                {"name": "name", "type": "string"},
                {"name": "version", "type": "string"},
                {"name": "chainId", "type": "uint256"},
                {"name": "verifyingContract", "type": "address"},
            ],
            "Voucher": [
                {"name": "id", "type": "bytes32"},
                {"name": "buyer", "type": "address"},
                {"name": "seller", "type": "address"},
                {"name": "valueAggregate", "type": "uint256"},
                {"name": "asset", "type": "address"},
                {"name": "timestamp", "type": "uint64"},
                {"name": "nonce", "type": "uint256"},
                {"name": "escrow", "type": "address"},
                {"name": "chainId", "type": "uint256"},
                {"name": "expiry", "type": "uint64"},
            ]
        },
        "primaryType": "Voucher",
        "domain": {
            "name": "DeferredPaymentEscrow",
            "version": "1",
            "chainId": voucher.chain_id,
            "verifyingContract": to_checksum_address(voucher.escrow),
        },
        "message": {
            "id": voucher.id,
            "buyer": to_checksum_address(voucher.buyer),
            "seller": to_checksum_address(voucher.seller),
            "valueAggregate": int(voucher.value_aggregate),
            "asset": to_checksum_address(voucher.asset),
            "timestamp": voucher.timestamp,
            "nonce": voucher.nonce,
            "escrow": to_checksum_address(voucher.escrow),
            "chainId": voucher.chain_id,
            "expiry": voucher.expiry,
        },
    }


def sign_voucher(account: Account, voucher: DeferredEvmPayloadVoucher) -> str:
    """Sign a voucher using EIP-712."""
    typed_data = get_voucher_typed_data(voucher)
    
    # Encode the typed data
    signable_message = encode_typed_data(
        domain_data=typed_data["domain"],
        message_types={k: v for k, v in typed_data["types"].items() if k != "EIP712Domain"},
        message_data=typed_data["message"],
    )
    
    # Sign the message
    signed_message = account.sign_message(signable_message)
    signature = signed_message.signature.hex()
    
    if not signature.startswith("0x"):
        signature = f"0x{signature}"
    
    return signature


def verify_voucher(
    voucher: DeferredEvmPayloadVoucher, signature: str, signer: str
) -> bool:
    """Verify a voucher signature."""
    typed_data = get_voucher_typed_data(voucher)
    
    # Encode the typed data
    signable_message = encode_typed_data(
        domain_data=typed_data["domain"],
        message_types={k: v for k, v in typed_data["types"].items() if k != "EIP712Domain"},
        message_data=typed_data["message"],
    )
    
    # Recover the signer address
    recovered_address = Account.recover_message(signable_message, signature=signature)
    
    return recovered_address.lower() == signer.lower()


def sign_payment_header(
    account: Account, payment_requirements: PaymentRequirements, header: PaymentHeader
) -> str:
    """Sign a deferred payment header using the account's private key."""
    try:
        voucher_dict = header["payload"]["voucher"]
        voucher = DeferredEvmPayloadVoucher(**voucher_dict)
        
        # Sign the voucher
        signature = sign_voucher(account, voucher)
        
        # Update the header with the signature
        header["payload"]["signature"] = signature
        
        # Encode the payment
        encoded = encode_payment(header)
        return encoded
    except Exception as e:
        raise Exception(f"Failed to sign payment header: {e}")


def encode_payment(payment_payload: Dict[str, Any]) -> str:
    """Encode a payment payload into a base64 string."""
    from hexbytes import HexBytes
    
    def default(obj):
        if isinstance(obj, HexBytes):
            return obj.hex()
        if hasattr(obj, "to_dict"):
            return obj.to_dict()
        if hasattr(obj, "hex"):
            return obj.hex()
        raise TypeError(
            f"Object of type {obj.__class__.__name__} is not JSON serializable"
        )
    
    return safe_base64_encode(json.dumps(payment_payload, default=default))


def decode_payment(encoded_payment: str) -> Dict[str, Any]:
    """Decode a base64 encoded payment string."""
    return json.loads(safe_base64_decode(encoded_payment))