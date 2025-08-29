"""
Utility functions for wallet policy management and conversion.
"""

from typing import Optional, Union, Dict
import math
from x402.types import (
    Money, Price, TokenAmount, WalletPolicy, PaymentPolicy, 
    AssetPolicy, USDC_ADDRESSES, TokenAsset, EIP712Domain
)


def convert_max_value_to_policy(max_value: int) -> WalletPolicy:
    """
    Converts a legacy max_value (int) to a WalletPolicy.
    
    Args:
        max_value: Maximum payment amount in atomic units
        
    Returns:
        WalletPolicy with equivalent limits
    """
    # Convert atomic units to Money string format (assuming USDC with 6 decimals)
    dollar_amount: Money = f"${max_value / 10**6:.2f}"
    
    return WalletPolicy(
        payments=PaymentPolicy(
            networks={
                "base": dollar_amount,
                "base-sepolia": dollar_amount  # Support both mainnet and testnet
            }
        )
    )


def get_default_policy() -> WalletPolicy:
    """
    Gets the default policy (equivalent to 0.1 USDC limit on base-sepolia).
    
    Returns:
        Default WalletPolicy
    """
    return WalletPolicy(
        payments=PaymentPolicy(
            networks={
                "base-sepolia": "$0.10"  # Default to testnet for safety
            }
        )
    )


def process_unified_parameter(
    policy_or_max_value: Optional[Union[WalletPolicy, int]] = None
) -> WalletPolicy:
    """
    Processes the unified parameter and returns an effective policy.
    
    Args:
        policy_or_max_value: Either a WalletPolicy or legacy max_value int
        
    Returns:
        Effective WalletPolicy
    """
    if isinstance(policy_or_max_value, int):
        print(
            "Warning: Passing int directly is deprecated. Consider using WalletPolicy "
            "format for more flexibility. See https://docs.x402.dev/migration-guide for details."
        )
        return convert_max_value_to_policy(policy_or_max_value)
    elif isinstance(policy_or_max_value, WalletPolicy):
        return policy_or_max_value
    else:
        return get_default_policy()


def parse_money_to_atomic_units(money: Money, decimals: int) -> str:
    """
    Parses Money to atomic units.
    
    Args:
        money: Money value (string or numeric)
        decimals: Token decimals
        
    Returns:
        String representation of atomic units
    """
    money_str = str(money)
    
    if money_str.startswith('$'):
        # Parse dollar amount: "$0.10" -> atomic units
        value = float(money_str[1:])
        return str(int(math.floor(value * 10 ** decimals)))
    
    # Parse as decimal token amount: "1.5" -> atomic units  
    value = float(money_str)
    return str(int(math.floor(value * 10 ** decimals)))


def expand_money_to_network_policy(network: str, money: Money) -> Dict[str, AssetPolicy]:
    """
    Expands Money shorthand to a complete NetworkPolicy using USDC.
    
    Args:
        network: Network name (e.g., "base")
        money: Money shorthand (e.g., "$0.10")
        
    Returns:
        NetworkPolicy dictionary
        
    Raises:
        ValueError: If network doesn't support Money shorthand
    """
    usdc_address = USDC_ADDRESSES.get(network)
    if not usdc_address:
        raise ValueError(f"Money shorthand not supported for network: {network}")
    
    # Create TokenAmount using existing types
    token_amount = TokenAmount(
        amount=parse_money_to_atomic_units(money, 6),  # USDC has 6 decimals
        asset=TokenAsset(
            address=usdc_address,
            decimals=6,
            eip712=EIP712Domain(
                name="USD Coin",
                version="2"
            )
        )
    )
    
    return {
        usdc_address: AssetPolicy(limit=token_amount)
    }


def validate_payment_against_policy(
    network: str,
    asset: str, 
    amount: int,
    effective_policy: WalletPolicy
) -> bool:
    """
    Validates a payment amount against the effective policy.
    
    Args:
        network: Network name
        asset: Asset address
        amount: Payment amount in atomic units
        effective_policy: The effective wallet policy
        
    Returns:
        True if payment is allowed, False otherwise
    """
    if not effective_policy.payments:
        return False
        
    network_policy = effective_policy.payments.networks.get(network)
    if not network_policy:
        return False
    
    # Handle shorthand (Money) vs full format (Dict[str, AssetPolicy])
    if isinstance(network_policy, (str, int, float)):
        # This is Money shorthand - expand and validate
        expanded_policy = expand_money_to_network_policy(network, network_policy)
        return _validate_asset_limit(asset, amount, expanded_policy)
    else:
        # This is a NetworkPolicy dict - validate against specific asset policy
        return _validate_asset_limit(asset, amount, network_policy)


def _validate_asset_limit(
    asset: str,
    amount: int,
    network_policy: Union[Dict[str, AssetPolicy], Dict[str, AssetPolicy]]
) -> bool:
    """
    Validates an asset amount against its policy limit.
    
    Args:
        asset: Asset address
        amount: Payment amount in atomic units
        network_policy: Network policy configuration
        
    Returns:
        True if within limits, False otherwise
    """
    # Handle special case for native currency
    if "native" in network_policy:
        asset_policy = network_policy["native"]
    else:
        asset_policy = network_policy.get(asset)
    
    if not asset_policy or not asset_policy.limit:
        return False  # No policy means not allowed
    
    # Convert limit to int for comparison
    if isinstance(asset_policy.limit, (str, int, float)):
        # It's Money - parse to atomic units
        # Assume 6 decimals for USDC, 18 for others
        decimals = 6 if 'usdc' in asset.lower() else 18
        limit_amount = int(parse_money_to_atomic_units(asset_policy.limit, decimals))
    else:
        # It's TokenAmount
        limit_amount = int(asset_policy.limit.amount)
    
    return amount <= limit_amount