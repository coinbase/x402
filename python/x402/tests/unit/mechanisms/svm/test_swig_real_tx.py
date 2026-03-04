"""Integration tests using a real Swig devnet transaction.

Validates the full pipeline (detection, parsing, normalization, verification)
against a confirmed Swig smart wallet USDC transfer on devnet:
  tx: 2TAkeCETVcsbtmK1UMdgk2BZVdWQjnv7s2s7QUYv3Ynaqh36iXVdwM1ong8hmRw4Za3Yw8CkjgVwiyUpGR6SQP1g
"""

import base64

from solders.transaction import VersionedTransaction

from x402.mechanisms.svm import SOLANA_DEVNET_CAIP2
from x402.mechanisms.svm.constants import USDC_DEVNET_ADDRESS
from x402.mechanisms.svm.exact import ExactSvmFacilitatorScheme
from x402.mechanisms.svm.normalizer import normalize_transaction
from x402.mechanisms.svm.swig import is_swig_transaction, parse_swig_transaction
from x402.schemas import PaymentPayload, PaymentRequirements, ResourceInfo

# Real confirmed Swig smart wallet USDC transfer on devnet
REAL_SWIG_TX_BASE64 = (
    "AkiVWpmnwCMi7VKkTgzdR2vqY1fOSr14KPzUnzCNQpeOMif5NskDc4uS+gOp8RgsErjrnGLEYL1N"
    "268w+qF+dge3oCdndWRM1K0yufH+fFvkZZ4Bs3zo54vRPaX9frRvVfnjAvIaF+LrUcesSgDzelLub"
    "NZgz/xTZpMF+M73W2QBgAIBBAqZaoBA6PatAWpRvzksIlZIPBdwhETOtNqkgD0atmy0InVOnwjWNA"
    "xK9dVi7s3ExZUKIESvFVgLxy2EuifanfHXNuKlxHOPekji0xlP2QWZWAXWe2Waz6nHvKl8rEzDOBW"
    "YZE9jRaDJ3Di+pFN1xwc5xnR4DB9Ie84lQHbJaXPMB+psglirF8mTyZ49SOemjo+02LMohN2jyoK"
    "VBiPYUEFBZOwM3pq0f7lZsDDur9i+ue/ujyUjQwUnXvJRe7/+3hMDBkZv5SEXMv/srbpyw5vnvIz"
    "lu8X3EmssQ5s6QAAAAA0M6ULh58UG4hjfDX3xxS+v3DUp5I1nTR2yTHW1TMy+Bt324ddloZPZy+F"
    "Gzut5rBy0he1fWzeROoz1hX7/AKk7RCyzkSFX8TqTPQE0KC0DK1/+zQGi2/G3eQYI3wAup78zWM"
    "i4yXOAY9JrFqsFFkNRq8dONAlh9AOdsB99f/m6AwYACQNkAAAAAAAAAAYABQKAGgYABwcCAwEIBA"
    "kFHAsAEwAAAAAAAQMEBAUGAQoADAEAAAAAAAAABgIA"
)

FEE_PAYER = "BKsZvzPUY6VT2GpLMxx6fA6fuC8MK3hVxwdjK8yqmqSR"
SWIG_PDA = "4hFTuZxrMbZciAxA9DcLYYC9vupNuw89v527ys6PvRo2"
PAY_TO = "EkkpfzUdwwgeqWb25hWcSi2c5gquELLUB3Z2asr1Xroo"


def _decode_tx() -> VersionedTransaction:
    raw = base64.b64decode(REAL_SWIG_TX_BASE64)
    return VersionedTransaction.from_bytes(raw)


class MockFacilitatorSigner:
    """Mock facilitator signer for testing with real fee payer address."""

    def __init__(self, addresses: list[str] | None = None):
        self._addresses = addresses or [FEE_PAYER]

    def get_addresses(self) -> list[str]:
        return self._addresses

    def sign_transaction(self, tx_base64: str, fee_payer: str, network: str) -> str:
        return tx_base64

    def simulate_transaction(self, tx_base64: str, network: str) -> None:
        pass

    def send_transaction(self, tx_base64: str, network: str) -> str:
        return "mockSignature123"

    def confirm_transaction(self, signature: str, network: str) -> None:
        pass


class TestIsSwigTransaction:
    """Detect that the real devnet tx is a Swig transaction."""

    def test_real_tx_detected_as_swig(self):
        tx = _decode_tx()
        assert is_swig_transaction(tx) is True


class TestParseSwigTransaction:
    """Parse and flatten the real devnet Swig transaction."""

    def test_flattened_instruction_count(self):
        tx = _decode_tx()
        result = parse_swig_transaction(tx)
        assert len(result.instructions) == 3

    def test_swig_pda(self):
        tx = _decode_tx()
        result = parse_swig_transaction(tx)
        assert result.swig_pda == SWIG_PDA

    def test_transfer_checked_discriminator(self):
        tx = _decode_tx()
        result = parse_swig_transaction(tx)
        transfer_ix = result.instructions[2]
        assert transfer_ix.data[0] == 12

    def test_transfer_checked_amount_and_decimals(self):
        tx = _decode_tx()
        result = parse_swig_transaction(tx)
        transfer_ix = result.instructions[2]
        amount = int.from_bytes(transfer_ix.data[1:9], "little")
        decimals = transfer_ix.data[9]
        assert amount == 1
        assert decimals == 6


class TestNormalizeTransaction:
    """Verify normalizer picks SwigNormalizer and returns correct payer."""

    def test_normalizer_returns_swig_pda_as_payer(self):
        tx = _decode_tx()
        normalized = normalize_transaction(tx)
        assert normalized.payer == SWIG_PDA

    def test_normalizer_returns_three_instructions(self):
        tx = _decode_tx()
        normalized = normalize_transaction(tx)
        assert len(normalized.instructions) == 3


class TestVerifyPipeline:
    """Full verify() pipeline via ExactSvmFacilitatorScheme."""

    def _make_payload_and_requirements(self):
        requirements = PaymentRequirements(
            scheme="exact",
            network=SOLANA_DEVNET_CAIP2,
            asset=USDC_DEVNET_ADDRESS,
            amount="1",
            pay_to=PAY_TO,
            max_timeout_seconds=3600,
            extra={"feePayer": FEE_PAYER},
        )
        payload = PaymentPayload(
            x402_version=2,
            resource=ResourceInfo(
                url="http://example.com/protected",
                description="Test resource",
                mime_type="application/json",
            ),
            accepted=requirements,
            payload={"transaction": REAL_SWIG_TX_BASE64},
        )
        return payload, requirements

    def test_verify_is_valid(self):
        signer = MockFacilitatorSigner()
        facilitator = ExactSvmFacilitatorScheme(signer)
        payload, requirements = self._make_payload_and_requirements()

        result = facilitator.verify(payload, requirements)

        assert result.is_valid is True

    def test_verify_payer_is_swig_pda(self):
        signer = MockFacilitatorSigner()
        facilitator = ExactSvmFacilitatorScheme(signer)
        payload, requirements = self._make_payload_and_requirements()

        result = facilitator.verify(payload, requirements)

        assert result.payer == SWIG_PDA
