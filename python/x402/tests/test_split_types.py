"""Tests for the x402 split payment scheme types."""

import pytest

from x402.mechanisms.evm.split.types import SplitConfig, SplitRecipient


class TestSplitRecipient:
    """Tests for SplitRecipient dataclass."""

    def test_to_dict_with_label(self):
        r = SplitRecipient(address="0xABC", bps=7000, label="artist")
        d = r.to_dict()
        assert d == {"address": "0xABC", "bps": 7000, "label": "artist"}

    def test_to_dict_without_label(self):
        r = SplitRecipient(address="0xABC", bps=7000)
        d = r.to_dict()
        assert d == {"address": "0xABC", "bps": 7000}
        assert "label" not in d

    def test_from_dict(self):
        r = SplitRecipient.from_dict({"address": "0xABC", "bps": 7000, "label": "artist"})
        assert r.address == "0xABC"
        assert r.bps == 7000
        assert r.label == "artist"

    def test_from_dict_no_label(self):
        r = SplitRecipient.from_dict({"address": "0xABC", "bps": 7000})
        assert r.label == ""


class TestSplitConfig:
    """Tests for SplitConfig validation and share calculation."""

    def _make_config(self, bps_list):
        return SplitConfig(
            recipients=[
                SplitRecipient(address=f"0x{i:040x}", bps=bps)
                for i, bps in enumerate(bps_list)
            ]
        )

    def test_valid_single_recipient(self):
        config = self._make_config([10000])
        config.validate()  # Should not raise

    def test_valid_three_recipients(self):
        config = self._make_config([7000, 2000, 1000])
        config.validate()  # Should not raise

    def test_invalid_empty(self):
        config = SplitConfig(recipients=[])
        with pytest.raises(ValueError, match="at least 1"):
            config.validate()

    def test_invalid_bps_sum(self):
        config = self._make_config([7000, 2000])  # Sum = 9000
        with pytest.raises(ValueError, match="sum to 10000"):
            config.validate()

    def test_invalid_bps_zero(self):
        config = self._make_config([10000, 0])
        with pytest.raises(ValueError, match="1-10000"):
            config.validate()

    def test_invalid_bps_negative(self):
        config = SplitConfig(
            recipients=[SplitRecipient(address="0xABC", bps=-1)]
        )
        with pytest.raises(ValueError):
            config.validate()

    # ── Share calculation ──────────────────────────────────────────────

    def test_shares_exact_division(self):
        config = self._make_config([5000, 3000, 2000])
        shares = config.calculate_shares(100000)
        amounts = [s[1] for s in shares]
        assert amounts == [50000, 30000, 20000]
        assert sum(amounts) == 100000

    def test_shares_with_remainder(self):
        config = self._make_config([3333, 3333, 3334])
        shares = config.calculate_shares(100000)
        amounts = [s[1] for s in shares]
        # 3333*100000/10000 = 33330, 3333*100000/10000 = 33330
        # Last gets remainder: 100000 - 33330 - 33330 = 33340
        assert amounts[0] == 33330
        assert amounts[1] == 33330
        assert amounts[2] == 33340
        assert sum(amounts) == 100000

    def test_shares_single_recipient(self):
        config = self._make_config([10000])
        shares = config.calculate_shares(100000)
        assert shares == [(f"0x{0:040x}", 100000)]

    def test_shares_small_amount(self):
        """Test with very small amount where rounding matters."""
        config = self._make_config([7000, 2000, 1000])
        shares = config.calculate_shares(10)  # 10 micro-USDC
        amounts = [s[1] for s in shares]
        assert amounts[0] == 7   # floor(10 * 7000 / 10000) = 7
        assert amounts[1] == 2   # floor(10 * 2000 / 10000) = 2
        assert amounts[2] == 1   # remainder: 10 - 7 - 2 = 1
        assert sum(amounts) == 10

    def test_shares_addresses_preserved(self):
        config = self._make_config([7000, 2000, 1000])
        shares = config.calculate_shares(100000)
        addresses = [s[0] for s in shares]
        assert addresses[0] == f"0x{0:040x}"
        assert addresses[1] == f"0x{1:040x}"
        assert addresses[2] == f"0x{2:040x}"

    # ── Serialization ─────────────────────────────────────────────────

    def test_round_trip(self):
        config = self._make_config([7000, 2000, 1000])
        dicts = config.to_dict_list()
        config2 = SplitConfig.from_dict_list(dicts)
        assert len(config2.recipients) == 3
        assert config2.recipients[0].bps == 7000
        assert config2.recipients[1].bps == 2000
        assert config2.recipients[2].bps == 1000
