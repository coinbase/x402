"""Tests for ExactSvmSchemeV1 client (legacy V1 SVM exact scheme)."""

import base64
from unittest.mock import MagicMock, patch

import pytest
from solders.hash import Hash
from solders.keypair import Keypair

from x402.mechanisms.svm import (
    SOLANA_DEVNET_CAIP2,
    SOLANA_MAINNET_CAIP2,
    USDC_DEVNET_ADDRESS,
    USDC_MAINNET_ADDRESS,
)
from x402.mechanisms.svm.constants import (
    DEVNET_RPC_URL,
    MAINNET_RPC_URL,
    MAX_MEMO_BYTES,
    TOKEN_2022_PROGRAM_ADDRESS,
    TOKEN_PROGRAM_ADDRESS,
)
from x402.mechanisms.svm.exact.v1.client import ExactSvmSchemeV1
from x402.mechanisms.svm.signers import KeypairSigner
from x402.schemas.v1 import PaymentRequirementsV1

# Stable valid base58 Solana pubkeys generated once for fixture stability.
FEE_PAYER = "B92WoWzgcHESd9VU4znrSVy2Zokh7VxbhSakgATcjNpH"
PAY_TO = "3jRL86NVtGwDSLUXWwu4oSa1ZAn3PaNVHY2RaCKTF1RT"


def _make_requirements(
    *,
    network: str = "solana-devnet",
    asset: str = USDC_DEVNET_ADDRESS,
    pay_to: str = PAY_TO,
    max_amount_required: str = "500000",
    extra: dict | None = None,
) -> PaymentRequirementsV1:
    return PaymentRequirementsV1(
        scheme="exact",
        network=network,
        max_amount_required=max_amount_required,
        resource="http://example.com/protected",
        description="Test resource",
        mime_type="application/json",
        pay_to=pay_to,
        max_timeout_seconds=3600,
        asset=asset,
        extra=extra if extra is not None else {"feePayer": FEE_PAYER},
    )


def _mock_mint_account_info(*, owner: str = TOKEN_PROGRAM_ADDRESS, decimals: int = 6):
    """Build a fake get_account_info response with parseable mint data.

    The SPL Token Mint layout puts decimals at byte 44, so the data buffer
    only needs to be at least 45 bytes long for the client's slicing to work.
    """
    mint_data = bytearray(82)
    mint_data[44] = decimals
    value = MagicMock()
    value.owner = owner
    value.data = bytes(mint_data)
    response = MagicMock()
    response.value = value
    return response


def _mock_solana_client(
    *, mint_owner: str = TOKEN_PROGRAM_ADDRESS, decimals: int = 6, mint_missing: bool = False
):
    client = MagicMock()
    if mint_missing:
        missing = MagicMock()
        missing.value = None
        client.get_account_info.return_value = missing
    else:
        client.get_account_info.return_value = _mock_mint_account_info(
            owner=mint_owner, decimals=decimals
        )
    blockhash_resp = MagicMock()
    blockhash_resp.value.blockhash = Hash.default()
    client.get_latest_blockhash.return_value = blockhash_resp
    return client


class TestExactSvmSchemeV1Constructor:
    """ExactSvmSchemeV1 constructor."""

    def test_scheme_attribute_is_exact(self):
        signer = KeypairSigner(Keypair())
        scheme = ExactSvmSchemeV1(signer)

        assert scheme.scheme == "exact"

    def test_stores_signer_reference(self):
        signer = KeypairSigner(Keypair())
        scheme = ExactSvmSchemeV1(signer)

        assert scheme._signer is signer

    def test_default_rpc_url_is_none(self):
        scheme = ExactSvmSchemeV1(KeypairSigner(Keypair()))

        assert scheme._custom_rpc_url is None

    def test_accepts_optional_rpc_url(self):
        scheme = ExactSvmSchemeV1(KeypairSigner(Keypair()), rpc_url="https://custom-rpc.com")

        assert scheme._custom_rpc_url == "https://custom-rpc.com"

    def test_clients_cache_starts_empty(self):
        scheme = ExactSvmSchemeV1(KeypairSigner(Keypair()))

        assert scheme._clients == {}


class TestGetClient:
    """ExactSvmSchemeV1._get_client behavior."""

    def test_uses_default_rpc_url_for_caip2_devnet(self):
        scheme = ExactSvmSchemeV1(KeypairSigner(Keypair()))

        with patch("x402.mechanisms.svm.exact.v1.client.SolanaClient") as MockClient:
            scheme._get_client(SOLANA_DEVNET_CAIP2)

        MockClient.assert_called_once_with(DEVNET_RPC_URL)

    def test_uses_default_rpc_url_for_caip2_mainnet(self):
        scheme = ExactSvmSchemeV1(KeypairSigner(Keypair()))

        with patch("x402.mechanisms.svm.exact.v1.client.SolanaClient") as MockClient:
            scheme._get_client(SOLANA_MAINNET_CAIP2)

        MockClient.assert_called_once_with(MAINNET_RPC_URL)

    def test_normalizes_legacy_v1_network_name_to_caip2(self):
        """V1 legacy 'solana-devnet' should normalize to the CAIP-2 devnet URL."""
        scheme = ExactSvmSchemeV1(KeypairSigner(Keypair()))

        with patch("x402.mechanisms.svm.exact.v1.client.SolanaClient") as MockClient:
            scheme._get_client("solana-devnet")

        MockClient.assert_called_once_with(DEVNET_RPC_URL)

    def test_normalizes_legacy_v1_mainnet_name_to_caip2(self):
        scheme = ExactSvmSchemeV1(KeypairSigner(Keypair()))

        with patch("x402.mechanisms.svm.exact.v1.client.SolanaClient") as MockClient:
            scheme._get_client("solana")

        MockClient.assert_called_once_with(MAINNET_RPC_URL)

    def test_custom_rpc_url_takes_priority_over_default(self):
        scheme = ExactSvmSchemeV1(KeypairSigner(Keypair()), rpc_url="https://custom-rpc.com")

        with patch("x402.mechanisms.svm.exact.v1.client.SolanaClient") as MockClient:
            scheme._get_client(SOLANA_DEVNET_CAIP2)

        MockClient.assert_called_once_with("https://custom-rpc.com")

    def test_caches_client_per_normalized_network(self):
        scheme = ExactSvmSchemeV1(KeypairSigner(Keypair()))

        with patch("x402.mechanisms.svm.exact.v1.client.SolanaClient") as MockClient:
            first = scheme._get_client("solana-devnet")
            second = scheme._get_client(SOLANA_DEVNET_CAIP2)

        # Both calls resolve to the CAIP-2 key, so only one client is constructed.
        assert first is second
        assert MockClient.call_count == 1

    def test_unsupported_network_raises_via_normalize(self):
        """An unsupported CAIP-2 network surfaces as a ValueError from
        normalize_network before _get_client even reaches the lookup."""
        scheme = ExactSvmSchemeV1(KeypairSigner(Keypair()))

        with pytest.raises(ValueError, match="Unsupported SVM network"):
            scheme._get_client("solana:unknown-genesis-hash")

    def test_unsupported_legacy_network_raises_via_normalize(self):
        scheme = ExactSvmSchemeV1(KeypairSigner(Keypair()))

        with pytest.raises(ValueError, match="Unsupported SVM network"):
            scheme._get_client("ethereum")


class TestCreatePaymentPayloadValidation:
    """create_payment_payload input validation."""

    def test_missing_fee_payer_raises(self):
        scheme = ExactSvmSchemeV1(KeypairSigner(Keypair()))
        requirements = _make_requirements(extra={})

        with pytest.raises(ValueError, match="feePayer is required"):
            scheme.create_payment_payload(requirements)

    def test_extra_none_raises_missing_fee_payer(self):
        scheme = ExactSvmSchemeV1(KeypairSigner(Keypair()))
        requirements = _make_requirements(extra=None)
        # Constructor sets default feePayer; explicitly null it.
        requirements.extra = None

        with pytest.raises(ValueError, match="feePayer is required"):
            scheme.create_payment_payload(requirements)

    def test_mint_not_found_raises(self):
        scheme = ExactSvmSchemeV1(KeypairSigner(Keypair()))
        requirements = _make_requirements()
        client = _mock_solana_client(mint_missing=True)
        scheme._clients[SOLANA_DEVNET_CAIP2] = client

        with pytest.raises(ValueError, match="Token mint not found"):
            scheme.create_payment_payload(requirements)

    def test_unknown_token_program_owner_raises(self):
        scheme = ExactSvmSchemeV1(KeypairSigner(Keypair()))
        requirements = _make_requirements()
        client = _mock_solana_client(mint_owner="UnknownProgram111111111111111111111111111111")
        scheme._clients[SOLANA_DEVNET_CAIP2] = client

        with pytest.raises(ValueError, match="Unknown token program"):
            scheme.create_payment_payload(requirements)

    def test_oversized_memo_raises(self):
        scheme = ExactSvmSchemeV1(KeypairSigner(Keypair()))
        too_long_memo = "x" * (MAX_MEMO_BYTES + 1)
        requirements = _make_requirements(
            extra={
                "feePayer": FEE_PAYER,
                "memo": too_long_memo,
            }
        )
        client = _mock_solana_client()
        scheme._clients[SOLANA_DEVNET_CAIP2] = client

        with pytest.raises(ValueError, match=f"exceeds maximum {MAX_MEMO_BYTES}"):
            scheme.create_payment_payload(requirements)


class TestCreatePaymentPayloadSuccess:
    """create_payment_payload happy paths and V1-specific behavior."""

    def _build_with_legacy_network(
        self,
        *,
        legacy_network: str,
        normalized_caip2: str,
        mint_owner: str = TOKEN_PROGRAM_ADDRESS,
        decimals: int = 6,
        extra: dict | None = None,
        max_amount_required: str = "500000",
        asset: str = USDC_DEVNET_ADDRESS,
    ):
        scheme = ExactSvmSchemeV1(KeypairSigner(Keypair()))
        client = _mock_solana_client(mint_owner=mint_owner, decimals=decimals)
        scheme._clients[normalized_caip2] = client

        requirements = _make_requirements(
            network=legacy_network,
            asset=asset,
            extra=extra,
            max_amount_required=max_amount_required,
        )
        payload = scheme.create_payment_payload(requirements)
        return scheme, client, payload

    def test_returns_dict_with_transaction_field(self):
        _, _, payload = self._build_with_legacy_network(
            legacy_network="solana-devnet",
            normalized_caip2=SOLANA_DEVNET_CAIP2,
        )

        assert isinstance(payload, dict)
        assert "transaction" in payload

    def test_transaction_field_is_base64(self):
        _, _, payload = self._build_with_legacy_network(
            legacy_network="solana-devnet",
            normalized_caip2=SOLANA_DEVNET_CAIP2,
        )

        decoded = base64.b64decode(payload["transaction"])
        assert len(decoded) > 0

    def test_legacy_solana_devnet_resolves_to_caip2_devnet(self):
        """V1 'solana-devnet' must use the CAIP-2 devnet client."""
        _, client, _ = self._build_with_legacy_network(
            legacy_network="solana-devnet",
            normalized_caip2=SOLANA_DEVNET_CAIP2,
        )

        # If normalization were broken, our pre-seeded client would not be used
        # and the call count would be zero.
        assert client.get_account_info.called
        assert client.get_latest_blockhash.called

    def test_legacy_solana_mainnet_resolves_to_caip2_mainnet(self):
        _, client, _ = self._build_with_legacy_network(
            legacy_network="solana",
            normalized_caip2=SOLANA_MAINNET_CAIP2,
            asset=USDC_MAINNET_ADDRESS,
        )

        assert client.get_account_info.called

    def test_v1_uses_max_amount_required_not_amount(self):
        """V1 must read max_amount_required (V2 reads amount). Wrong field
        would yield a different transfer-instruction byte payload."""
        _, _, payload_a = self._build_with_legacy_network(
            legacy_network="solana-devnet",
            normalized_caip2=SOLANA_DEVNET_CAIP2,
            max_amount_required="100000",
        )
        _, _, payload_b = self._build_with_legacy_network(
            legacy_network="solana-devnet",
            normalized_caip2=SOLANA_DEVNET_CAIP2,
            max_amount_required="200000",
        )

        a_bytes = base64.b64decode(payload_a["transaction"])
        b_bytes = base64.b64decode(payload_b["transaction"])
        # Different amounts must produce different serialized transactions.
        assert a_bytes != b_bytes

    def test_token_2022_owner_is_accepted(self):
        """Mint owned by Token-2022 program should also build successfully."""
        _, _, payload = self._build_with_legacy_network(
            legacy_network="solana-devnet",
            normalized_caip2=SOLANA_DEVNET_CAIP2,
            mint_owner=TOKEN_2022_PROGRAM_ADDRESS,
        )

        decoded = base64.b64decode(payload["transaction"])
        assert len(decoded) > 0

    def test_default_memo_is_random_when_not_provided(self):
        """Two payloads built without an explicit memo should not collide."""
        scheme = ExactSvmSchemeV1(KeypairSigner(Keypair()))
        client = _mock_solana_client()
        scheme._clients[SOLANA_DEVNET_CAIP2] = client

        requirements = _make_requirements()
        payload_a = scheme.create_payment_payload(requirements)
        payload_b = scheme.create_payment_payload(requirements)

        assert payload_a["transaction"] != payload_b["transaction"]

    def test_custom_memo_in_extra_is_used(self):
        """Different custom memos must produce different serialized transactions."""
        scheme = ExactSvmSchemeV1(KeypairSigner(Keypair()))
        client = _mock_solana_client()
        scheme._clients[SOLANA_DEVNET_CAIP2] = client

        memo_a = "order-12345"
        memo_b = "order-67890"
        payload_a = scheme.create_payment_payload(
            _make_requirements(extra={"feePayer": FEE_PAYER, "memo": memo_a})
        )
        payload_b = scheme.create_payment_payload(
            _make_requirements(extra={"feePayer": FEE_PAYER, "memo": memo_b})
        )

        a_bytes = base64.b64decode(payload_a["transaction"])
        b_bytes = base64.b64decode(payload_b["transaction"])
        assert memo_a.encode("utf-8") in a_bytes
        assert memo_b.encode("utf-8") in b_bytes
        assert a_bytes != b_bytes

    def test_non_string_memo_falls_back_to_random(self):
        """A non-string memo (e.g. int) is ignored, falling back to the
        random nonce branch — so two payloads with the same int memo still
        differ."""
        scheme = ExactSvmSchemeV1(KeypairSigner(Keypair()))
        client = _mock_solana_client()
        scheme._clients[SOLANA_DEVNET_CAIP2] = client

        requirements = _make_requirements(extra={"feePayer": FEE_PAYER, "memo": 12345})

        payload_a = scheme.create_payment_payload(requirements)
        payload_b = scheme.create_payment_payload(requirements)

        assert payload_a["transaction"] != payload_b["transaction"]

    def test_max_memo_bytes_is_accepted(self):
        """A memo of exactly MAX_MEMO_BYTES should be accepted (boundary)."""
        scheme = ExactSvmSchemeV1(KeypairSigner(Keypair()))
        client = _mock_solana_client()
        scheme._clients[SOLANA_DEVNET_CAIP2] = client

        memo = "y" * MAX_MEMO_BYTES
        requirements = _make_requirements(extra={"feePayer": FEE_PAYER, "memo": memo})

        payload = scheme.create_payment_payload(requirements)
        assert memo.encode("utf-8") in base64.b64decode(payload["transaction"])
