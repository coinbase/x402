"""Tests for ExactEvmSchemeV1 client (V1 legacy)."""

import json
from unittest.mock import MagicMock

try:
    from eth_account import Account
    from eth_account.signers.local import LocalAccount
except ImportError:
    import pytest

    pytest.skip("EVM v1 client requires eth_account", allow_module_level=True)

import pytest

from x402.mechanisms.evm.exact.v1.client import ExactEvmSchemeV1
from x402.mechanisms.evm.signers import EthAccountSigner
from x402.schemas.v1 import PaymentRequirementsV1


def _make_requirements(
    network: str = "base",
    asset: str = "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913",
    pay_to: str = "0x0987654321098765432109876543210987654321",
    max_amount_required: str = "500000",
    max_timeout_seconds: int = 600,
    extra: dict | str | None = None,
) -> PaymentRequirementsV1:
    """Build a minimal PaymentRequirementsV1 for tests."""
    return PaymentRequirementsV1(
        scheme="exact",
        network=network,
        max_amount_required=max_amount_required,
        resource="https://example.com/resource",
        pay_to=pay_to,
        max_timeout_seconds=max_timeout_seconds,
        asset=asset,
        extra=extra,
    )


class TestExactEvmSchemeV1Constructor:
    """Test ExactEvmSchemeV1 constructor."""

    def test_should_have_scheme_exact(self):
        """scheme attribute should be 'exact'."""
        account = Account.create()
        signer = EthAccountSigner(account)

        client = ExactEvmSchemeV1(signer)

        assert client.scheme == "exact"

    def test_should_store_signer_reference(self):
        """Should store the signer on _signer."""
        account = Account.create()
        signer = EthAccountSigner(account)

        client = ExactEvmSchemeV1(signer)

        assert client._signer is signer

    def test_should_auto_wrap_raw_local_account(self):
        """Passing a raw LocalAccount should auto-wrap in EthAccountSigner."""
        account = Account.create()
        assert isinstance(account, LocalAccount)

        client = ExactEvmSchemeV1(signer=account)

        assert isinstance(client._signer, EthAccountSigner)
        assert client._signer.address == account.address

    def test_should_not_double_wrap_existing_signer(self):
        """An EthAccountSigner should pass through without re-wrapping."""
        account = Account.create()
        signer = EthAccountSigner(account)

        client = ExactEvmSchemeV1(signer=signer)

        assert client._signer is signer


class TestCreatePaymentPayloadV1:
    """Test create_payment_payload for V1 requirements."""

    def test_should_return_dict_with_authorization_and_signature(self):
        """create_payment_payload should return inner payload dict."""
        account = Account.create()
        client = ExactEvmSchemeV1(signer=account)

        requirements = _make_requirements(
            network="base",
            extra={"name": "USD Coin", "version": "2"},
        )

        payload = client.create_payment_payload(requirements)

        assert isinstance(payload, dict)
        assert "authorization" in payload
        assert "signature" in payload

    def test_signature_should_be_hex_string(self):
        """Signature should be 0x-prefixed hex string."""
        account = Account.create()
        client = ExactEvmSchemeV1(signer=account)

        requirements = _make_requirements(
            network="base",
            extra={"name": "USD Coin", "version": "2"},
        )

        payload = client.create_payment_payload(requirements)

        assert payload["signature"].startswith("0x")
        # 65-byte ECDSA signature → 130 hex chars + "0x" = 132
        assert len(payload["signature"]) == 132

    def test_authorization_uses_max_amount_required_as_value(self):
        """V1 maps max_amount_required → authorization value."""
        account = Account.create()
        client = ExactEvmSchemeV1(signer=account)

        requirements = _make_requirements(
            network="base",
            max_amount_required="1234567",
            extra={"name": "USD Coin", "version": "2"},
        )

        payload = client.create_payment_payload(requirements)
        auth = payload["authorization"]

        # Inner payload uses camelCase per to_dict serialization
        assert auth.get("value") == "1234567"

    def test_authorization_from_address_matches_signer(self):
        """Authorization 'from' should be the signer's address."""
        account = Account.create()
        client = ExactEvmSchemeV1(signer=account)

        requirements = _make_requirements(
            network="base",
            extra={"name": "USD Coin", "version": "2"},
        )

        payload = client.create_payment_payload(requirements)
        auth = payload["authorization"]

        assert auth.get("from") == account.address

    def test_authorization_to_matches_pay_to(self):
        """Authorization 'to' should be requirements.pay_to."""
        account = Account.create()
        client = ExactEvmSchemeV1(signer=account)

        pay_to = "0xabcdEF0123456789abcdef0123456789ABCDef01"
        requirements = _make_requirements(
            network="base",
            pay_to=pay_to,
            extra={"name": "USD Coin", "version": "2"},
        )

        payload = client.create_payment_payload(requirements)
        auth = payload["authorization"]

        assert auth.get("to") == pay_to

    def test_valid_after_is_ten_minutes_before_now(self):
        """V1 valid_after = now - 600 seconds."""
        import time

        account = Account.create()
        client = ExactEvmSchemeV1(signer=account)

        before_call = int(time.time())
        payload = client.create_payment_payload(
            _make_requirements(
                network="base",
                extra={"name": "USD Coin", "version": "2"},
            )
        )
        after_call = int(time.time())

        valid_after = int(payload["authorization"]["validAfter"])

        assert before_call - 600 <= valid_after <= after_call - 600

    def test_valid_before_uses_max_timeout_seconds(self):
        """V1 valid_before = now + max_timeout_seconds."""
        import time

        account = Account.create()
        client = ExactEvmSchemeV1(signer=account)

        before_call = int(time.time())
        payload = client.create_payment_payload(
            _make_requirements(
                network="base",
                max_timeout_seconds=3600,
                extra={"name": "USD Coin", "version": "2"},
            )
        )
        after_call = int(time.time())

        valid_before = int(payload["authorization"]["validBefore"])

        assert before_call + 3600 <= valid_before <= after_call + 3600

    def test_valid_before_defaults_to_600_when_timeout_falsy(self):
        """When max_timeout_seconds is 0, V1 falls back to 600 seconds."""
        import time

        account = Account.create()
        client = ExactEvmSchemeV1(signer=account)

        # max_timeout_seconds=0 is falsy → fallback to 600
        before_call = int(time.time())
        payload = client.create_payment_payload(
            _make_requirements(
                network="base",
                max_timeout_seconds=0,
                extra={"name": "USD Coin", "version": "2"},
            )
        )
        after_call = int(time.time())

        valid_before = int(payload["authorization"]["validBefore"])

        assert before_call + 600 <= valid_before <= after_call + 600

    def test_nonce_is_random_per_payload(self):
        """Each call should produce a fresh nonce."""
        account = Account.create()
        client = ExactEvmSchemeV1(signer=account)

        requirements = _make_requirements(
            network="base",
            extra={"name": "USD Coin", "version": "2"},
        )

        payload_a = client.create_payment_payload(requirements)
        payload_b = client.create_payment_payload(requirements)

        assert payload_a["authorization"]["nonce"] != payload_b["authorization"]["nonce"]
        # 32-byte nonce → 64 hex chars + 0x = 66
        assert payload_a["authorization"]["nonce"].startswith("0x")
        assert len(payload_a["authorization"]["nonce"]) == 66


class TestSignAuthorizationV1:
    """Test _sign_authorization V1 behavior."""

    def test_should_resolve_v1_legacy_network_name(self):
        """V1 _sign_authorization should look up chain ID via legacy network name."""
        account = Account.create()
        client = ExactEvmSchemeV1(signer=account)

        # Wrap signer to capture chain_id passed via domain
        captured = {}
        original = client._signer.sign_typed_data

        def capture(domain, types, primary_type, message):
            captured["chain_id"] = domain.chain_id
            return original(domain, types, primary_type, message)

        client._signer.sign_typed_data = capture  # type: ignore[method-assign]

        client.create_payment_payload(
            _make_requirements(
                network="base",
                extra={"name": "USD Coin", "version": "2"},
            )
        )

        assert captured["chain_id"] == 8453

    def test_should_resolve_base_sepolia_chain_id(self):
        """base-sepolia legacy name → 84532."""
        account = Account.create()
        client = ExactEvmSchemeV1(signer=account)

        captured = {}
        original = client._signer.sign_typed_data

        def capture(domain, types, primary_type, message):
            captured["chain_id"] = domain.chain_id
            return original(domain, types, primary_type, message)

        client._signer.sign_typed_data = capture  # type: ignore[method-assign]

        client.create_payment_payload(
            _make_requirements(
                network="base-sepolia",
                asset="0x036CbD53842c5426634e7929541eC2318f3dCF7e",
                extra={"name": "USDC", "version": "2"},
            )
        )

        assert captured["chain_id"] == 84532

    def test_should_raise_for_unknown_v1_network(self):
        """Unknown V1 legacy name should raise ValueError from get_evm_chain_id."""
        account = Account.create()
        client = ExactEvmSchemeV1(signer=account)

        with pytest.raises(ValueError, match="Unknown v1 network"):
            client.create_payment_payload(
                _make_requirements(
                    network="not-a-real-network",
                    extra={"name": "USD Coin", "version": "2"},
                )
            )

    def test_should_reject_caip2_network_format(self):
        """V1 client should reject eip155:CHAIN_ID format (V2-only)."""
        account = Account.create()
        client = ExactEvmSchemeV1(signer=account)

        with pytest.raises(ValueError, match="Unknown v1 network"):
            client.create_payment_payload(
                _make_requirements(
                    network="eip155:8453",
                    extra={"name": "USD Coin", "version": "2"},
                )
            )

    def test_should_parse_extra_when_provided_as_json_string(self):
        """V1 supports extra serialized as a JSON string."""
        account = Account.create()
        client = ExactEvmSchemeV1(signer=account)

        captured = {}
        original = client._signer.sign_typed_data

        def capture(domain, types, primary_type, message):
            captured["domain"] = domain
            return original(domain, types, primary_type, message)

        client._signer.sign_typed_data = capture  # type: ignore[method-assign]

        # PaymentRequirementsV1.extra is dict | None, but the V1 client also
        # tolerates a string by re-parsing it. Bypass schema validation by
        # mutating extra directly after construction.
        requirements = _make_requirements(network="base", extra={})
        requirements.extra = json.dumps({"name": "USD Coin", "version": "2"})  # type: ignore[assignment]

        client.create_payment_payload(requirements)

        assert captured["domain"].name == "USD Coin"
        assert captured["domain"].version == "2"

    def test_should_fallback_to_asset_info_when_extra_missing_name(self):
        """If extra has no 'name', fall back to asset_info on the V1 network."""
        account = Account.create()
        client = ExactEvmSchemeV1(signer=account)

        captured = {}
        original = client._signer.sign_typed_data

        def capture(domain, types, primary_type, message):
            captured["domain"] = domain
            return original(domain, types, primary_type, message)

        client._signer.sign_typed_data = capture  # type: ignore[method-assign]

        # USDC on Base → asset_info gives {"name": "USD Coin", "version": "2"}
        client.create_payment_payload(
            _make_requirements(
                network="base",
                asset="0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913",
                extra={},
            )
        )

        assert captured["domain"].name == "USD Coin"
        assert captured["domain"].version == "2"

    def test_should_raise_when_name_missing_and_asset_unregistered(self):
        """If extra has no 'name' and asset is unknown, raise ValueError."""
        account = Account.create()
        client = ExactEvmSchemeV1(signer=account)

        with pytest.raises(ValueError, match="EIP-712 domain name required"):
            client.create_payment_payload(
                _make_requirements(
                    network="base",
                    asset="0x000000000000000000000000000000000000dEaD",
                    extra={},
                )
            )

    def test_should_default_version_to_1_when_extra_has_only_name(self):
        """If 'name' is supplied but 'version' is absent, default version is '1'."""
        account = Account.create()
        client = ExactEvmSchemeV1(signer=account)

        captured = {}
        original = client._signer.sign_typed_data

        def capture(domain, types, primary_type, message):
            captured["domain"] = domain
            return original(domain, types, primary_type, message)

        client._signer.sign_typed_data = capture  # type: ignore[method-assign]

        # Use a non-default-asset network/asset combo so the fallback to
        # asset_info also raises, leaving extra without 'version'. Then the
        # client defaults version to "1".
        requirements = _make_requirements(
            network="base",
            asset="0x000000000000000000000000000000000000dEaD",
            extra={"name": "Custom Token"},
        )

        client.create_payment_payload(requirements)

        assert captured["domain"].name == "Custom Token"
        assert captured["domain"].version == "1"

    def test_signer_called_with_typed_data_field_objects(self):
        """The signer should receive types as TypedDataField lists."""
        from x402.mechanisms.evm.types import TypedDataField

        account = Account.create()
        signer = EthAccountSigner(account)
        client = ExactEvmSchemeV1(signer=signer)

        captured = {}
        original = signer.sign_typed_data

        def capture(domain, types, primary_type, message):
            captured["types"] = types
            captured["primary_type"] = primary_type
            return original(domain, types, primary_type, message)

        signer.sign_typed_data = capture  # type: ignore[method-assign]

        client.create_payment_payload(
            _make_requirements(
                network="base",
                extra={"name": "USD Coin", "version": "2"},
            )
        )

        assert "types" in captured
        for _type_name, fields in captured["types"].items():
            assert isinstance(fields, list)
            for field in fields:
                assert isinstance(field, TypedDataField)
                assert isinstance(field.name, str)
                assert isinstance(field.type, str)

    def test_signature_returned_from_signer_is_hex_encoded(self):
        """The signer returns bytes; the client should hex-encode with 0x prefix."""
        account = Account.create()
        client = ExactEvmSchemeV1(signer=account)

        # Mock the signer to return a known byte sequence
        client._signer = MagicMock()
        client._signer.address = account.address
        client._signer.sign_typed_data.return_value = b"\xde\xad\xbe\xef"

        payload = client.create_payment_payload(
            _make_requirements(
                network="base",
                extra={"name": "USD Coin", "version": "2"},
            )
        )

        assert payload["signature"] == "0xdeadbeef"
