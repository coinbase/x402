"""Unit tests for Stellar split scheme."""

import pytest

from x402.mechanisms.stellar.constants import USDC_TESTNET_ADDRESS
from x402.mechanisms.stellar.split.constants import SCHEME_SPLIT
from x402.mechanisms.stellar.split.types import (
    StellarSplitRecipient,
    StellarSplitConfig,
    calculate_split_amounts,
)
from x402.mechanisms.stellar.split.server import SplitStellarServer


# --- Split Types Tests ---


class TestStellarSplitRecipient:
    def test_valid_recipient(self):
        r = StellarSplitRecipient(address="GABC", bps=5000)
        assert r.address == "GABC"
        assert r.bps == 5000

    def test_invalid_bps_zero(self):
        r = StellarSplitRecipient(address="GABC", bps=0)
        with pytest.raises(ValueError, match="bps must be 1-10000"):
            r.validate()

    def test_invalid_bps_over(self):
        r = StellarSplitRecipient(address="GABC", bps=10001)
        with pytest.raises(ValueError, match="bps must be 1-10000"):
            r.validate()

    def test_empty_address(self):
        r = StellarSplitRecipient(address="", bps=5000)
        with pytest.raises(ValueError, match="cannot be empty"):
            r.validate()


class TestStellarSplitConfig:
    def test_valid_config(self):
        config = StellarSplitConfig(recipients=[
            StellarSplitRecipient(address="GABC", bps=7000),
            StellarSplitRecipient(address="GDEF", bps=3000),
        ])
        config.validate()  # Should not raise

    def test_bps_not_10000(self):
        config = StellarSplitConfig(recipients=[
            StellarSplitRecipient(address="GABC", bps=5000),
            StellarSplitRecipient(address="GDEF", bps=3000),
        ])
        with pytest.raises(ValueError, match="must sum to 10000"):
            config.validate()

    def test_empty_recipients(self):
        config = StellarSplitConfig(recipients=[])
        with pytest.raises(ValueError, match="At least one"):
            config.validate()

    def test_from_dict(self):
        config = StellarSplitConfig.from_dict({
            "recipients": [
                {"address": "GABC", "bps": 7000},
                {"address": "GDEF", "bps": 3000},
            ]
        })
        assert len(config.recipients) == 2
        assert config.recipients[0].bps == 7000


# --- Split Calculation Tests ---


class TestCalculateSplitAmounts:
    def test_even_split(self):
        recipients = [
            StellarSplitRecipient(address="GA", bps=5000),
            StellarSplitRecipient(address="GB", bps=5000),
        ]
        splits = calculate_split_amounts(10000000, recipients)
        assert splits == [("GA", 5000000), ("GB", 5000000)]

    def test_uneven_split(self):
        recipients = [
            StellarSplitRecipient(address="GA", bps=7000),
            StellarSplitRecipient(address="GB", bps=2000),
            StellarSplitRecipient(address="GC", bps=1000),
        ]
        splits = calculate_split_amounts(10000000, recipients)
        assert splits == [("GA", 7000000), ("GB", 2000000), ("GC", 1000000)]

    def test_dust_to_first(self):
        recipients = [
            StellarSplitRecipient(address="GA", bps=3333),
            StellarSplitRecipient(address="GB", bps=3333),
            StellarSplitRecipient(address="GC", bps=3334),
        ]
        splits = calculate_split_amounts(10000000, recipients)
        total = sum(amt for _, amt in splits)
        assert total == 10000000  # No loss

    def test_single_recipient(self):
        recipients = [
            StellarSplitRecipient(address="GA", bps=10000),
        ]
        splits = calculate_split_amounts(10000000, recipients)
        assert splits == [("GA", 10000000)]

    def test_small_amount_large_split(self):
        recipients = [
            StellarSplitRecipient(address="GA", bps=5000),
            StellarSplitRecipient(address="GB", bps=5000),
        ]
        splits = calculate_split_amounts(1, recipients)
        # 1 * 5000 / 10000 = 0 for both, dust = 1 goes to first
        total = sum(amt for _, amt in splits)
        assert total == 1

    def test_zero_amount(self):
        recipients = [
            StellarSplitRecipient(address="GA", bps=10000),
        ]
        splits = calculate_split_amounts(0, recipients)
        assert splits == [("GA", 0)]


# --- Split Server Tests ---


class TestSplitStellarServer:
    def _valid_recipients(self):
        return [
            {"address": "GBHEGW3KWOY2OFH767EDALFGCUTBOEVBDQMCKU4APMDLQNBW5QV3W3KO", "bps": 7000},
            {"address": "GCKXFPOUARUBXPTJMEVPFX7YGTHNQH7WMFQIOJBVLZOVKQLMFFHFLPBJ", "bps": 3000},
        ]

    def test_create_requirements(self):
        server = SplitStellarServer()
        req = server.create_payment_requirements(
            network="stellar:testnet",
            asset=USDC_TESTNET_ADDRESS,
            pay_to="GBHEGW3KWOY2OFH767EDALFGCUTBOEVBDQMCKU4APMDLQNBW5QV3W3KO",
            amount="10000000",
            recipients=self._valid_recipients(),
        )
        assert req["scheme"] == "split"
        assert req["extra"]["recipients"] == self._valid_recipients()
        assert req["extra"]["areFeesSponsored"] is True

    def test_invalid_bps_sum(self):
        server = SplitStellarServer()
        with pytest.raises(ValueError, match="must sum to 10000"):
            server.create_payment_requirements(
                network="stellar:testnet",
                asset=USDC_TESTNET_ADDRESS,
                pay_to="GBHEGW3KWOY2OFH767EDALFGCUTBOEVBDQMCKU4APMDLQNBW5QV3W3KO",
                amount="10000000",
                recipients=[
                    {"address": "GBHEGW3KWOY2OFH767EDALFGCUTBOEVBDQMCKU4APMDLQNBW5QV3W3KO", "bps": 5000},
                ],
            )

    def test_no_recipients(self):
        server = SplitStellarServer()
        with pytest.raises(ValueError, match="At least one"):
            server.create_payment_requirements(
                network="stellar:testnet",
                asset=USDC_TESTNET_ADDRESS,
                pay_to="GBHEGW3KWOY2OFH767EDALFGCUTBOEVBDQMCKU4APMDLQNBW5QV3W3KO",
                amount="10000000",
                recipients=[],
            )

    def test_invalid_recipient_address(self):
        server = SplitStellarServer()
        with pytest.raises(ValueError, match="Invalid recipient"):
            server.create_payment_requirements(
                network="stellar:testnet",
                asset=USDC_TESTNET_ADDRESS,
                pay_to="GBHEGW3KWOY2OFH767EDALFGCUTBOEVBDQMCKU4APMDLQNBW5QV3W3KO",
                amount="10000000",
                recipients=[
                    {"address": "NOT_VALID", "bps": 10000},
                ],
            )

    def test_human_readable_amount(self):
        server = SplitStellarServer()
        req = server.create_payment_requirements(
            network="stellar:testnet",
            asset=USDC_TESTNET_ADDRESS,
            pay_to="GBHEGW3KWOY2OFH767EDALFGCUTBOEVBDQMCKU4APMDLQNBW5QV3W3KO",
            amount=1,  # 1 USDC
            recipients=self._valid_recipients(),
        )
        assert req["amount"] == "10000000"  # 1 * 10^7

    def test_scheme_identifier(self):
        assert SCHEME_SPLIT == "split"
