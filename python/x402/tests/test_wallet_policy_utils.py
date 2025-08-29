import pytest
from eth_account import Account
from x402.wallet_policy_utils import (
    convert_max_value_to_policy,
    get_default_policy,
    process_unified_parameter,
    parse_money_to_atomic_units,
    expand_money_to_network_policy,
    validate_payment_against_policy,
)
from x402.types import (
    WalletPolicy,
    PaymentPolicy,
    AssetPolicy,
    TokenAmount,
    TokenAsset,
    EIP712Domain,
)


def test_convert_max_value_to_policy():
    # Test conversion of legacy max_value to policy
    policy = convert_max_value_to_policy(100000)  # 0.1 USDC in atomic units

    assert policy.payments is not None
    assert "base" in policy.payments.networks
    assert "base-sepolia" in policy.payments.networks
    assert policy.payments.networks["base"] == "$0.10"
    assert policy.payments.networks["base-sepolia"] == "$0.10"


def test_get_default_policy():
    # Test default policy creation
    policy = get_default_policy()

    assert policy.payments is not None
    assert "base-sepolia" in policy.payments.networks
    assert policy.payments.networks["base-sepolia"] == "$0.10"
    # Should not have mainnet base by default
    assert "base" not in policy.payments.networks


def test_process_unified_parameter():
    # Test processing None parameter
    policy = process_unified_parameter(None)
    assert policy.payments.networks["base-sepolia"] == "$0.10"

    # Test processing int parameter (legacy)
    policy = process_unified_parameter(50000)  # 0.05 USDC
    assert "base" in policy.payments.networks
    assert "base-sepolia" in policy.payments.networks
    assert policy.payments.networks["base"] == "$0.05"

    # Test processing WalletPolicy parameter
    custom_policy = WalletPolicy(payments=PaymentPolicy(networks={"base": "$0.20"}))
    policy = process_unified_parameter(custom_policy)
    assert policy == custom_policy


def test_parse_money_to_atomic_units():
    # Test dollar amount parsing
    result = parse_money_to_atomic_units("$0.10", 6)  # USDC has 6 decimals
    assert result == "100000"

    # Test decimal amount parsing
    result = parse_money_to_atomic_units("1.5", 18)  # ETH has 18 decimals
    assert result == "1500000000000000000"

    # Test integer parsing
    result = parse_money_to_atomic_units("1", 6)
    assert result == "1000000"


def test_expand_money_to_network_policy():
    # Test expansion for supported network
    policy = expand_money_to_network_policy("base-sepolia", "$0.10")

    usdc_address = "0x036CbD53842c5426634e7929541eC2318f3dCF7e"
    assert usdc_address in policy
    assert isinstance(policy[usdc_address], AssetPolicy)
    assert isinstance(policy[usdc_address].limit, TokenAmount)
    assert policy[usdc_address].limit.amount == "100000"  # 0.10 USDC in atomic units

    # Test unsupported network
    with pytest.raises(ValueError, match="Money shorthand not supported for network"):
        expand_money_to_network_policy("unsupported-network", "$0.10")


def test_validate_payment_against_policy():
    # Test payment within policy limits
    policy = WalletPolicy(payments=PaymentPolicy(networks={"base-sepolia": "$0.50"}))

    # Payment of 0.1 USDC should be allowed (within 0.50 limit)
    result = validate_payment_against_policy(
        network="base-sepolia",
        asset="0x036CbD53842c5426634e7929541eC2318f3dCF7e",
        amount=100000,  # 0.1 USDC in atomic units
        effective_policy=policy,
    )
    assert result is True

    # Payment of 1.0 USDC should be rejected (exceeds 0.50 limit)
    result = validate_payment_against_policy(
        network="base-sepolia",
        asset="0x036CbD53842c5426634e7929541eC2318f3dCF7e",
        amount=1000000,  # 1.0 USDC in atomic units
        effective_policy=policy,
    )
    assert result is False

    # Payment to unsupported network should be rejected
    result = validate_payment_against_policy(
        network="avalanche",
        asset="0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48",
        amount=100000,
        effective_policy=policy,
    )
    assert result is False


def test_validate_payment_explicit_asset_policy():
    # Test with explicit asset policy (not shorthand)
    policy = WalletPolicy(
        payments=PaymentPolicy(
            networks={
                "base-sepolia": {
                    "0x036CbD53842c5426634e7929541eC2318f3dCF7e": AssetPolicy(
                        limit=TokenAmount(
                            amount="200000",  # 0.2 USDC
                            asset=TokenAsset(
                                address="0x036CbD53842c5426634e7929541eC2318f3dCF7e",
                                decimals=6,
                                eip712=EIP712Domain(name="USD Coin", version="2"),
                            ),
                        )
                    )
                }
            }
        )
    )

    # Payment within limit should be allowed
    result = validate_payment_against_policy(
        network="base-sepolia",
        asset="0x036CbD53842c5426634e7929541eC2318f3dCF7e",
        amount=150000,  # 0.15 USDC
        effective_policy=policy,
    )
    assert result is True

    # Payment exceeding limit should be rejected
    result = validate_payment_against_policy(
        network="base-sepolia",
        asset="0x036CbD53842c5426634e7929541eC2318f3dCF7e",
        amount=250000,  # 0.25 USDC
        effective_policy=policy,
    )
    assert result is False


def test_policy_with_no_payments():
    # Test policy with no payments section
    policy = WalletPolicy()  # Empty policy

    result = validate_payment_against_policy(
        network="base-sepolia",
        asset="0x036CbD53842c5426634e7929541eC2318f3dCF7e",
        amount=100000,
        effective_policy=policy,
    )
    assert result is False


def test_money_shorthand_different_networks():
    # Test shorthand expansion for different networks
    base_policy = expand_money_to_network_policy("base", "$0.10")
    sepolia_policy = expand_money_to_network_policy("base-sepolia", "$0.10")

    # Should use different USDC addresses
    assert (
        "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913" in base_policy
    )  # Base mainnet USDC
    assert (
        "0x036CbD53842c5426634e7929541eC2318f3dCF7e" in sepolia_policy
    )  # Base sepolia USDC

    # But same amount
    base_amount = base_policy["0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913"].limit.amount
    sepolia_amount = sepolia_policy[
        "0x036CbD53842c5426634e7929541eC2318f3dCF7e"
    ].limit.amount
    assert base_amount == sepolia_amount == "100000"


def test_legacy_conversion_warning(capsys):
    # Test that deprecated warning is shown for int parameter
    process_unified_parameter(100000)

    captured = capsys.readouterr()
    assert "Warning: Passing int directly is deprecated" in captured.out
