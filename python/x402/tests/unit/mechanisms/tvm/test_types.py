"""Tests for TVM payload types."""

from x402.mechanisms.tvm import (
    TvmPaymentPayload,
)


SAMPLE_SENDER = "0:b113a994b5024a16719f69139328eb759596c38a25f59028b146fecdc3621dfe"
SAMPLE_RECIPIENT = "0:0987654321098765432109876543210987654321098765432109876543210987"
SAMPLE_ASSET = "0:b113a994b5024a16719f69139328eb759596c38a25f59028b146fecdc3621dfe"


class TestTvmPaymentPayload:
    """Test TvmPaymentPayload type."""

    def test_should_create_payload_with_required_fields(self):
        payload = TvmPaymentPayload(
            sender=SAMPLE_SENDER,
            to=SAMPLE_RECIPIENT,
            token_master=SAMPLE_ASSET,
            amount="1000000",
            valid_until=1700000000,
            nonce="abc123",
        )

        assert payload.sender == SAMPLE_SENDER
        assert payload.to == SAMPLE_RECIPIENT
        assert payload.amount == "1000000"
        assert payload.settlement_boc == ""
        assert payload.wallet_public_key == ""

    def test_to_dict_should_use_json_field_names(self):
        payload = TvmPaymentPayload(
            sender=SAMPLE_SENDER,
            to=SAMPLE_RECIPIENT,
            token_master=SAMPLE_ASSET,
            amount="1000000",
            valid_until=1700000000,
            nonce="abc123",
            settlement_boc="base64boc",
            wallet_public_key="deadbeef",
        )

        result = payload.to_dict()

        assert result["from"] == SAMPLE_SENDER
        assert result["tokenMaster"] == SAMPLE_ASSET
        assert result["validUntil"] == 1700000000
        assert result["settlementBoc"] == "base64boc"
        assert result["walletPublicKey"] == "deadbeef"

    def test_from_dict_should_parse_json_field_names(self):
        data = {
            "from": SAMPLE_SENDER,
            "to": SAMPLE_RECIPIENT,
            "tokenMaster": SAMPLE_ASSET,
            "amount": "1000000",
            "validUntil": 1700000000,
            "nonce": "abc123",
            "settlementBoc": "base64boc",
            "walletPublicKey": "deadbeef",
        }

        payload = TvmPaymentPayload.from_dict(data)

        assert payload.sender == SAMPLE_SENDER
        assert payload.token_master == SAMPLE_ASSET
        assert payload.valid_until == 1700000000
        assert payload.settlement_boc == "base64boc"
        assert payload.wallet_public_key == "deadbeef"

    def test_round_trip_serialization(self):
        original = TvmPaymentPayload(
            sender=SAMPLE_SENDER,
            to=SAMPLE_RECIPIENT,
            token_master=SAMPLE_ASSET,
            amount="1000000",
            valid_until=1700000000,
            nonce="abc123",
            settlement_boc="base64boc",
            wallet_public_key="deadbeef",
        )

        serialized = original.to_dict()
        restored = TvmPaymentPayload.from_dict(serialized)

        assert restored.sender == original.sender
        assert restored.to == original.to
        assert restored.token_master == original.token_master
        assert restored.amount == original.amount
        assert restored.valid_until == original.valid_until
        assert restored.settlement_boc == original.settlement_boc

    def test_from_dict_handles_missing_optional_fields(self):
        data = {
            "from": SAMPLE_SENDER,
            "to": SAMPLE_RECIPIENT,
            "tokenMaster": SAMPLE_ASSET,
            "amount": "1000000",
            "validUntil": 1700000000,
            "nonce": "abc123",
        }

        payload = TvmPaymentPayload.from_dict(data)

        assert payload.settlement_boc == ""
        assert payload.wallet_public_key == ""

    def test_from_dict_handles_empty_dict(self):
        payload = TvmPaymentPayload.from_dict({})

        assert payload.sender == ""
        assert payload.to == ""
        assert payload.amount == ""
        assert payload.valid_until == 0
