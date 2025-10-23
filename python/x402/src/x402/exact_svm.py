"""Exact payment scheme implementation for Solana Virtual Machine (SVM)."""

import base64
from typing import Dict, Any, Optional
from solders.pubkey import Pubkey
from solders.transaction import Transaction
from solders.message import Message
from solana.rpc.api import Client

from x402.svm.wallet import Keypair
from x402.svm.rpc import get_rpc_client
from x402.svm.transaction import (
    get_associated_token_address_for_owner,
    create_ata_instruction_if_needed,
    create_transfer_instruction,
    sign_transaction,
    encode_transaction,
    decode_transaction,
)
from x402.types import PaymentRequirements
from x402.encoding import safe_base64_encode, safe_base64_decode


async def create_payment_header(
    keypair: Keypair,
    x402_version: int,
    payment_requirements: PaymentRequirements,
    custom_rpc_url: Optional[str] = None,
) -> str:
    """
    Create a payment header for SVM (Solana) payments.

    Args:
        keypair: Solana keypair to sign the transaction
        x402_version: x402 protocol version
        payment_requirements: Payment requirements from the server
        custom_rpc_url: Optional custom RPC URL

    Returns:
        Base64-encoded payment header

    Example:
        >>> from x402.svm import create_keypair_from_base58
        >>> keypair = create_keypair_from_base58("...")
        >>> header = await create_payment_header(keypair, 1, requirements)
    """
    import json
    
    payment_payload = await create_and_sign_payment(
        keypair, payment_requirements, custom_rpc_url
    )

    header = {
        "x402Version": x402_version,
        "scheme": payment_requirements.scheme,
        "network": payment_requirements.network,
        "payload": payment_payload,
    }

    # Convert to JSON string first, then encode to base64
    header_json = json.dumps(header)
    return safe_base64_encode(header_json)


async def create_and_sign_payment(
    keypair: Keypair,
    payment_requirements: PaymentRequirements,
    custom_rpc_url: Optional[str] = None,
) -> Dict[str, Any]:
    """
    Create and sign a payment transaction.

    Args:
        keypair: Solana keypair
        payment_requirements: Payment requirements
        custom_rpc_url: Optional custom RPC URL

    Returns:
        Payment payload with signed transaction
    """
    client = get_rpc_client(payment_requirements.network, custom_rpc_url)

    # Parse addresses
    mint = Pubkey.from_string(payment_requirements.asset)
    pay_to = Pubkey.from_string(payment_requirements.pay_to)
    fee_payer = Pubkey.from_string(payment_requirements.extra["feePayer"])

    # Get token accounts
    source_ata = get_associated_token_address_for_owner(mint, keypair.pubkey)
    dest_ata = get_associated_token_address_for_owner(mint, pay_to)

    # Get token decimals (fetch mint info)
    mint_info = client.get_account_info(mint)
    if not mint_info.value or not mint_info.value.data:
        raise ValueError(f"Could not fetch mint info for {mint}")

    # Parse decimals from mint account data (byte 44)
    decimals = mint_info.value.data[44]

    # Create instructions
    instructions = []

    # Check if destination ATA needs to be created
    ata_instruction = await create_ata_instruction_if_needed(
        client, fee_payer, pay_to, mint
    )
    if ata_instruction:
        instructions.append(ata_instruction)

    # Create transfer instruction
    transfer_ix = create_transfer_instruction(
        source=source_ata,
        dest=dest_ata,
        owner=keypair.pubkey,
        amount=int(payment_requirements.max_amount_required),
        decimals=decimals,
        mint=mint,
    )
    instructions.append(transfer_ix)

    # Get recent blockhash
    recent_blockhash_resp = client.get_latest_blockhash()
    recent_blockhash = recent_blockhash_resp.value.blockhash

    # Create transaction
    message = Message.new_with_blockhash(
        instructions,
        fee_payer,
        recent_blockhash,
    )
    transaction = Transaction.new_unsigned(message)

    # Partially sign with client (fee payer will sign on facilitator side)
    signed_tx = sign_transaction(transaction, [keypair])

    # Encode transaction
    encoded_tx = encode_transaction(signed_tx)

    return {"transaction": encoded_tx}


def decode_payment(encoded_payment: str) -> Dict[str, Any]:
    """
    Decode a base64-encoded payment.

    Args:
        encoded_payment: Base64-encoded payment

    Returns:
        Decoded payment dictionary
    """
    import json
    decoded_str = safe_base64_decode(encoded_payment)
    return json.loads(decoded_str)


async def settle_payment(
    fee_payer_keypair: Keypair,
    payment_payload: Dict[str, Any],
    payment_requirements: PaymentRequirements,
    custom_rpc_url: Optional[str] = None,
) -> Dict[str, Any]:
    """
    Settle a payment by signing with fee payer and sending to blockchain.

    Args:
        fee_payer_keypair: Fee payer keypair
        payment_payload: Payment payload from client
        payment_requirements: Payment requirements
        custom_rpc_url: Optional custom RPC URL

    Returns:
        Settlement response with transaction signature
    """
    from x402.svm.transaction import send_transaction

    client = get_rpc_client(payment_requirements.network, custom_rpc_url)

    # Decode transaction
    encoded_tx = payment_payload["transaction"]
    transaction = decode_transaction(encoded_tx)

    print(f"🔍 DEBUG settle: Decoded transaction")
    print(f"🔍 DEBUG settle: Fee payer from message: {transaction.message.account_keys[0]}")
    print(f"🔍 DEBUG settle: Our fee payer pubkey: {fee_payer_keypair.pubkey}")
    print(f"🔍 DEBUG settle: Signatures before fee payer sign: {[str(sig) for sig in transaction.signatures]}")

    # Sign with fee payer
    signed_tx = sign_transaction(transaction, [fee_payer_keypair])
    
    print(f"🔍 DEBUG settle: Signatures after fee payer sign: {[str(sig) for sig in signed_tx.signatures]}")

    # Send transaction
    try:
        print(f"🔍 DEBUG: About to send transaction...")
        print(f"🔍 DEBUG: Transaction has {len(signed_tx.signatures)} signatures")
        signature = send_transaction(client, signed_tx, skip_preflight=True)
        print(f"🔍 DEBUG: Received signature: {signature}")
        print(f"🔍 DEBUG: Signature type: {type(signature)}")
        return {
            "success": True,
            "transaction": signature,
            "network": payment_requirements.network,
        }
    except Exception as e:
        print(f"❌ DEBUG: Error sending transaction: {e}")
        import traceback
        traceback.print_exc()
        return {
            "success": False,
            "error": str(e),
            "network": payment_requirements.network,
        }

