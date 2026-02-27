"""Tests for ExactEvmScheme facilitator."""

from x402.mechanisms.evm import get_asset_info
from x402.mechanisms.evm.exact import ExactEvmFacilitatorScheme, ExactEvmSchemeConfig
from x402.schemas import PaymentPayload, PaymentRequirements, ResourceInfo


class MockFacilitatorSigner:
    """Mock facilitator signer for testing."""

    def __init__(self, addresses: list[str] | None = None):
        self._addresses = addresses or ["0xFacilitator123456789012345678901234567890"]

    def get_addresses(self) -> list[str]:
        return self._addresses

    def read_contract(
        self,
        address: str,
        abi: list[dict],
        function_name: str,
        *args,
    ) -> bool:
        # Mock authorizationState - return False (nonce not used)
        if function_name == "authorizationState":
            return False
        return False

    def verify_typed_data(
        self,
        address: str,
        domain,
        types,
        primary_type: str,
        message: dict,
        signature: bytes,
    ) -> bool:
        # Mock verification - always return True for testing
        return True

    def write_contract(
        self,
        address: str,
        abi: list[dict],
        function_name: str,
        *args,
    ) -> str:
        return "0x" + "00" * 32  # Mock transaction hash

    def send_transaction(self, to: str, data: bytes) -> str:
        return "0x" + "00" * 32

    def wait_for_transaction_receipt(self, tx_hash: str):
        from x402.mechanisms.evm.types import TransactionReceipt

        return TransactionReceipt(status=1, block_number=1, tx_hash=tx_hash)

    def get_balance(self, address: str, token_address: str) -> int:
        return 1000000000  # Mock balance

    def get_chain_id(self) -> int:
        return 8453

    def get_code(self, address: str) -> bytes:
        return b""  # Mock EOA (no code)


class TestExactEvmSchemeConstructor:
    """Test ExactEvmScheme facilitator constructor."""

    def test_should_create_instance_with_correct_scheme(self):
        """Should create instance with correct scheme."""
        signer = MockFacilitatorSigner()
        facilitator = ExactEvmFacilitatorScheme(signer)

        assert facilitator.scheme == "exact"

    def test_should_create_instance_with_config(self):
        """Should create instance with config."""
        signer = MockFacilitatorSigner()
        config = ExactEvmSchemeConfig(deploy_erc4337_with_eip6492=True)
        facilitator = ExactEvmFacilitatorScheme(signer, config)

        assert facilitator.scheme == "exact"
        assert facilitator._config.deploy_erc4337_with_eip6492 is True


class TestVerify:
    """Test verify method."""

    def test_should_reject_if_scheme_does_not_match(self):
        """Should reject if scheme does not match."""
        signer = MockFacilitatorSigner()
        facilitator = ExactEvmFacilitatorScheme(signer)
        network = "eip155:8453"

        payload = PaymentPayload(
            x402_version=2,
            resource=ResourceInfo(
                url="http://example.com/protected",
                description="Test resource",
                mime_type="application/json",
            ),
            accepted=PaymentRequirements(
                scheme="wrong",  # Wrong scheme
                network=network,
                asset=get_asset_info(network, "USDC")["address"],
                amount="100000",
                pay_to="0x0987654321098765432109876543210987654321",
                max_timeout_seconds=3600,
                extra={"name": "USD Coin", "version": "2"},
            ),
            payload={
                "authorization": {
                    "from": "0x1234567890123456789012345678901234567890",
                    "to": "0x0987654321098765432109876543210987654321",
                    "value": "100000",
                    "validAfter": "1000000000",
                    "validBefore": "1000003600",
                    "nonce": "0x" + "00" * 32,
                },
                "signature": "0x" + "00" * 65,
            },
        )

        requirements = PaymentRequirements(
            scheme="exact",
            network=network,
            asset=get_asset_info(network, "USDC")["address"],
            amount="100000",
            pay_to="0x0987654321098765432109876543210987654321",
            max_timeout_seconds=3600,
            extra={"name": "USD Coin", "version": "2"},
        )

        result = facilitator.verify(payload, requirements)

        assert result.is_valid is False
        assert "unsupported_scheme" in result.invalid_reason

    def test_should_reject_if_network_does_not_match(self):
        """Should reject if network does not match."""
        signer = MockFacilitatorSigner()
        facilitator = ExactEvmFacilitatorScheme(signer)

        payload = PaymentPayload(
            x402_version=2,
            resource=ResourceInfo(
                url="http://example.com/protected",
                description="Test resource",
                mime_type="application/json",
            ),
            accepted=PaymentRequirements(
                scheme="exact",
                network="eip155:1",  # Ethereum Mainnet
                asset=get_asset_info("eip155:1", "USDC")["address"],
                amount="100000",
                pay_to="0x0987654321098765432109876543210987654321",
                max_timeout_seconds=3600,
                extra={"name": "USD Coin", "version": "2"},
            ),
            payload={
                "authorization": {
                    "from": "0x1234567890123456789012345678901234567890",
                    "to": "0x0987654321098765432109876543210987654321",
                    "value": "100000",
                    "validAfter": "1000000000",
                    "validBefore": "1000003600",
                    "nonce": "0x" + "00" * 32,
                },
                "signature": "0x" + "00" * 65,
            },
        )

        requirements = PaymentRequirements(
            scheme="exact",
            network="eip155:8453",  # Base Mainnet
            asset=get_asset_info("eip155:8453", "USDC")["address"],
            amount="100000",
            pay_to="0x0987654321098765432109876543210987654321",
            max_timeout_seconds=3600,
            extra={"name": "USD Coin", "version": "2"},
        )

        result = facilitator.verify(payload, requirements)

        # Network check happens early
        assert result.is_valid is False
        assert "network_mismatch" in result.invalid_reason

    def test_should_reject_if_eip712_domain_is_missing(self):
        """Should reject if EIP-712 domain is missing."""
        signer = MockFacilitatorSigner()
        facilitator = ExactEvmFacilitatorScheme(signer)
        network = "eip155:8453"

        payload = PaymentPayload(
            x402_version=2,
            resource=ResourceInfo(
                url="http://example.com/protected",
                description="Test resource",
                mime_type="application/json",
            ),
            accepted=PaymentRequirements(
                scheme="exact",
                network=network,
                asset=get_asset_info(network, "USDC")["address"],
                amount="100000",
                pay_to="0x0987654321098765432109876543210987654321",
                max_timeout_seconds=3600,
                extra={},  # Missing EIP-712 domain
            ),
            payload={
                "authorization": {
                    "from": "0x1234567890123456789012345678901234567890",
                    "to": "0x0987654321098765432109876543210987654321",
                    "value": "100000",
                    "validAfter": "1000000000",
                    "validBefore": "1000003600",
                    "nonce": "0x" + "00" * 32,
                },
                "signature": "0x" + "00" * 65,
            },
        )

        requirements = PaymentRequirements(
            scheme="exact",
            network=network,
            asset=get_asset_info(network, "USDC")["address"],
            amount="100000",
            pay_to="0x0987654321098765432109876543210987654321",
            max_timeout_seconds=3600,
            extra={},  # Missing EIP-712 domain
        )

        result = facilitator.verify(payload, requirements)

        assert result.is_valid is False
        assert "missing_eip712_domain" in result.invalid_reason

    def test_should_reject_if_recipient_does_not_match(self):
        """Should reject if recipient does not match."""
        signer = MockFacilitatorSigner()
        facilitator = ExactEvmFacilitatorScheme(signer)
        network = "eip155:8453"

        payload = PaymentPayload(
            x402_version=2,
            resource=ResourceInfo(
                url="http://example.com/protected",
                description="Test resource",
                mime_type="application/json",
            ),
            accepted=PaymentRequirements(
                scheme="exact",
                network=network,
                asset=get_asset_info(network, "USDC")["address"],
                amount="100000",
                pay_to="0x0987654321098765432109876543210987654321",
                max_timeout_seconds=3600,
                extra={"name": "USD Coin", "version": "2"},
            ),
            payload={
                "authorization": {
                    "from": "0x1234567890123456789012345678901234567890",
                    "to": "0xWrongRecipient1234567890123456789012345678",  # Wrong recipient
                    "value": "100000",
                    "validAfter": "1000000000",
                    "validBefore": "1000003600",
                    "nonce": "0x" + "00" * 32,
                },
                "signature": "0x" + "00" * 65,
            },
        )

        requirements = PaymentRequirements(
            scheme="exact",
            network=network,
            asset=get_asset_info(network, "USDC")["address"],
            amount="100000",
            pay_to="0x0987654321098765432109876543210987654321",
            max_timeout_seconds=3600,
            extra={"name": "USD Coin", "version": "2"},
        )

        result = facilitator.verify(payload, requirements)

        assert result.is_valid is False
        assert "recipient_mismatch" in result.invalid_reason

    def test_should_reject_if_amount_is_insufficient(self):
        """Should reject if amount is insufficient."""
        signer = MockFacilitatorSigner()
        facilitator = ExactEvmFacilitatorScheme(signer)
        network = "eip155:8453"

        payload = PaymentPayload(
            x402_version=2,
            resource=ResourceInfo(
                url="http://example.com/protected",
                description="Test resource",
                mime_type="application/json",
            ),
            accepted=PaymentRequirements(
                scheme="exact",
                network=network,
                asset=get_asset_info(network, "USDC")["address"],
                amount="100000",
                pay_to="0x0987654321098765432109876543210987654321",
                max_timeout_seconds=3600,
                extra={"name": "USD Coin", "version": "2"},
            ),
            payload={
                "authorization": {
                    "from": "0x1234567890123456789012345678901234567890",
                    "to": "0x0987654321098765432109876543210987654321",
                    "value": "50000",  # Less than required
                    "validAfter": "1000000000",
                    "validBefore": "1000003600",
                    "nonce": "0x" + "00" * 32,
                },
                "signature": "0x" + "00" * 65,
            },
        )

        requirements = PaymentRequirements(
            scheme="exact",
            network=network,
            asset=get_asset_info(network, "USDC")["address"],
            amount="100000",
            pay_to="0x0987654321098765432109876543210987654321",
            max_timeout_seconds=3600,
            extra={"name": "USD Coin", "version": "2"},
        )

        result = facilitator.verify(payload, requirements)

        assert result.is_valid is False
        assert "authorization_value" in result.invalid_reason


class TestSettle:
    """Test settle method."""

    def test_should_fail_settlement_if_verification_fails(self):
        """Should fail settlement if verification fails."""
        signer = MockFacilitatorSigner()
        facilitator = ExactEvmFacilitatorScheme(signer)
        network = "eip155:8453"

        payload = PaymentPayload(
            x402_version=2,
            resource=ResourceInfo(
                url="http://example.com/protected",
                description="Test resource",
                mime_type="application/json",
            ),
            accepted=PaymentRequirements(
                scheme="wrong",  # Wrong scheme
                network=network,
                asset=get_asset_info(network, "USDC")["address"],
                amount="100000",
                pay_to="0x0987654321098765432109876543210987654321",
                max_timeout_seconds=3600,
                extra={"name": "USD Coin", "version": "2"},
            ),
            payload={
                "authorization": {
                    "from": "0x1234567890123456789012345678901234567890",
                    "to": "0x0987654321098765432109876543210987654321",
                    "value": "100000",
                    "validAfter": "1000000000",
                    "validBefore": "1000003600",
                    "nonce": "0x" + "00" * 32,
                },
                "signature": "0x" + "00" * 65,
            },
        )

        requirements = PaymentRequirements(
            scheme="exact",
            network=network,
            asset=get_asset_info(network, "USDC")["address"],
            amount="100000",
            pay_to="0x0987654321098765432109876543210987654321",
            max_timeout_seconds=3600,
            extra={"name": "USD Coin", "version": "2"},
        )

        result = facilitator.settle(payload, requirements)

        assert result.success is False
        assert "unsupported_scheme" in result.error_reason
        assert result.network == network


class TestFacilitatorSchemeAttributes:
    """Test facilitator scheme attributes."""

    def test_scheme_attribute_is_exact(self):
        """scheme attribute should be 'exact'."""
        signer = MockFacilitatorSigner()
        facilitator = ExactEvmFacilitatorScheme(signer)

        assert facilitator.scheme == "exact"

    def test_caip_family_attribute(self):
        """caip_family attribute should be 'eip155:*'."""
        signer = MockFacilitatorSigner()
        facilitator = ExactEvmFacilitatorScheme(signer)

        assert facilitator.caip_family == "eip155:*"

    def test_get_extra_returns_none(self):
        """get_extra should return None for EVM."""
        signer = MockFacilitatorSigner()
        facilitator = ExactEvmFacilitatorScheme(signer)

        extra = facilitator.get_extra("eip155:8453")

        assert extra is None

    def test_get_signers_returns_signer_addresses(self):
        """get_signers should return list of signer addresses."""
        addresses = [
            "0xSigner1111111111111111111111111111111111111111",
            "0xSigner2222222222222222222222222222222222222222",
        ]
        signer = MockFacilitatorSigner(addresses)
        facilitator = ExactEvmFacilitatorScheme(signer)

        result = facilitator.get_signers("eip155:8453")

        assert result == addresses
