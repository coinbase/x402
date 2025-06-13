from decimal import Decimal
from x402.chains import get_chain_id, get_token_decimals


def parse_money(amount: str | int, address: str, network_id: str) -> int:
    """Parse money string or int into int

    Params:
        amount: str | int - if int, should be the full amount including token specific decimals
    """
    if isinstance(amount, str):
        if amount.startswith("$"):
            amount = amount[1:]
        amount = Decimal(amount)

        chain_id = get_chain_id(network_id)
        decimals = get_token_decimals(chain_id, address)
        amount = amount * Decimal(10**decimals)
        return int(amount)
    return amount


x402_VERSION = 1
