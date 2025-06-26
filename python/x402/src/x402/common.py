from decimal import Decimal

from x402.chains import (
    get_chain_id,
    get_token_decimals,
    get_token_name,
    get_token_version,
)
from x402.types import Price, TokenAmount


def parse_money(amount: str | int, address: str, network: str) -> int:
    """Parse money string or int into int

    Params:
        amount: str | int - if int, should be the full amount including token specific decimals
    """
    if isinstance(amount, str):
        if amount.startswith("$"):
            amount = amount[1:]
        amount = Decimal(amount)

        chain_id = get_chain_id(network)
        decimals = get_token_decimals(chain_id, address)
        amount = amount * Decimal(10**decimals)
        return int(amount)
    return amount


def process_price_to_atomic_amount(
    price: Price, network: str
) -> tuple[str, str, dict[str, str]]:
    """Process a Price into atomic amount, asset address, and EIP-712 domain info

    Args:
        price: Either Money (USD string/int) or TokenAmount
        network: Network identifier

    Returns:
        Tuple of (max_amount_required, asset_address, eip712_domain)

    Raises:
        ValueError: If price format is invalid
    """
    if isinstance(price, (str, int)):
        # Money type - convert USD to USDC atomic units
        try:
            if isinstance(price, str) and price.startswith("$"):
                price = price[1:]
            amount = Decimal(str(price))

            # Get USDC address for the network
            chain_id = get_chain_id(network)
            asset_address = get_usdc_address(chain_id)
            decimals = get_token_decimals(chain_id, asset_address)

            # Convert to atomic units
            atomic_amount = int(amount * Decimal(10**decimals))

            # Get EIP-712 domain info
            eip712_domain = {
                "name": get_token_name(chain_id, asset_address),
                "version": get_token_version(chain_id, asset_address),
            }

            return str(atomic_amount), asset_address, eip712_domain

        except (ValueError, KeyError) as e:
            raise ValueError(f"Invalid price format: {price}. Error: {e}")

    elif isinstance(price, TokenAmount):
        # TokenAmount type - already in atomic units with asset info
        return (
            price.amount,
            price.asset.address,
            {
                "name": price.asset.eip712.name,
                "version": price.asset.eip712.version,
            },
        )

    else:
        raise ValueError(f"Invalid price type: {type(price)}")


def get_usdc_address(chain_id: int | str) -> str:
    """Get the USDC contract address for a given chain ID"""
    if isinstance(chain_id, str):
        chain_id = int(chain_id)
    if chain_id == 84532:  # Base Sepolia testnet
        return "0x036CbD53842c5426634e7929541eC2318f3dCF7e"
    elif chain_id == 8453:  # Base mainnet
        return "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913"
    elif chain_id == 43113:  # Avalanche Fuji testnet
        return "0x5425890298aed601595a70AB815c96711a31Bc65"
    elif chain_id == 43114:  # Avalanche mainnet
        return "0xB97EF9Ef8734C71904D8002F8b6Bc66Dd9c48a6E"
    raise ValueError(f"Unsupported chain ID: {chain_id}")


x402_VERSION = 1
