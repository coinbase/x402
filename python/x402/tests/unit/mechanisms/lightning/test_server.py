"""Tests for Lightning exact server."""

import pytest

from x402.mechanisms.lightning.constants import ASSET_BTC, LIGHTNING_REGTEST, SCHEME_EXACT
from x402.mechanisms.lightning.exact import ExactLightningServerScheme
from x402.mechanisms.lightning.exact.mock import MockLightningBackend
from x402.schemas import AssetAmount, PaymentRequirements, SupportedKind


@pytest.fixture
def server_scheme() -> ExactLightningServerScheme:
    return ExactLightningServerScheme(MockLightningBackend())


def test_parse_price_asset_amount_passthrough(server_scheme: ExactLightningServerScheme) -> None:
    aa = AssetAmount(amount="1000", asset="BTC", extra={})
    out = server_scheme.parse_price(aa, LIGHTNING_REGTEST)
    assert out.amount == "1000"
    assert out.asset == "BTC"


def test_parse_price_btc_to_msat(server_scheme: ExactLightningServerScheme) -> None:
    out = server_scheme.parse_price(0.000001, LIGHTNING_REGTEST)
    assert out.asset == ASSET_BTC
    assert int(out.amount) == 100_000


def test_parse_price_rejects_usd_string(server_scheme: ExactLightningServerScheme) -> None:
    with pytest.raises(ValueError, match="USD"):
        server_scheme.parse_price("$1.00", LIGHTNING_REGTEST)


def test_enhance_sets_btc_invoice_and_pay_to(server_scheme: ExactLightningServerScheme) -> None:
    pytest.importorskip("bolt11")
    req = PaymentRequirements(
        scheme=SCHEME_EXACT,
        network=LIGHTNING_REGTEST,
        asset="ignored",
        amount="10000",
        pay_to="ignored",
        max_timeout_seconds=120,
        extra={},
    )
    sk = SupportedKind(
        x402_version=2,
        scheme=SCHEME_EXACT,
        network=LIGHTNING_REGTEST,
        extra={},
    )
    out = server_scheme.enhance_payment_requirements(req, sk, [])
    assert out.asset == ASSET_BTC
    assert out.pay_to
    assert out.extra.get("invoice", "").startswith("lnbcrt")
