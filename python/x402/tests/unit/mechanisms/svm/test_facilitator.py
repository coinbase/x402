"""Tests for ExactSvmScheme facilitator."""

from x402.mechanisms.svm import (
    SOLANA_DEVNET_CAIP2,
    SOLANA_MAINNET_CAIP2,
    USDC_DEVNET_ADDRESS,
)
from x402.mechanisms.svm.exact import ExactSvmFacilitatorScheme
from x402.schemas import PaymentPayload, PaymentRequirements, ResourceInfo


class MockFacilitatorSigner:
    """Mock facilitator signer for testing."""

    def __init__(self, addresses: list[str] | None = None):
        self._addresses = addresses or ["FeePayer1111111111111111111111111111"]

    def get_addresses(self) -> list[str]:
        return self._addresses

    def sign_transaction(self, tx_base64: str, fee_payer: str, network: str) -> str:
        if fee_payer not in self._addresses:
            raise ValueError(f"No signer for feePayer {fee_payer}")
        return tx_base64

    def simulate_transaction(self, tx_base64: str, network: str) -> None:
        pass

    def send_transaction(self, tx_base64: str, network: str) -> str:
        return "mockSignature123"

    def confirm_transaction(self, signature: str, network: str) -> None:
        pass


class TestExactSvmSchemeConstructor:
    """Test ExactSvmScheme facilitator constructor."""

    def test_should_create_instance_with_correct_scheme(self):
        """Should create instance with correct scheme."""
        signer = MockFacilitatorSigner()
        facilitator = ExactSvmFacilitatorScheme(signer)

        assert facilitator.scheme == "exact"


class TestVerify:
    """Test verify method."""

    def test_should_reject_if_scheme_does_not_match(self):
        """Should reject if scheme does not match."""
        signer = MockFacilitatorSigner()
        facilitator = ExactSvmFacilitatorScheme(signer)

        payload = PaymentPayload(
            x402_version=2,
            resource=ResourceInfo(
                url="http://example.com/protected",
                description="Test resource",
                mime_type="application/json",
            ),
            accepted=PaymentRequirements(
                scheme="wrong",  # Wrong scheme
                network=SOLANA_DEVNET_CAIP2,
                asset=USDC_DEVNET_ADDRESS,
                amount="100000",
                pay_to="PayToAddress11111111111111111111111111",
                max_timeout_seconds=3600,
                extra={"feePayer": "FeePayer1111111111111111111111111111"},
            ),
            payload={"transaction": "base64transaction=="},
        )

        requirements = PaymentRequirements(
            scheme="exact",
            network=SOLANA_DEVNET_CAIP2,
            asset=USDC_DEVNET_ADDRESS,
            amount="100000",
            pay_to="PayToAddress11111111111111111111111111",
            max_timeout_seconds=3600,
            extra={"feePayer": "FeePayer1111111111111111111111111111"},
        )

        result = facilitator.verify(payload, requirements)

        assert result.is_valid is False
        assert result.invalid_reason == "unsupported_scheme"

    def test_should_reject_if_network_does_not_match(self):
        """Should reject if network does not match."""
        signer = MockFacilitatorSigner()
        facilitator = ExactSvmFacilitatorScheme(signer)

        payload = PaymentPayload(
            x402_version=2,
            resource=ResourceInfo(
                url="http://example.com/protected",
                description="Test resource",
                mime_type="application/json",
            ),
            accepted=PaymentRequirements(
                scheme="exact",
                network=SOLANA_MAINNET_CAIP2,  # Mainnet
                asset=USDC_DEVNET_ADDRESS,
                amount="100000",
                pay_to="PayToAddress11111111111111111111111111",
                max_timeout_seconds=3600,
                extra={"feePayer": "FeePayer1111111111111111111111111111"},
            ),
            payload={"transaction": "validbase64transaction=="},
        )

        requirements = PaymentRequirements(
            scheme="exact",
            network=SOLANA_DEVNET_CAIP2,  # Devnet
            asset=USDC_DEVNET_ADDRESS,
            amount="100000",
            pay_to="PayToAddress11111111111111111111111111",
            max_timeout_seconds=3600,
            extra={"feePayer": "FeePayer1111111111111111111111111111"},
        )

        result = facilitator.verify(payload, requirements)

        # Network check happens early
        assert result.is_valid is False
        assert result.invalid_reason == "network_mismatch"

    def test_should_reject_if_fee_payer_is_missing(self):
        """Should reject if feePayer is missing."""
        signer = MockFacilitatorSigner()
        facilitator = ExactSvmFacilitatorScheme(signer)

        payload = PaymentPayload(
            x402_version=2,
            resource=ResourceInfo(
                url="http://example.com/protected",
                description="Test resource",
                mime_type="application/json",
            ),
            accepted=PaymentRequirements(
                scheme="exact",
                network=SOLANA_DEVNET_CAIP2,
                asset=USDC_DEVNET_ADDRESS,
                amount="100000",
                pay_to="PayToAddress11111111111111111111111111",
                max_timeout_seconds=3600,
                extra={},  # Missing feePayer
            ),
            payload={"transaction": "base64transaction=="},
        )

        requirements = PaymentRequirements(
            scheme="exact",
            network=SOLANA_DEVNET_CAIP2,
            asset=USDC_DEVNET_ADDRESS,
            amount="100000",
            pay_to="PayToAddress11111111111111111111111111",
            max_timeout_seconds=3600,
            extra={},  # Missing feePayer
        )

        result = facilitator.verify(payload, requirements)

        assert result.is_valid is False
        assert result.invalid_reason == "invalid_exact_svm_payload_missing_fee_payer"

    def test_should_reject_if_transaction_cannot_be_decoded(self):
        """Should reject if transaction cannot be decoded."""
        signer = MockFacilitatorSigner()
        facilitator = ExactSvmFacilitatorScheme(signer)

        payload = PaymentPayload(
            x402_version=2,
            resource=ResourceInfo(
                url="http://example.com/protected",
                description="Test resource",
                mime_type="application/json",
            ),
            accepted=PaymentRequirements(
                scheme="exact",
                network=SOLANA_DEVNET_CAIP2,
                asset=USDC_DEVNET_ADDRESS,
                amount="100000",
                pay_to="PayToAddress11111111111111111111111111",
                max_timeout_seconds=3600,
                extra={"feePayer": "FeePayer1111111111111111111111111111"},
            ),
            payload={"transaction": "invalid!!!"},  # Invalid base64
        )

        requirements = PaymentRequirements(
            scheme="exact",
            network=SOLANA_DEVNET_CAIP2,
            asset=USDC_DEVNET_ADDRESS,
            amount="100000",
            pay_to="PayToAddress11111111111111111111111111",
            max_timeout_seconds=3600,
            extra={"feePayer": "FeePayer1111111111111111111111111111"},
        )

        result = facilitator.verify(payload, requirements)

        assert result.is_valid is False
        # Transaction decoding or instruction validation fails
        assert "invalid_exact_svm_payload" in result.invalid_reason


class TestSettle:
    """Test settle method."""

    def test_should_fail_settlement_if_verification_fails(self):
        """Should fail settlement if verification fails."""
        signer = MockFacilitatorSigner()
        facilitator = ExactSvmFacilitatorScheme(signer)

        payload = PaymentPayload(
            x402_version=2,
            resource=ResourceInfo(
                url="http://example.com/protected",
                description="Test resource",
                mime_type="application/json",
            ),
            accepted=PaymentRequirements(
                scheme="wrong",  # Wrong scheme
                network=SOLANA_DEVNET_CAIP2,
                asset=USDC_DEVNET_ADDRESS,
                amount="100000",
                pay_to="PayToAddress11111111111111111111111111",
                max_timeout_seconds=3600,
                extra={"feePayer": "FeePayer1111111111111111111111111111"},
            ),
            payload={"transaction": "base64transaction=="},
        )

        requirements = PaymentRequirements(
            scheme="exact",
            network=SOLANA_DEVNET_CAIP2,
            asset=USDC_DEVNET_ADDRESS,
            amount="100000",
            pay_to="PayToAddress11111111111111111111111111",
            max_timeout_seconds=3600,
            extra={"feePayer": "FeePayer1111111111111111111111111111"},
        )

        result = facilitator.settle(payload, requirements)

        assert result.success is False
        assert result.error_reason == "unsupported_scheme"
        assert result.network == SOLANA_DEVNET_CAIP2


class TestFacilitatorSchemeAttributes:
    """Test facilitator scheme attributes."""

    def test_scheme_attribute_is_exact(self):
        """scheme attribute should be 'exact'."""
        signer = MockFacilitatorSigner()
        facilitator = ExactSvmFacilitatorScheme(signer)

        assert facilitator.scheme == "exact"

    def test_caip_family_attribute(self):
        """caip_family attribute should be 'solana:*'."""
        signer = MockFacilitatorSigner()
        facilitator = ExactSvmFacilitatorScheme(signer)

        assert facilitator.caip_family == "solana:*"

    def test_get_extra_returns_fee_payer(self):
        """get_extra should return feePayer address."""
        signer = MockFacilitatorSigner(["TestFeePayer11111111111111111111111"])
        facilitator = ExactSvmFacilitatorScheme(signer)

        extra = facilitator.get_extra(SOLANA_DEVNET_CAIP2)

        assert extra is not None
        assert "feePayer" in extra
        assert extra["feePayer"] == "TestFeePayer11111111111111111111111"

    def test_get_signers_returns_signer_addresses(self):
        """get_signers should return list of signer addresses."""
        addresses = [
            "Signer1111111111111111111111111111111",
            "Signer2222222222222222222222222222222",
        ]
        signer = MockFacilitatorSigner(addresses)
        facilitator = ExactSvmFacilitatorScheme(signer)

        result = facilitator.get_signers(SOLANA_DEVNET_CAIP2)

        assert result == addresses


class TestVerifyFeePayer:
    """Test fee payer verification in verify method."""

    def test_should_reject_if_fee_payer_not_managed(self):
        """Should reject if feePayer is not managed by facilitator."""
        signer = MockFacilitatorSigner(["ManagedPayer111111111111111111111111"])
        facilitator = ExactSvmFacilitatorScheme(signer)

        payload = PaymentPayload(
            x402_version=2,
            resource=ResourceInfo(
                url="http://example.com/protected",
                description="Test resource",
                mime_type="application/json",
            ),
            accepted=PaymentRequirements(
                scheme="exact",
                network=SOLANA_DEVNET_CAIP2,
                asset=USDC_DEVNET_ADDRESS,
                amount="100000",
                pay_to="PayToAddress11111111111111111111111111",
                max_timeout_seconds=3600,
                extra={"feePayer": "UnmanagedPayer1111111111111111111"},  # Not managed
            ),
            payload={"transaction": "base64transaction=="},
        )

        requirements = PaymentRequirements(
            scheme="exact",
            network=SOLANA_DEVNET_CAIP2,
            asset=USDC_DEVNET_ADDRESS,
            amount="100000",
            pay_to="PayToAddress11111111111111111111111111",
            max_timeout_seconds=3600,
            extra={"feePayer": "UnmanagedPayer1111111111111111111"},  # Not managed
        )

        result = facilitator.verify(payload, requirements)

        assert result.is_valid is False
        assert result.invalid_reason == "fee_payer_not_managed_by_facilitator"
