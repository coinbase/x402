"""Unit tests for x402.schemas.helpers.

Covers all 10 public helpers with zero network calls or blockchain state:
    detect_version, get_scheme_and_network, match_payload_to_requirements,
    parse_payment_required, parse_payment_payload, parse_payment_requirements,
    matches_network_pattern, derive_network_pattern, find_schemes_by_network.
"""

from __future__ import annotations

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
from x402.schemas.payments import PaymentPayload, PaymentRequired
from x402.schemas.v1 import PaymentPayloadV1, PaymentRequiredV1, PaymentRequirementsV1

# ---------------------------------------------------------------------------
# Helpers / fixtures
# ---------------------------------------------------------------------------

_REQ_V1 = {
    "x402Version": 1,
    "accepts": [
        {
            "scheme": "exact",
            "network": "base-sepolia",
            "maxAmountRequired": "100",
            "resource": "https://example.com/api",
            "payTo": "0xRecipient",
            "maxTimeoutSeconds": 300,
            "asset": "0xUSDC",
        }
    ],
}

_REQ_V2 = {
    "x402Version": 2,
    "accepts": [
        {
            "scheme": "exact",
            "network": "eip155:8453",
            "asset": "0xUSDC",
            "amount": "100",
            "payTo": "0xRecipient",
            "maxTimeoutSeconds": 300,
        }
    ],
}

_PAYLOAD_V1 = {
    "x402Version": 1,
    "scheme": "exact",
    "network": "base-sepolia",
    "payload": {"signature": "0xdeadbeef"},
}

_PAYLOAD_V2 = {
    "x402Version": 2,
    "payload": {"signature": "0xdeadbeef"},
    "accepted": {
        "scheme": "exact",
        "network": "eip155:8453",
        "asset": "0xUSDC",
        "amount": "100",
        "payTo": "0xRecipient",
        "maxTimeoutSeconds": 300,
    },
}


# ---------------------------------------------------------------------------
# detect_version
# ---------------------------------------------------------------------------


class TestDetectVersion:
    def test_returns_1_from_dict(self) -> None:
        assert detect_version({"x402Version": 1}) == 1

    def test_returns_2_from_dict(self) -> None:
        assert detect_version({"x402Version": 2}) == 2

    def test_returns_1_from_bytes(self) -> None:
        assert detect_version(json.dumps({"x402Version": 1}).encode()) == 1

    def test_returns_2_from_bytes(self) -> None:
        assert detect_version(json.dumps({"x402Version": 2}).encode()) == 2

    def test_raises_on_missing_version(self) -> None:
        with pytest.raises(ValueError, match="Missing x402Version"):
            detect_version({"scheme": "exact"})

    def test_raises_on_null_version(self) -> None:
        with pytest.raises(ValueError, match="Missing x402Version"):
            detect_version({"x402Version": None})

    def test_raises_on_invalid_version_0(self) -> None:
        with pytest.raises(ValueError, match="Invalid x402Version: 0"):
            detect_version({"x402Version": 0})

    def test_raises_on_invalid_version_3(self) -> None:
        with pytest.raises(ValueError, match="Invalid x402Version: 3"):
            detect_version({"x402Version": 3})

    def test_extra_fields_ignored(self) -> None:
        assert detect_version({"x402Version": 2, "extra": "ignored"}) == 2


# ---------------------------------------------------------------------------
# get_scheme_and_network
# ---------------------------------------------------------------------------


class TestGetSchemeAndNetwork:
    def test_v1_from_dict(self) -> None:
        scheme, network = get_scheme_and_network(1, _PAYLOAD_V1)
        assert scheme == "exact"
        assert network == "base-sepolia"

    def test_v2_from_dict(self) -> None:
        scheme, network = get_scheme_and_network(2, _PAYLOAD_V2)
        assert scheme == "exact"
        assert network == "eip155:8453"

    def test_v1_from_bytes(self) -> None:
        scheme, network = get_scheme_and_network(1, json.dumps(_PAYLOAD_V1).encode())
        assert scheme == "exact"
        assert network == "base-sepolia"

    def test_v2_from_bytes(self) -> None:
        scheme, network = get_scheme_and_network(2, json.dumps(_PAYLOAD_V2).encode())
        assert scheme == "exact"
        assert network == "eip155:8453"

    def test_v1_raises_on_missing_scheme(self) -> None:
        bad = {**_PAYLOAD_V1}
        del bad["scheme"]
        with pytest.raises(ValueError, match="Missing scheme"):
            get_scheme_and_network(1, bad)

    def test_v1_raises_on_missing_network(self) -> None:
        bad = {**_PAYLOAD_V1}
        del bad["network"]
        with pytest.raises(ValueError, match="Missing network"):
            get_scheme_and_network(1, bad)

    def test_v2_raises_on_missing_accepted_scheme(self) -> None:
        bad = {**_PAYLOAD_V2, "accepted": {"network": "eip155:8453"}}
        with pytest.raises(ValueError, match="Missing scheme"):
            get_scheme_and_network(2, bad)

    def test_v2_raises_on_missing_accepted_network(self) -> None:
        bad = {**_PAYLOAD_V2, "accepted": {"scheme": "exact"}}
        with pytest.raises(ValueError, match="Missing network"):
            get_scheme_and_network(2, bad)

    def test_v2_empty_accepted_raises(self) -> None:
        bad = {**_PAYLOAD_V2, "accepted": {}}
        with pytest.raises(ValueError):
            get_scheme_and_network(2, bad)


# ---------------------------------------------------------------------------
# match_payload_to_requirements
# ---------------------------------------------------------------------------


class TestMatchPayloadToRequirements:
    def test_v1_match(self) -> None:
        req = {"scheme": "exact", "network": "base-sepolia"}
        payload = {"scheme": "exact", "network": "base-sepolia"}
        assert match_payload_to_requirements(1, payload, req) is True

    def test_v1_no_match_scheme(self) -> None:
        req = {"scheme": "exact", "network": "base-sepolia"}
        payload = {"scheme": "upto", "network": "base-sepolia"}
        assert match_payload_to_requirements(1, payload, req) is False

    def test_v1_no_match_network(self) -> None:
        req = {"scheme": "exact", "network": "base-sepolia"}
        payload = {"scheme": "exact", "network": "base-mainnet"}
        assert match_payload_to_requirements(1, payload, req) is False

    def test_v1_from_bytes(self) -> None:
        req = json.dumps({"scheme": "exact", "network": "base-sepolia"}).encode()
        payload = json.dumps({"scheme": "exact", "network": "base-sepolia"}).encode()
        assert match_payload_to_requirements(1, payload, req) is True

    def test_v2_match(self) -> None:
        req = {
            "scheme": "exact",
            "network": "eip155:8453",
            "amount": "100",
            "asset": "0xUSDC",
            "payTo": "0xRecipient",
        }
        payload = {
            "accepted": {
                "scheme": "exact",
                "network": "eip155:8453",
                "amount": "100",
                "asset": "0xUSDC",
                "payTo": "0xRecipient",
            }
        }
        assert match_payload_to_requirements(2, payload, req) is True

    def test_v2_no_match_amount(self) -> None:
        req = {
            "scheme": "exact",
            "network": "eip155:8453",
            "amount": "100",
            "asset": "0xUSDC",
            "payTo": "0xRecipient",
        }
        payload = {
            "accepted": {
                "scheme": "exact",
                "network": "eip155:8453",
                "amount": "999",
                "asset": "0xUSDC",
                "payTo": "0xRecipient",
            }
        }
        assert match_payload_to_requirements(2, payload, req) is False

    def test_v2_no_match_asset(self) -> None:
        req = {
            "scheme": "exact",
            "network": "eip155:8453",
            "amount": "100",
            "asset": "0xUSDC",
            "payTo": "0xRecipient",
        }
        payload = {
            "accepted": {
                "scheme": "exact",
                "network": "eip155:8453",
                "amount": "100",
                "asset": "0xDAI",
                "payTo": "0xRecipient",
            }
        }
        assert match_payload_to_requirements(2, payload, req) is False

    def test_v2_no_match_pay_to(self) -> None:
        req = {
            "scheme": "exact",
            "network": "eip155:8453",
            "amount": "100",
            "asset": "0xUSDC",
            "payTo": "0xRecipient",
        }
        payload = {
            "accepted": {
                "scheme": "exact",
                "network": "eip155:8453",
                "amount": "100",
                "asset": "0xUSDC",
                "payTo": "0xOther",
            }
        }
        assert match_payload_to_requirements(2, payload, req) is False

    def test_v2_from_bytes(self) -> None:
        req_dict = {
            "scheme": "exact",
            "network": "eip155:8453",
            "amount": "1",
            "asset": "0xA",
            "payTo": "0xB",
        }
        payload_dict = {
            "accepted": {
                "scheme": "exact",
                "network": "eip155:8453",
                "amount": "1",
                "asset": "0xA",
                "payTo": "0xB",
            }
        }
        assert (
            match_payload_to_requirements(
                2,
                json.dumps(payload_dict).encode(),
                json.dumps(req_dict).encode(),
            )
            is True
        )


# ---------------------------------------------------------------------------
# parse_payment_required
# ---------------------------------------------------------------------------


class TestParsePaymentRequired:
    def test_v1_from_dict(self) -> None:
        result = parse_payment_required(_REQ_V1)
        assert isinstance(result, PaymentRequiredV1)
        assert result.x402_version == 1
        assert len(result.accepts) == 1
        assert result.accepts[0].scheme == "exact"

    def test_v2_from_dict(self) -> None:
        result = parse_payment_required(_REQ_V2)
        assert isinstance(result, PaymentRequired)
        assert result.x402_version == 2
        assert len(result.accepts) == 1
        assert result.accepts[0].scheme == "exact"

    def test_v1_from_bytes(self) -> None:
        result = parse_payment_required(json.dumps(_REQ_V1).encode())
        assert isinstance(result, PaymentRequiredV1)
        assert result.x402_version == 1

    def test_v2_from_bytes(self) -> None:
        result = parse_payment_required(json.dumps(_REQ_V2).encode())
        assert isinstance(result, PaymentRequired)
        assert result.x402_version == 2

    def test_v1_network_preserved(self) -> None:
        result = parse_payment_required(_REQ_V1)
        assert isinstance(result, PaymentRequiredV1)
        assert result.accepts[0].network == "base-sepolia"

    def test_v2_network_preserved(self) -> None:
        result = parse_payment_required(_REQ_V2)
        assert isinstance(result, PaymentRequired)
        assert result.accepts[0].network == "eip155:8453"

    def test_raises_on_missing_version(self) -> None:
        with pytest.raises(ValueError):
            parse_payment_required({"accepts": []})

    def test_optional_error_field_v2(self) -> None:
        data = {**_REQ_V2, "error": "oops"}
        result = parse_payment_required(data)
        assert isinstance(result, PaymentRequired)
        assert result.error == "oops"


# ---------------------------------------------------------------------------
# parse_payment_payload
# ---------------------------------------------------------------------------


class TestParsePaymentPayload:
    def test_v1_from_dict(self) -> None:
        result = parse_payment_payload(_PAYLOAD_V1)
        assert isinstance(result, PaymentPayloadV1)
        assert result.x402_version == 1
        assert result.scheme == "exact"
        assert result.network == "base-sepolia"

    def test_v2_from_dict(self) -> None:
        result = parse_payment_payload(_PAYLOAD_V2)
        assert isinstance(result, PaymentPayload)
        assert result.x402_version == 2

    def test_v1_from_bytes(self) -> None:
        result = parse_payment_payload(json.dumps(_PAYLOAD_V1).encode())
        assert isinstance(result, PaymentPayloadV1)

    def test_v2_from_bytes(self) -> None:
        result = parse_payment_payload(json.dumps(_PAYLOAD_V2).encode())
        assert isinstance(result, PaymentPayload)

    def test_v1_payload_preserved(self) -> None:
        result = parse_payment_payload(_PAYLOAD_V1)
        assert isinstance(result, PaymentPayloadV1)
        assert result.payload == {"signature": "0xdeadbeef"}

    def test_raises_on_missing_version(self) -> None:
        with pytest.raises(ValueError):
            parse_payment_payload({"scheme": "exact"})


# ---------------------------------------------------------------------------
# parse_payment_requirements
# ---------------------------------------------------------------------------


class TestParsePaymentRequirements:
    def test_v1_from_dict(self) -> None:
        req_data = _REQ_V1["accepts"][0]
        result = parse_payment_requirements(1, req_data)
        assert isinstance(result, PaymentRequirementsV1)
        assert result.scheme == "exact"
        assert result.network == "base-sepolia"

    def test_v2_from_dict(self) -> None:
        req_data = _REQ_V2["accepts"][0]
        result = parse_payment_requirements(2, req_data)
        from x402.schemas.payments import PaymentRequirements

        assert isinstance(result, PaymentRequirements)
        assert result.scheme == "exact"
        assert result.network == "eip155:8453"

    def test_v1_from_bytes(self) -> None:
        req_data = json.dumps(_REQ_V1["accepts"][0]).encode()
        result = parse_payment_requirements(1, req_data)
        assert isinstance(result, PaymentRequirementsV1)

    def test_v2_from_bytes(self) -> None:
        from x402.schemas.payments import PaymentRequirements

        req_data = json.dumps(_REQ_V2["accepts"][0]).encode()
        result = parse_payment_requirements(2, req_data)
        assert isinstance(result, PaymentRequirements)

    def test_raises_on_invalid_version_0(self) -> None:
        with pytest.raises(ValueError, match="Invalid x402Version: 0"):
            parse_payment_requirements(0, {})

    def test_raises_on_invalid_version_3(self) -> None:
        with pytest.raises(ValueError, match="Invalid x402Version: 3"):
            parse_payment_requirements(3, {})


# ---------------------------------------------------------------------------
# matches_network_pattern
# ---------------------------------------------------------------------------


class TestMatchesNetworkPattern:
    def test_exact_match(self) -> None:
        assert matches_network_pattern("eip155:8453", "eip155:8453") is True

    def test_wildcard_match_same_namespace(self) -> None:
        assert matches_network_pattern("eip155:8453", "eip155:*") is True

    def test_wildcard_no_match_different_namespace(self) -> None:
        assert matches_network_pattern("eip155:8453", "solana:*") is False

    def test_exact_no_match(self) -> None:
        assert matches_network_pattern("eip155:8453", "eip155:1") is False

    def test_testnet_wildcard(self) -> None:
        assert matches_network_pattern("eip155:84532", "eip155:*") is True

    def test_solana_exact(self) -> None:
        assert matches_network_pattern("solana:mainnet", "solana:mainnet") is True

    def test_solana_wildcard(self) -> None:
        assert matches_network_pattern("solana:devnet", "solana:*") is True

    def test_solana_wildcard_no_match_evm(self) -> None:
        assert matches_network_pattern("eip155:8453", "solana:*") is False

    def test_wildcard_does_not_match_bare_namespace(self) -> None:
        # "eip155" without ":" prefix should not match "eip155:*"
        assert matches_network_pattern("eip155", "eip155:*") is False


# ---------------------------------------------------------------------------
# derive_network_pattern
# ---------------------------------------------------------------------------


class TestDeriveNetworkPattern:
    def test_single_network_returns_wildcard(self) -> None:
        result = derive_network_pattern(["eip155:8453"])
        assert result == "eip155:*"

    def test_two_same_namespace_returns_wildcard(self) -> None:
        result = derive_network_pattern(["eip155:8453", "eip155:84532"])
        assert result == "eip155:*"

    def test_many_same_namespace_returns_wildcard(self) -> None:
        networks = ["eip155:1", "eip155:8453", "eip155:84532", "eip155:10"]
        result = derive_network_pattern(networks)
        assert result == "eip155:*"

    def test_different_namespaces_returns_first(self) -> None:
        result = derive_network_pattern(["eip155:8453", "solana:mainnet"])
        assert result == "eip155:8453"

    def test_solana_only_returns_wildcard(self) -> None:
        result = derive_network_pattern(["solana:mainnet", "solana:devnet"])
        assert result == "solana:*"

    def test_empty_list_raises(self) -> None:
        with pytest.raises(ValueError, match="At least one network"):
            derive_network_pattern([])

    def test_mixed_three_namespaces_returns_first(self) -> None:
        networks = ["eip155:1", "solana:mainnet", "cosmos:hub"]
        result = derive_network_pattern(networks)
        assert result == "eip155:1"


# ---------------------------------------------------------------------------
# find_schemes_by_network
# ---------------------------------------------------------------------------


class TestFindSchemesByNetwork:
    def _make_schemes(self) -> dict:
        return {
            "eip155:8453": {"exact": "evm_exact_impl"},
            "eip155:*": {"exact": "evm_wildcard_impl", "upto": "evm_upto_impl"},
            "solana:mainnet": {"exact": "svm_impl"},
        }

    def test_exact_match_returned(self) -> None:
        schemes = self._make_schemes()
        result = find_schemes_by_network(schemes, "eip155:8453")
        assert result == {"exact": "evm_exact_impl"}

    def test_wildcard_fallback(self) -> None:
        schemes = self._make_schemes()
        # eip155:1 is not exact-matched, so wildcard eip155:* should apply
        result = find_schemes_by_network(schemes, "eip155:1")
        assert result is not None
        assert "exact" in result
        assert result["exact"] == "evm_wildcard_impl"

    def test_solana_exact_match(self) -> None:
        schemes = self._make_schemes()
        result = find_schemes_by_network(schemes, "solana:mainnet")
        assert result == {"exact": "svm_impl"}

    def test_unknown_network_returns_none(self) -> None:
        schemes = self._make_schemes()
        result = find_schemes_by_network(schemes, "cosmos:hub")
        assert result is None

    def test_empty_schemes_returns_none(self) -> None:
        result = find_schemes_by_network({}, "eip155:8453")
        assert result is None

    def test_exact_takes_precedence_over_wildcard(self) -> None:
        # eip155:8453 is explicit — should NOT fall through to eip155:*
        schemes = self._make_schemes()
        result = find_schemes_by_network(schemes, "eip155:8453")
        assert result == {"exact": "evm_exact_impl"}
        # wildcard would have "upto" too, but exact entry doesn't
        assert "upto" not in result

    def test_wildcard_only_entry(self) -> None:
        schemes: dict = {"eip155:*": {"exact": "generic_evm"}}
        result = find_schemes_by_network(schemes, "eip155:84532")
        assert result == {"exact": "generic_evm"}

    def test_different_wildcard_no_match(self) -> None:
        schemes: dict = {"solana:*": {"exact": "svm_all"}}
        result = find_schemes_by_network(schemes, "eip155:8453")
        assert result is None
