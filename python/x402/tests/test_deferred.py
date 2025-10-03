import pytest
import time
from unittest.mock import patch
from eth_account import Account
from eth_utils import to_checksum_address

from x402.deferred import (
    prepare_payment_header,
    create_new_voucher,
    aggregate_voucher,
    sign_voucher,
    verify_voucher,
    sign_payment_header,
    encode_payment,
    decode_payment,
    DEFERRED_SCHEME,
    EXPIRY_TIME,
)
from x402.types import (
    PaymentRequirements,
    DeferredEvmPayloadVoucher,
)


class TestDeferredPaymentScheme:
    @pytest.fixture
    def account(self):
        """Create a test account."""
        return Account.from_key("0x" + "a" * 64)
    
    @pytest.fixture
    def payment_requirements_new(self):
        """Create payment requirements for a new voucher."""
        return PaymentRequirements(
            scheme=DEFERRED_SCHEME,
            network="base-sepolia",
            max_amount_required="1000000000000000000",  # 1 token
            resource="/api/test",
            description="Test API",
            mime_type="application/json",
            pay_to="0xA1c7Bf3d421e8A54D39FbBE13f9f826E5B2C8e3D",
            max_timeout_seconds=300,
            asset="0x081827b8c3aa05287b5aa2bc3051fbe638f33152",
            extra={
                "type": "new",
                "voucher": {
                    "id": "0x" + "1" * 64,
                    "escrow": "0x7cB1A5A2a2C9e91B76914C0A7b7Fb3AefF3BCA27",
                }
            }
        )
    
    @pytest.fixture
    def existing_voucher(self, account):
        """Create an existing voucher for aggregation tests."""
        return DeferredEvmPayloadVoucher(
            id="0x" + "1" * 64,
            buyer=account.address,
            seller="0xA1c7Bf3d421e8A54D39FbBE13f9f826E5B2C8e3D",
            value_aggregate="1000000000000000000",
            asset="0x081827b8c3aa05287b5aa2bc3051fbe638f33152",
            timestamp=int(time.time()) - 100,
            nonce=1,
            escrow="0x7cB1A5A2a2C9e91B76914C0A7b7Fb3AefF3BCA27",
            chain_id=84532,
            expiry=int(time.time()) + EXPIRY_TIME,
        )
    
    def test_create_new_voucher(self, account, payment_requirements_new):
        """Test creating a new voucher."""
        voucher = create_new_voucher(account.address, payment_requirements_new)
        
        assert voucher.id == "0x" + "1" * 64
        assert voucher.buyer == to_checksum_address(account.address)
        assert voucher.seller == to_checksum_address(payment_requirements_new.pay_to)
        assert voucher.value_aggregate == payment_requirements_new.max_amount_required
        assert voucher.asset == to_checksum_address(payment_requirements_new.asset)
        assert voucher.nonce == 0
        assert voucher.escrow == to_checksum_address("0x7cB1A5A2a2C9e91B76914C0A7b7Fb3AefF3BCA27")
        assert voucher.chain_id == 84532  # base-sepolia
        assert voucher.timestamp > 0
        assert voucher.expiry > voucher.timestamp
    
    def test_sign_and_verify_voucher(self, account, existing_voucher):
        """Test signing and verifying a voucher."""
        signature = sign_voucher(account, existing_voucher)
        
        assert signature.startswith("0x")
        assert len(signature) == 132  # 0x + 130 hex chars
        
        # Verify with correct signer
        assert verify_voucher(existing_voucher, signature, account.address) is True
        
        # Verify with wrong signer
        wrong_account = Account.from_key("0x" + "b" * 64)
        assert verify_voucher(existing_voucher, signature, wrong_account.address) is False
    
    def test_aggregate_voucher(self, account, existing_voucher):
        """Test aggregating an existing voucher."""
        # Sign the existing voucher
        signature = sign_voucher(account, existing_voucher)
        
        # Create payment requirements for aggregation
        payment_requirements = PaymentRequirements(
            scheme=DEFERRED_SCHEME,
            network="base-sepolia",
            max_amount_required="500000000000000000",  # 0.5 token
            resource="/api/test",
            description="Test API",
            mime_type="application/json",
            pay_to=existing_voucher.seller,
            max_timeout_seconds=300,
            asset=existing_voucher.asset,
            extra={
                "type": "aggregation",
                "signature": signature,
                "voucher": existing_voucher.model_dump(by_alias=True),
            }
        )
        
        # Aggregate the voucher
        aggregated = aggregate_voucher(account.address, payment_requirements)
        
        assert aggregated.id == existing_voucher.id
        assert aggregated.buyer == to_checksum_address(account.address)
        assert aggregated.seller == existing_voucher.seller
        assert aggregated.value_aggregate == "1500000000000000000"  # 1.5 tokens
        assert aggregated.nonce == existing_voucher.nonce + 1
        assert aggregated.timestamp >= existing_voucher.timestamp
        assert aggregated.expiry > aggregated.timestamp
    
    def test_aggregate_voucher_validation(self, account, existing_voucher):
        """Test voucher aggregation validation."""
        signature = sign_voucher(account, existing_voucher)
        
        # Test with wrong seller
        with pytest.raises(ValueError, match="Invalid voucher seller"):
            payment_requirements = PaymentRequirements(
                scheme=DEFERRED_SCHEME,
                network="base-sepolia",
                max_amount_required="500000000000000000",
                resource="/api/test",
                description="Test API",
                mime_type="application/json",
                pay_to="0x0000000000000000000000000000000000000001",  # Wrong seller
                max_timeout_seconds=300,
                asset=existing_voucher.asset,
                extra={
                    "type": "aggregation",
                    "signature": signature,
                    "voucher": existing_voucher.model_dump(by_alias=True),
                }
            )
            aggregate_voucher(account.address, payment_requirements)
        
        # Test with wrong asset
        with pytest.raises(ValueError, match="Invalid voucher asset"):
            payment_requirements = PaymentRequirements(
                scheme=DEFERRED_SCHEME,
                network="base-sepolia",
                max_amount_required="500000000000000000",
                resource="/api/test",
                description="Test API",
                mime_type="application/json",
                pay_to=existing_voucher.seller,
                max_timeout_seconds=300,
                asset="0x0000000000000000000000000000000000000002",  # Wrong asset
                extra={
                    "type": "aggregation",
                    "signature": signature,
                    "voucher": existing_voucher.model_dump(by_alias=True),
                }
            )
            aggregate_voucher(account.address, payment_requirements)
    
    def test_prepare_payment_header(self, account, payment_requirements_new):
        """Test preparing an unsigned payment header."""
        header = prepare_payment_header(
            account.address,
            1,
            payment_requirements_new
        )
        
        assert header["x402Version"] == 1
        assert header["scheme"] == DEFERRED_SCHEME
        assert header["network"] == "base-sepolia"
        assert header["payload"]["signature"] is None
        assert header["payload"]["voucher"]["id"] == "0x" + "1" * 64
        assert header["payload"]["voucher"]["nonce"] == 0
    
    def test_sign_payment_header(self, account, payment_requirements_new):
        """Test signing a payment header."""
        header = prepare_payment_header(
            account.address,
            1,
            payment_requirements_new
        )
        
        encoded = sign_payment_header(account, payment_requirements_new, header)
        
        # Decode and verify
        decoded = decode_payment(encoded)
        assert decoded["x402Version"] == 1
        assert decoded["scheme"] == DEFERRED_SCHEME
        assert decoded["payload"]["signature"].startswith("0x")
        assert len(decoded["payload"]["signature"]) == 132
    
    def test_expired_voucher(self, account):
        """Test that expired vouchers are rejected."""
        # Create an expired voucher
        expired_voucher = DeferredEvmPayloadVoucher(
            id="0x" + "2" * 64,
            buyer=account.address,
            seller="0xA1c7Bf3d421e8A54D39FbBE13f9f826E5B2C8e3D",
            value_aggregate="1000000000000000000",
            asset="0x081827b8c3aa05287b5aa2bc3051fbe638f33152",
            timestamp=int(time.time()) - 1000,
            nonce=1,
            escrow="0x7cB1A5A2a2C9e91B76914C0A7b7Fb3AefF3BCA27",
            chain_id=84532,
            expiry=int(time.time()) - 100,  # Expired
        )
        
        signature = sign_voucher(account, expired_voucher)
        
        payment_requirements = PaymentRequirements(
            scheme=DEFERRED_SCHEME,
            network="base-sepolia",
            max_amount_required="500000000000000000",
            resource="/api/test",
            description="Test API",
            mime_type="application/json",
            pay_to=expired_voucher.seller,
            max_timeout_seconds=300,
            asset=expired_voucher.asset,
            extra={
                "type": "aggregation",
                "signature": signature,
                "voucher": expired_voucher.model_dump(by_alias=True),
            }
        )
        
        with pytest.raises(ValueError, match="Voucher expired"):
            aggregate_voucher(account.address, payment_requirements)
    
    def test_encode_decode_payment(self):
        """Test encoding and decoding payment data."""
        payment_data = {
            "x402Version": 1,
            "scheme": DEFERRED_SCHEME,
            "network": "base-sepolia",
            "payload": {
                "signature": "0x" + "a" * 130,
                "voucher": {
                    "id": "0x" + "1" * 64,
                    "buyer": "0x209693Bc6afc0C5328bA36FaF03C514EF312287C",
                    "seller": "0xA1c7Bf3d421e8A54D39FbBE13f9f826E5B2C8e3D",
                    "valueAggregate": "1000000000000000000",
                    "asset": "0x081827b8c3aa05287b5aa2bc3051fbe638f33152",
                    "timestamp": 1234567890,
                    "nonce": 0,
                    "escrow": "0x7cB1A5A2a2C9e91B76914C0A7b7Fb3AefF3BCA27",
                    "chainId": 84532,
                    "expiry": 1234567890 + EXPIRY_TIME,
                }
            }
        }
        
        encoded = encode_payment(payment_data)
        decoded = decode_payment(encoded)
        
        assert decoded == payment_data