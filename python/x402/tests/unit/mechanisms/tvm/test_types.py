"""Tests for TVM payload types."""

from x402.mechanisms.tvm import (
    SignedW5Message,
    TvmPaymentPayload,
)


SAMPLE_SENDER = "0:b113a994b5024a16719f69139328eb759596c38a25f59028b146fecdc3621dfe"
SAMPLE_RECIPIENT = "0:0987654321098765432109876543210987654321098765432109876543210987"
SAMPLE_ASSET = "0:b113a994b5024a16719f69139328eb759596c38a25f59028b146fecdc3621dfe"


class TestSignedW5Message:
    """Test SignedW5Message type."""

    def test_should_create_message_with_defaults(self):
        msg = SignedW5Message(address=SAMPLE_SENDER, amount="100")

        assert msg.address == SAMPLE_SENDER
        assert msg.amount == "100"
        assert msg.payload == ""
        assert msg.state_init is None

    def test_should_create_message_with_all_fields(self):
        msg = SignedW5Message(
            address=SAMPLE_SENDER,
            amount="100",
            payload="te6cc",
            state_init="te6cc",
        )

        assert msg.payload == "te6cc"
        assert msg.state_init == "te6cc"


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
        assert payload.commission == "0"
        assert payload.signed_messages == []

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
        assert result["signedMessages"] == []
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
            "signedMessages": [
                {"address": SAMPLE_SENDER, "amount": "100", "payload": ""},
            ],
            "commission": "500",
            "settlementBoc": "base64boc",
            "walletPublicKey": "deadbeef",
        }

        payload = TvmPaymentPayload.from_dict(data)

        assert payload.sender == SAMPLE_SENDER
        assert payload.token_master == SAMPLE_ASSET
        assert payload.valid_until == 1700000000
        assert len(payload.signed_messages) == 1
        assert payload.signed_messages[0].address == SAMPLE_SENDER
        assert payload.commission == "500"

    def test_round_trip_serialization(self):
        original = TvmPaymentPayload(
            sender=SAMPLE_SENDER,
            to=SAMPLE_RECIPIENT,
            token_master=SAMPLE_ASSET,
            amount="1000000",
            valid_until=1700000000,
            nonce="abc123",
            signed_messages=[
                SignedW5Message(address=SAMPLE_SENDER, amount="100"),
            ],
            commission="500",
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
        assert restored.commission == original.commission
        assert len(restored.signed_messages) == 1

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

        assert payload.signed_messages == []
        assert payload.commission == "0"
        assert payload.settlement_boc == ""
        assert payload.wallet_public_key == ""

    def test_from_dict_handles_empty_dict(self):
        payload = TvmPaymentPayload.from_dict({})

        assert payload.sender == ""
        assert payload.to == ""
        assert payload.amount == ""
        assert payload.valid_until == 0
