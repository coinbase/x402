"""Unit tests for x402.schemas.helpers — version detection, payload parsing, and network matching."""

import json

import pytest

from x402.schemas.helpers import (
    derive_network_pattern,
    detect_version,
    find_schemes_by_network,
    get_scheme_and_network,
    match_payload_to_requirements,
    matches_network_pattern,
    parse_payment_payload,
    parse_payment_required,
    parse_payment_requirements,
)
from x402.schemas.payments import PaymentPayload, PaymentRequired, PaymentRequirements
from x402.schemas.v1 import PaymentPayloadV1, PaymentRequiredV1, PaymentRequirementsV1

# ---------------------------------------------------------------------------
# Fixtures — minimal valid dicts / JSON bytes
# ---------------------------------------------------------------------------

V2_REQUIREMENTS = {
    "scheme": "exact",
    "network": "eip155:8453",
    "asset": "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913",
    "amount": "1000000",
    "payTo": "0xRecipient",
    "maxTimeoutSeconds": 300,
}

V1_REQUIREMENTS = {
    "scheme": "exact",
    "network": "base-sepolia",
    "maxAmountRequired": "500000",
    "resource": "https://example.com/api",
    "payTo": "0xRecipientV1",
    "maxTimeoutSeconds": 300,
    "asset": "0xAssetAddress",
}

V2_PAYLOAD_REQUIRED = {
    "x402Version": 2,
    "accepts": [V2_REQUIREMENTS],
}

V1_PAYLOAD_REQUIRED = {
    "x402Version": 1,
    "accepts": [V1_REQUIREMENTS],
}

V2_PAYMENT_PAYLOAD = {
    "x402Version": 2,
    "payload": {"signature": "0xdeadbeef", "data": "opaque"},
    "accepted": V2_REQUIREMENTS,
}

V1_PAYMENT_PAYLOAD = {
    "x402Version": 1,
    "scheme": "exact",
    "network": "base-sepolia",
    "payload": {"signature": "0xdeadbeef"},
}


# =============================================================================
# detect_version
# =============================================================================


class TestDetectVersion:
    def test_v2_from_dict(self):
        assert detect_version({"x402Version": 2}) == 2

    def test_v1_from_dict(self):
        assert detect_version({"x402Version": 1}) == 1

    def test_v2_from_bytes(self):
        data = json.dumps({"x402Version": 2}).encode()
        assert detect_version(data) == 2

    def test_v1_from_bytes(self):
        data = json.dumps({"x402Version": 1}).encode()
        assert detect_version(data) == 1

    def test_missing_version_raises(self):
        with pytest.raises(ValueError, match="Missing x402Version"):
            detect_version({"scheme": "exact"})

    def test_invalid_version_raises(self):
        with pytest.raises(ValueError, match="Invalid x402Version"):
            detect_version({"x402Version": 3})

    def test_zero_version_raises(self):
        with pytest.raises(ValueError, match="Invalid x402Version"):
            detect_version({"x402Version": 0})


# =============================================================================
# get_scheme_and_network
# =============================================================================


class TestGetSchemeAndNetwork:
    def test_v2_from_accepted_field(self):
        payload = {
            "x402Version": 2,
            "accepted": {"scheme": "exact", "network": "eip155:8453"},
        }
        scheme, network = get_scheme_and_network(2, payload)
        assert scheme == "exact"
        assert network == "eip155:8453"

    def test_v1_from_top_level(self):
        payload = {"x402Version": 1, "scheme": "exact", "network": "base-sepolia"}
        scheme, network = get_scheme_and_network(1, payload)
        assert scheme == "exact"
        assert network == "base-sepolia"

    def test_from_bytes(self):
        payload = json.dumps(
            {"x402Version": 2, "accepted": {"scheme": "upto", "network": "eip155:84532"}}
        ).encode()
        scheme, network = get_scheme_and_network(2, payload)
        assert scheme == "upto"
        assert network == "eip155:84532"

    def test_missing_scheme_raises(self):
        payload = {"accepted": {"network": "eip155:8453"}}
        with pytest.raises(ValueError, match="Missing scheme"):
            get_scheme_and_network(2, payload)

    def test_missing_network_raises(self):
        payload = {"accepted": {"scheme": "exact"}}
        with pytest.raises(ValueError, match="Missing network"):
            get_scheme_and_network(2, payload)

    def test_v1_missing_scheme_raises(self):
        payload = {"network": "base-sepolia"}
        with pytest.raises(ValueError, match="Missing scheme"):
            get_scheme_and_network(1, payload)


# =============================================================================
# match_payload_to_requirements
# =============================================================================


class TestMatchPayloadToRequirements:
    def test_v2_match(self):
        payload = {
            "x402Version": 2,
            "accepted": {
                "scheme": "exact",
                "network": "eip155:8453",
                "amount": "1000000",
                "asset": "0xUSDC",
                "payTo": "0xRecipient",
            },
        }
        requirements = {
            "scheme": "exact",
            "network": "eip155:8453",
            "amount": "1000000",
            "asset": "0xUSDC",
            "payTo": "0xRecipient",
        }
        assert match_payload_to_requirements(2, payload, requirements) is True

    def test_v2_mismatch_amount(self):
        payload = {
            "accepted": {
                "scheme": "exact",
                "network": "eip155:8453",
                "amount": "999999",
                "asset": "0xUSDC",
                "payTo": "0xRecipient",
            }
        }
        requirements = {
            "scheme": "exact",
            "network": "eip155:8453",
            "amount": "1000000",
            "asset": "0xUSDC",
            "payTo": "0xRecipient",
        }
        assert match_payload_to_requirements(2, payload, requirements) is False

    def test_v1_match(self):
        payload = {"scheme": "exact", "network": "base-sepolia"}
        requirements = {"scheme": "exact", "network": "base-sepolia"}
        assert match_payload_to_requirements(1, payload, requirements) is True

    def test_v1_scheme_mismatch(self):
        payload = {"scheme": "exact", "network": "base-sepolia"}
        requirements = {"scheme": "upto", "network": "base-sepolia"}
        assert match_payload_to_requirements(1, payload, requirements) is False

    def test_v1_network_mismatch(self):
        payload = {"scheme": "exact", "network": "base-sepolia"}
        requirements = {"scheme": "exact", "network": "base-mainnet"}
        assert match_payload_to_requirements(1, payload, requirements) is False

    def test_from_bytes(self):
        payload = json.dumps(
            {
                "accepted": {
                    "scheme": "exact",
                    "network": "eip155:8453",
                    "amount": "1000000",
                    "asset": "0xUSDC",
                    "payTo": "0xRecipient",
                }
            }
        ).encode()
        requirements = json.dumps(
            {
                "scheme": "exact",
                "network": "eip155:8453",
                "amount": "1000000",
                "asset": "0xUSDC",
                "payTo": "0xRecipient",
            }
        ).encode()
        assert match_payload_to_requirements(2, payload, requirements) is True


# =============================================================================
# parse_payment_required
# =============================================================================


class TestParsePaymentRequired:
    def test_v2_from_dict(self):
        result = parse_payment_required(V2_PAYLOAD_REQUIRED)
        assert isinstance(result, PaymentRequired)
        assert result.x402_version == 2
        assert result.accepts[0].scheme == "exact"

    def test_v1_from_dict(self):
        result = parse_payment_required(V1_PAYLOAD_REQUIRED)
        assert isinstance(result, PaymentRequiredV1)
        assert result.x402_version == 1
        assert result.accepts[0].scheme == "exact"

    def test_v2_from_bytes(self):
        data = json.dumps(V2_PAYLOAD_REQUIRED).encode()
        result = parse_payment_required(data)
        assert isinstance(result, PaymentRequired)

    def test_v1_from_bytes(self):
        data = json.dumps(V1_PAYLOAD_REQUIRED).encode()
        result = parse_payment_required(data)
        assert isinstance(result, PaymentRequiredV1)

    def test_v2_with_error_field(self):
        data = {**V2_PAYLOAD_REQUIRED, "error": "payment required"}
        result = parse_payment_required(data)
        assert isinstance(result, PaymentRequired)
        assert result.error == "payment required"

    def test_v1_with_error_field(self):
        data = {**V1_PAYLOAD_REQUIRED, "error": "legacy error"}
        result = parse_payment_required(data)
        assert isinstance(result, PaymentRequiredV1)
        assert result.error == "legacy error"

    def test_invalid_version_raises(self):
        with pytest.raises(ValueError):
            parse_payment_required({"x402Version": 99, "accepts": []})


# =============================================================================
# parse_payment_payload
# =============================================================================


class TestParsePaymentPayload:
    def test_v2_from_dict(self):
        result = parse_payment_payload(V2_PAYMENT_PAYLOAD)
        assert isinstance(result, PaymentPayload)
        assert result.x402_version == 2
        assert result.accepted.scheme == "exact"

    def test_v1_from_dict(self):
        result = parse_payment_payload(V1_PAYMENT_PAYLOAD)
        assert isinstance(result, PaymentPayloadV1)
        assert result.x402_version == 1
        assert result.scheme == "exact"

    def test_v2_from_bytes(self):
        data = json.dumps(V2_PAYMENT_PAYLOAD).encode()
        result = parse_payment_payload(data)
        assert isinstance(result, PaymentPayload)

    def test_v1_from_bytes(self):
        data = json.dumps(V1_PAYMENT_PAYLOAD).encode()
        result = parse_payment_payload(data)
        assert isinstance(result, PaymentPayloadV1)

    def test_v2_payload_data_preserved(self):
        result = parse_payment_payload(V2_PAYMENT_PAYLOAD)
        assert result.payload["signature"] == "0xdeadbeef"

    def test_v2_get_scheme_helper(self):
        result = parse_payment_payload(V2_PAYMENT_PAYLOAD)
        assert result.get_scheme() == "exact"

    def test_v2_get_network_helper(self):
        result = parse_payment_payload(V2_PAYMENT_PAYLOAD)
        assert result.get_network() == "eip155:8453"


# =============================================================================
# parse_payment_requirements
# =============================================================================


class TestParsePaymentRequirements:
    def test_v2_from_dict(self):
        result = parse_payment_requirements(2, V2_REQUIREMENTS)
        assert isinstance(result, PaymentRequirements)
        assert result.scheme == "exact"
        assert result.amount == "1000000"

    def test_v1_from_dict(self):
        result = parse_payment_requirements(1, V1_REQUIREMENTS)
        assert isinstance(result, PaymentRequirementsV1)
        assert result.scheme == "exact"
        assert result.max_amount_required == "500000"

    def test_v2_from_bytes(self):
        data = json.dumps(V2_REQUIREMENTS).encode()
        result = parse_payment_requirements(2, data)
        assert isinstance(result, PaymentRequirements)

    def test_v1_from_bytes(self):
        data = json.dumps(V1_REQUIREMENTS).encode()
        result = parse_payment_requirements(1, data)
        assert isinstance(result, PaymentRequirementsV1)

    def test_invalid_version_raises(self):
        with pytest.raises(ValueError, match="Invalid x402Version"):
            parse_payment_requirements(3, V2_REQUIREMENTS)

    def test_zero_version_raises(self):
        with pytest.raises(ValueError, match="Invalid x402Version"):
            parse_payment_requirements(0, V2_REQUIREMENTS)


# =============================================================================
# matches_network_pattern
# =============================================================================


class TestMatchesNetworkPattern:
    def test_exact_match(self):
        assert matches_network_pattern("eip155:8453", "eip155:8453") is True

    def test_wildcard_match(self):
        assert matches_network_pattern("eip155:8453", "eip155:*") is True

    def test_wildcard_different_chain(self):
        assert matches_network_pattern("eip155:84532", "eip155:*") is True

    def test_wildcard_different_namespace(self):
        assert matches_network_pattern("eip155:8453", "solana:*") is False

    def test_exact_no_match(self):
        assert matches_network_pattern("eip155:8453", "eip155:84532") is False

    def test_solana_wildcard(self):
        assert matches_network_pattern("solana:mainnet", "solana:*") is True

    def test_solana_exact(self):
        assert matches_network_pattern("solana:mainnet", "solana:mainnet") is True

    def test_solana_devnet_no_match_mainnet(self):
        assert matches_network_pattern("solana:devnet", "solana:mainnet") is False

    def test_wildcard_does_not_cross_namespace(self):
        # eip155:* should not match "aptos:mainnet"
        assert matches_network_pattern("aptos:mainnet", "eip155:*") is False


# =============================================================================
# derive_network_pattern
# =============================================================================


class TestDeriveNetworkPattern:
    def test_single_network_returns_wildcard(self):
        result = derive_network_pattern(["eip155:8453"])
        assert result == "eip155:*"

    def test_same_namespace_returns_wildcard(self):
        result = derive_network_pattern(["eip155:8453", "eip155:84532"])
        assert result == "eip155:*"

    def test_multiple_same_namespace_returns_wildcard(self):
        result = derive_network_pattern(["eip155:1", "eip155:8453", "eip155:42161"])
        assert result == "eip155:*"

    def test_different_namespaces_returns_first(self):
        result = derive_network_pattern(["eip155:8453", "solana:mainnet"])
        assert result == "eip155:8453"

    def test_solana_only_returns_wildcard(self):
        result = derive_network_pattern(["solana:mainnet", "solana:devnet"])
        assert result == "solana:*"

    def test_empty_list_raises(self):
        with pytest.raises(ValueError, match="At least one network required"):
            derive_network_pattern([])


# =============================================================================
# find_schemes_by_network
# =============================================================================


class TestFindSchemesByNetwork:
    def setup_method(self):
        self.mock_exact = object()
        self.mock_upto = object()
        self.schemes: dict = {
            "eip155:8453": {"exact": self.mock_exact},
            "eip155:*": {"upto": self.mock_upto},
            "solana:mainnet": {"exact": self.mock_exact},
        }

    def test_exact_match_returned(self):
        result = find_schemes_by_network(self.schemes, "eip155:8453")
        assert result == {"exact": self.mock_exact}

    def test_wildcard_fallback(self):
        # eip155:84532 not in exact keys, should fall through to eip155:*
        result = find_schemes_by_network(self.schemes, "eip155:84532")
        assert result == {"upto": self.mock_upto}

    def test_solana_exact_match(self):
        result = find_schemes_by_network(self.schemes, "solana:mainnet")
        assert result == {"exact": self.mock_exact}

    def test_no_match_returns_none(self):
        result = find_schemes_by_network(self.schemes, "aptos:mainnet")
        assert result is None

    def test_empty_schemes_returns_none(self):
        result = find_schemes_by_network({}, "eip155:8453")
        assert result is None

    def test_exact_match_preferred_over_wildcard(self):
        # Both exact and wildcard exist — exact should win
        schemes = {
            "eip155:8453": {"exact": self.mock_exact},
            "eip155:*": {"upto": self.mock_upto},
        }
        result = find_schemes_by_network(schemes, "eip155:8453")
        assert result == {"exact": self.mock_exact}
