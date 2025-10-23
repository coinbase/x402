"""Solana transaction utilities for x402 payments."""

from typing import Optional, List
import base64
from solana.rpc.api import Client
from solana.rpc.commitment import Confirmed
from solana.rpc.types import TxOpts
from solders.pubkey import Pubkey
from solders.instruction import Instruction, AccountMeta
from solders.transaction import Transaction
from solders.message import Message
from solders.system_program import ID as SYSTEM_PROGRAM_ID
from spl.token.constants import TOKEN_PROGRAM_ID, ASSOCIATED_TOKEN_PROGRAM_ID
from spl.token.instructions import (
    transfer_checked,
    TransferCheckedParams,
    get_associated_token_address,
    create_associated_token_account,
)

from x402.svm.wallet import Keypair


def get_associated_token_address_for_owner(
    mint: Pubkey, owner: Pubkey, token_program_id: Pubkey = TOKEN_PROGRAM_ID
) -> Pubkey:
    """
    Get the associated token account address for an owner and mint.

    Args:
        mint: Token mint address
        owner: Owner's public key
        token_program_id: Token program ID (default: TOKEN_PROGRAM_ID)

    Returns:
        Associated token account address
    """
    return get_associated_token_address(owner, mint, token_program_id)


async def create_ata_instruction_if_needed(
    client: Client,
    payer: Pubkey,
    owner: Pubkey,
    mint: Pubkey,
    token_program_id: Pubkey = TOKEN_PROGRAM_ID,
) -> Optional[Instruction]:
    """
    Create an instruction to create an associated token account if it doesn't exist.

    Args:
        client: Solana RPC client
        payer: Account that will pay for the ATA creation
        owner: Owner of the ATA
        mint: Token mint address
        token_program_id: Token program ID

    Returns:
        CreateAssociatedTokenAccount instruction if ATA doesn't exist, None otherwise
    """
    ata_address = get_associated_token_address_for_owner(mint, owner, token_program_id)

    # Check if ATA exists
    try:
        account_info = client.get_account_info(ata_address)
        if account_info.value is not None:
            # ATA already exists
            return None
    except Exception:
        pass  # ATA doesn't exist, create it

    # Create the ATA instruction
    return create_associated_token_account(
        payer=payer,
        owner=owner,
        mint=mint,
    )


def create_transfer_instruction(
    source: Pubkey,
    dest: Pubkey,
    owner: Pubkey,
    amount: int,
    decimals: int,
    mint: Pubkey,
    token_program_id: Pubkey = TOKEN_PROGRAM_ID,
) -> Instruction:
    """
    Create a transfer_checked instruction for SPL tokens.

    Args:
        source: Source token account
        dest: Destination token account
        owner: Owner/authority of the source account
        amount: Amount to transfer (in atomic units)
        decimals: Token decimals
        mint: Token mint address
        token_program_id: Token program ID

    Returns:
        Transfer instruction
    """
    return transfer_checked(
        TransferCheckedParams(
            program_id=token_program_id,
            source=source,
            mint=mint,
            dest=dest,
            owner=owner,
            amount=amount,
            decimals=decimals,
        )
    )


def sign_transaction(transaction: Transaction, signers: List[Keypair]) -> Transaction:
    """
    Sign a transaction with the given signers.

    Args:
        transaction: Transaction to sign
        signers: List of keypairs to sign with

    Returns:
        Signed transaction
    """
    solders_signers = [signer.keypair for signer in signers]
    # Use partial_sign to add signatures without needing blockhash
    transaction.partial_sign(solders_signers, transaction.message.recent_blockhash)
    return transaction


def send_transaction(
    client: Client,
    transaction: Transaction,
    skip_preflight: bool = True,
    max_retries: int = 3,
) -> str:
    """
    Send a signed transaction to the network.

    Args:
        client: Solana RPC client
        transaction: Signed transaction
        skip_preflight: Whether to skip preflight checks
        max_retries: Maximum number of retries

    Returns:
        Transaction signature

    Raises:
        Exception: If transaction fails to send
    """
    opts = TxOpts(
        skip_preflight=skip_preflight,
        preflight_commitment=Confirmed,
        max_retries=max_retries,
    )

    print(f"🔍 DEBUG send_transaction: Sending with skip_preflight={skip_preflight}")
    print(f"🔍 DEBUG send_transaction: Transaction signatures: {[str(sig) for sig in transaction.signatures]}")
    print(f"🔍 DEBUG send_transaction: Transaction: {transaction}")
    response = client.send_transaction(transaction, opts=opts)
    print(f"🔍 DEBUG send_transaction: Response type: {type(response)}")
    print(f"🔍 DEBUG send_transaction: Response: {response}")
    
    if hasattr(response, 'value') and response.value:
        sig = response.value
        print(f"🔍 DEBUG send_transaction: Response value: {sig}")
        
        # The response value is the signature, but it might be the default if not properly signed
        # Use the first NON-DEFAULT signature from the transaction
        sig_str = str(sig)
        
        # Check if it's the default signature (all 1s)
        if sig_str == "1" * 64 or sig_str == "1111111111111111111111111111111111111111111111111111111111111111":
            print(f"⚠️  DEBUG: Got default signature from response, finding real signature from transaction...")
            # Find the first non-default signature
            for tx_sig in transaction.signatures:
                tx_sig_str = str(tx_sig)
                if tx_sig_str != "1" * 64 and tx_sig_str != "1111111111111111111111111111111111111111111111111111111111111111":
                    print(f"✅ DEBUG: Found real signature: {tx_sig_str}")
                    return tx_sig_str
            print(f"❌ DEBUG: No real signature found in transaction!")
        
        print(f"🔍 DEBUG send_transaction: Using signature: {sig_str}")
        return sig_str
    else:
        # If no value in response, return the first signature from the transaction
        # This is the transaction ID
        if transaction.signatures and len(transaction.signatures) > 0:
            sig_str = str(transaction.signatures[0])
            print(f"🔍 DEBUG send_transaction: Using transaction signature: {sig_str}")
            return sig_str
        raise Exception(f"Failed to send transaction: {response}")


def encode_transaction(transaction: Transaction) -> str:
    """
    Encode a transaction to base64.

    Args:
        transaction: Transaction to encode

    Returns:
        Base64-encoded transaction
    """
    return base64.b64encode(bytes(transaction)).decode("utf-8")


def decode_transaction(encoded_tx: str) -> Transaction:
    """
    Decode a base64-encoded transaction.

    Args:
        encoded_tx: Base64-encoded transaction

    Returns:
        Decoded transaction
    """
    tx_bytes = base64.b64decode(encoded_tx)
    return Transaction.from_bytes(tx_bytes)

