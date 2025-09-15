import json
import time
import secrets
from typing import Dict, Any, Union
from typing_extensions import (
    TypedDict,
)  # use `typing_extensions.TypedDict` instead of `typing.TypedDict` on Python < 3.12

from eth_account import Account
try:
    from pysui import SyncClient
    from pysui.sui.sui_builders.get_builders import GetCoins
    from pysui.sui.sui_types import SuiAddress, SuiU64, ObjectID
    _has_pysui = True
except ImportError:
    _has_pysui = False
    SyncClient = Any

from x402.encoding import safe_base64_encode, safe_base64_decode
from x402.types import (
    PaymentRequirements,
)
from x402.chains import get_chain_id, get_sui_package_id


class PaymentHeader(TypedDict):
    x402Version: int
    scheme: str
    network: str
    payload: dict[str, Any]


def create_nonce() -> str:
    """Create a random 32-byte hex-encoded nonce for authorization signatures."""
    return secrets.token_hex(32)


def prepare_payment_header(
    account: Union[str, Account, "SyncClient"], x402_version: int, payment_requirements: PaymentRequirements
) -> PaymentHeader:
    """Prepare an unsigned payment header with transaction data ready for signing.

    Dispatches to network-specific preparation methods.
    """
    network = payment_requirements.network.lower()

    if network in ['sui', 'sui-testnet']:
        return _prepare_payment_header_sui(account, x402_version, payment_requirements)
    else:
        return _prepare_payment_header_evm(account, x402_version, payment_requirements)


def _prepare_payment_header_evm(
    account: Account, x402_version: int, payment_requirements: PaymentRequirements
) -> PaymentHeader:
    """Prepare an unsigned payment header for EVM networks.

    Creates the authorization structure that will be signed.
    """
    nonce = create_nonce()
    valid_after = str(int(time.time()) - 60)  # 60 seconds before
    valid_before = str(int(time.time()) + payment_requirements.max_timeout_seconds)

    return {
        "x402Version": x402_version,
        "scheme": payment_requirements.scheme,
        "network": payment_requirements.network,
        "payload": {
            "signature": None,
            "authorization": {
                "from": account if isinstance(account, str) else account.address,
                "to": payment_requirements.pay_to,
                "value": payment_requirements.max_amount_required,
                "validAfter": valid_after,
                "validBefore": valid_before,
                "nonce": nonce,
            },
        },
    }


def _prepare_payment_header_sui(
    client: "SyncClient", x402_version: int, payment_requirements: PaymentRequirements
) -> PaymentHeader:
    """Prepare an unsigned payment header for Sui networks.

    Builds a transaction that calls the x402 payments contract.
    """
    if not _has_pysui:
        raise ImportError(
            "pysui library is required for Sui networks. Please install it via 'pip install pysui'."
        )

    # Get sender address from the client's active address
    sender = client.config.active_address

    # Create a transaction with initial sender
    txn = client.transaction(initial_sender=sender)

    # Get contract package ID for this network
    package_id = get_sui_package_id(payment_requirements.network)

    # Get payment parameters
    coin_type = payment_requirements.asset
    amount_required = int(payment_requirements.max_amount_required)
    recipient = payment_requirements.pay_to
    nonce = payment_requirements.extra.get('nonce', '') if payment_requirements.extra else ''

    # Prepare nonce bytes (encode as UTF-8)
    nonce_bytes = list(nonce.encode('utf-8'))

    # Get coins of the specified type for the payment
    coin_data = []
    q_res = client.execute(GetCoins(owner=sender, coin_type=coin_type))
    while q_res.is_ok() and q_res.result_data.data:
        coin_data.extend(q_res.result_data.data)
        if q_res.result_data.next_cursor:
            q_res = client.execute(
                GetCoins(
                    owner=sender,
                    coin_type=coin_type,
                    cursor=q_res.result_data.next_cursor,
                )
            )
        else:
            break

    if not coin_data:
        raise Exception(f"No coins of type {coin_type} found for address {sender}")

    # Check if total balance meets requirement
    total_balance = sum(int(coin.balance) for coin in coin_data)
    if total_balance < amount_required:
        raise Exception(
            f"Insufficient balance. Required: {amount_required}, Available: {total_balance}"
        )

    # Get a coin with sufficient balance or merge coins
    sufficient_coin = next(
        (coin for coin in coin_data if int(coin.balance) >= amount_required),
        None,
    )

    if sufficient_coin:
        # Use the coin that has enough balance
        if int(sufficient_coin.balance) == amount_required:
            # Use the coin directly if it has the exact amount
            payment_coin = ObjectID(sufficient_coin.object_id)
        else:
            # Split the coin to get the exact amount needed
            split_coin = txn.split_coin(coin=ObjectID(sufficient_coin.object_id), amounts=[amount_required])
            payment_coin = split_coin
    else:
        # Need to merge coins first
        target_coin = coin_data[0]
        # Merge other coins into the target
        txn.merge_coins(merge_to=ObjectID(target_coin.object_id), merge_from=[ObjectID(c.object_id) for c in coin_data[1:]])
        # Split the exact amount from the merged coin
        split_coin = txn.split_coin(coin=ObjectID(target_coin.object_id), amounts=[amount_required])
        payment_coin = split_coin

    # Call the contract's make_payment function
    txn.move_call(
        target=f"{package_id}::payments::make_payment",
        arguments=[
            payment_coin,                    # paymentCoin (Coin object)
            SuiU64(amount_required),        # expectedAmount (u64)
            SuiAddress(recipient),          # recipient (address)
            nonce_bytes,                    # invoiceId (vector<u8> as list of bytes)
        ],
        type_arguments=[coin_type]          # Coin type parameter
    )

    # Build the transaction to get the bytes (but don't sign yet)
    base64_tx_bytes = txn.deferred_execution()

    return {
        "x402Version": x402_version,
        "scheme": payment_requirements.scheme,
        "network": payment_requirements.network,
        "payload": {
            "transaction": base64_tx_bytes,  # Base64 encoded transaction bytes
            "signature": None,  # Will be added during signing
        },
    }


def sign_payment_header(
    account: Union[Account, "SyncClient"], payment_requirements: PaymentRequirements, header: PaymentHeader
) -> str:
    """Sign a payment header using the appropriate method based on the network.

    Args:
        account: Either an eth_account.Account for EVM networks or pysui.SyncClient for Sui networks
        payment_requirements: The payment requirements
        header: Pre-built unsigned header from prepare_payment_header

    Returns:
        Base64 encoded payment header string
    """
    network = payment_requirements.network.lower()

    # Check if it's a Sui network
    if network in ['sui', 'sui-testnet']:
        return _sign_payment_header_sui(account, header)
    else:
        return _sign_payment_header_evm(account, payment_requirements, header)


def _sign_payment_header_evm(
    account: Account, payment_requirements: PaymentRequirements, header: PaymentHeader
) -> str:
    """Sign a payment header for EVM networks using the account's private key."""
    auth = header["payload"]["authorization"]

    nonce_bytes = bytes.fromhex(auth["nonce"])

    typed_data = {
        "types": {
            "TransferWithAuthorization": [
                {"name": "from", "type": "address"},
                {"name": "to", "type": "address"},
                {"name": "value", "type": "uint256"},
                {"name": "validAfter", "type": "uint256"},
                {"name": "validBefore", "type": "uint256"},
                {"name": "nonce", "type": "bytes32"},
            ]
        },
        "primaryType": "TransferWithAuthorization",
        "domain": {
            "name": payment_requirements.extra["name"],
            "version": payment_requirements.extra["version"],
            "chainId": int(get_chain_id(payment_requirements.network)),
            "verifyingContract": payment_requirements.asset,
        },
        "message": {
            "from": auth["from"],
            "to": auth["to"],
            "value": int(auth["value"]),
            "validAfter": int(auth["validAfter"]),
            "validBefore": int(auth["validBefore"]),
            "nonce": nonce_bytes,
        },
    }

    signed_message = account.sign_typed_data(
        domain_data=typed_data["domain"],
        message_types=typed_data["types"],
        message_data=typed_data["message"],
    )
    signature = signed_message.signature.hex()
    if not signature.startswith("0x"):
        signature = f"0x{signature}"

    header["payload"]["signature"] = signature

    header["payload"]["authorization"]["nonce"] = f"0x{auth['nonce']}"

    return encode_payment(header)


def _sign_payment_header_sui(
    client: "SyncClient", header: PaymentHeader
) -> str:
    """Sign a payment header for Sui networks using pysui client.

    Takes the prepared transaction bytes and adds the signature.
    """
    # Get the transaction bytes from the prepared header
    base64_tx_bytes = header["payload"]["transaction"]

    # We need to recreate a transaction to get its signer block
    # since we can't serialize the transaction object itself
    temp_txn = client.transaction(initial_sender=client.config.active_address)

    # Get signature using the transaction's signer block
    signature = (
        temp_txn.signer_block.get_signatures(client=client, tx_bytes=base64_tx_bytes)
        .array[0]
        .signature
    )

    # Update the header with the signature
    header["payload"]["signature"] = signature

    # Encode and return
    return encode_payment(header)


def encode_payment(payment_payload: Union[Dict[str, Any], PaymentHeader]) -> str:
    """Encode a payment payload into a base64 string, handling HexBytes and other non-serializable types."""
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
    """Decode a base64 encoded payment string back into a PaymentPayload object."""
    return json.loads(safe_base64_decode(encoded_payment))


def prepare_batch_payment_header(
    client: "SyncClient", x402_version: int, payment_requirements_list: list[PaymentRequirements]
) -> Dict[str, Any]:
    """Prepare a batch payment header for multiple payments in a single SUI transaction.

    This function creates a single transaction that handles multiple payments by:
    1. Calculating total amounts needed per asset type
    2. Finding or merging coins to create sufficient balances
    3. Splitting coins as needed for each payment
    4. Making multiple move calls for each payment

    Args:
        client: SUI client for transaction building
        x402_version: X402 protocol version
        payment_requirements_list: List of payment requirements to process in batch

    Returns:
        Payment header dict with transaction ready for signing
    """
    if not _has_pysui:
        raise ImportError(
            "pysui library is required for Sui networks. Please install it via 'pip install pysui'."
        )

    if not payment_requirements_list:
        raise ValueError("Payment requirements list cannot be empty")

    # Validate that all payments are for the same network
    networks = {req.network for req in payment_requirements_list}
    if len(networks) > 1:
        raise ValueError(f"All payments must be for the same network. Found: {networks}")

    network = payment_requirements_list[0].network
    sender = client.config.active_address
    package_id = get_sui_package_id(network)

    # Create transaction
    txn = client.transaction(initial_sender=sender)

    # Group payments by asset type and calculate total amounts needed
    asset_totals = {}  # asset_type -> total_amount_needed
    payments_by_asset: dict[str, list[tuple[PaymentRequirements, int]]] = {}  # asset_type -> list of (requirements, index)

    for i, req in enumerate(payment_requirements_list):
        asset_type = req.asset
        amount = int(req.max_amount_required)

        if asset_type not in asset_totals:
            asset_totals[asset_type] = 0
            payments_by_asset[asset_type] = []

        asset_totals[asset_type] += amount
        payments_by_asset[asset_type].append((req, i))

    # Prepare source coins for each asset type (find or merge to get sufficient balance)
    source_coins = {}  # asset_type -> source_coin_object

    for asset_type, total_needed in asset_totals.items():
        # Get all coins of this asset type
        coin_data = []
        q_res = client.execute(GetCoins(owner=sender, coin_type=asset_type))
        while q_res.is_ok() and q_res.result_data.data:
            coin_data.extend(q_res.result_data.data)
            if q_res.result_data.next_cursor:
                q_res = client.execute(
                    GetCoins(
                        owner=sender,
                        coin_type=asset_type,
                        cursor=q_res.result_data.next_cursor,
                    )
                )
            else:
                break

        if not coin_data:
            raise Exception(f"No coins of type {asset_type} found for address {sender}")

        # Check total balance
        total_balance = sum(int(coin.balance) for coin in coin_data)
        if total_balance < total_needed:
            raise Exception(
                f"Insufficient balance for {asset_type}. Required: {total_needed}, Available: {total_balance}"
            )

        # Find or create a source coin with sufficient balance
        sufficient_coin = next(
            (coin for coin in coin_data if int(coin.balance) >= total_needed),
            None,
        )

        if sufficient_coin:
            # Use the sufficient coin as source
            source_coins[asset_type] = ObjectID(sufficient_coin.object_id)
        else:
            # Need to merge coins first to get sufficient balance
            target_coin = coin_data[0]
            # Merge other coins into target
            txn.merge_coins(
                merge_to=ObjectID(target_coin.object_id),
                merge_from=[ObjectID(c.object_id) for c in coin_data[1:]]
            )
            source_coins[asset_type] = ObjectID(target_coin.object_id)

    # Split all coins for each asset type in one batch, maintaining proper mapping
    payment_coins = {}  # original_index -> split_coin_object

    for asset_type, payments in payments_by_asset.items():
        source_coin = source_coins[asset_type]

        # Collect amounts and preserve original indices for this asset type
        amounts = []
        original_indices = []
        for req, orig_idx in payments:
            amounts.append(int(req.max_amount_required))
            original_indices.append(orig_idx)

        # Do a single split_coin call with all amounts for this asset type
        split_coins = txn.split_coin(coin=source_coin, amounts=amounts)

        # Map each split coin back to its original payment index
        for split_idx, orig_idx in enumerate(original_indices):
            payment_coins[orig_idx] = split_coins[split_idx]

    # Now make payment calls in original order using the properly mapped split coins
    for i, req in enumerate(payment_requirements_list):
        asset_type = req.asset
        amount_required = int(req.max_amount_required)
        recipient = req.pay_to
        nonce = req.extra.get('nonce', '') if req.extra else ''
        nonce_bytes = list(nonce.encode('utf-8'))

        # Get the split coin that corresponds to this original payment index
        payment_coin = payment_coins[i]

        # Call the contract's make_payment function
        txn.move_call(
            target=f"{package_id}::payments::make_payment",
            arguments=[
                payment_coin,                   # paymentCoin (Coin object)
                SuiU64(amount_required),       # expectedAmount (u64)
                SuiAddress(recipient),         # recipient (address)
                nonce_bytes,                   # invoiceId (vector<u8>)
            ],
            type_arguments=[asset_type]        # Coin type parameter
        )

    # Build the transaction bytes (but don't sign yet)
    base64_tx_bytes = txn.deferred_execution()

    return {
        "x402Version": x402_version,
        "scheme": payment_requirements_list[0].scheme,  # Assume all same scheme
        "network": network,
        "payload": {
            "transaction": base64_tx_bytes,
            "signature": None,  # Will be added during signing
        },
    }
