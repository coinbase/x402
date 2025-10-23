"""End-to-end tests for Solana (SVM) payment functionality.

These tests require:
1. A funded Solana devnet wallet (SOL for fees + USDC for payments)
2. Environment variables set in .env file
3. Network access to Solana devnet

To run: uv run pytest tests/test_svm_e2e.py -v -s
"""

import pytest
import os
import asyncio
from dotenv import load_dotenv
from x402.svm.wallet import create_keypair_from_base58, generate_keypair
from x402.svm.rpc import get_rpc_client
from x402.exact_svm import (
    create_payment_header,
    create_and_sign_payment,
    settle_payment,
)
from x402.types import PaymentRequirements

# Load environment variables
load_dotenv()


@pytest.fixture
def client_keypair():
    """Get client keypair from environment or generate a new one."""
    private_key = os.getenv("SOLANA_PRIVATE_KEY")
    if private_key:
        return create_keypair_from_base58(private_key)
    else:
        pytest.skip("SOLANA_PRIVATE_KEY not set - skipping e2e test")


@pytest.fixture
def server_address():
    """Get server Solana address from environment."""
    address = os.getenv("SOLANA_ADDRESS")
    if address:
        return address
    else:
        pytest.skip("SOLANA_ADDRESS not set - skipping e2e test")


@pytest.fixture
def payment_requirements(server_address, client_keypair):
    """Create payment requirements for the test."""
    return PaymentRequirements(
        scheme="exact",
        network="solana-devnet",
        max_amount_required="1000",  # 0.001 USDC (6 decimals)
        resource="https://api.example.com/test",
        description="E2E Test Payment",
        mime_type="application/json",
        pay_to=server_address,
        max_timeout_seconds=60,
        asset="4zMMC9srt5Ri5X14GAgXhaHii3GnPAEERYPJgZJDncDU",  # Devnet USDC
        extra={"feePayer": server_address},  # Server pays fees
    )


@pytest.mark.asyncio
@pytest.mark.e2e
class TestSVMEndToEnd:
    """End-to-end tests for SVM payment flow."""

    async def test_create_payment_header_e2e(
        self, client_keypair, payment_requirements
    ):
        """Test creating a payment header with real Solana RPC."""
        print(f"\n🔑 Client Address: {client_keypair.address}")
        print(f"💰 Payment To: {payment_requirements.pay_to}")
        print(f"💵 Amount: {payment_requirements.max_amount_required} atomic units")

        # Create payment header
        payment_header = await create_payment_header(
            keypair=client_keypair,
            x402_version=1,
            payment_requirements=payment_requirements,
        )

        print(f"✅ Payment Header Created: {len(payment_header)} bytes")
        assert payment_header is not None
        assert len(payment_header) > 0

        # Verify it's base64 encoded
        import base64

        try:
            decoded = base64.b64decode(payment_header)
            print(f"📦 Decoded Payload Size: {len(decoded)} bytes")
        except Exception as e:
            pytest.fail(f"Payment header is not valid base64: {e}")

    async def test_create_and_sign_payment_e2e(
        self, client_keypair, payment_requirements
    ):
        """Test creating and signing a payment transaction."""
        print(f"\n🔑 Client Address: {client_keypair.address}")

        # Create and sign payment
        payment_payload = await create_and_sign_payment(
            keypair=client_keypair,
            payment_requirements=payment_requirements,
        )

        print(f"✅ Payment Payload Created")
        assert "transaction" in payment_payload
        assert len(payment_payload["transaction"]) > 0

        # Decode transaction to verify structure
        from x402.svm.transaction import decode_transaction

        tx = decode_transaction(payment_payload["transaction"])
        print(f"📝 Transaction Signatures: {len(tx.signatures)}")
        print(f"📝 Transaction Instructions: {len(tx.message.instructions)}")

        # Should have at least 2 instructions (compute budget + transfer)
        # May have 3 if ATA creation is needed
        assert len(tx.message.instructions) >= 2

    async def test_check_wallet_balance(self, client_keypair):
        """Check if wallet has sufficient balance for testing."""
        print(f"\n🔍 Checking wallet: {client_keypair.address}")

        rpc = get_rpc_client("solana-devnet")

        # Check SOL balance
        sol_balance = rpc.get_balance(client_keypair.pubkey)
        sol_lamports = sol_balance.value
        sol_amount = sol_lamports / 1e9

        print(f"💰 SOL Balance: {sol_amount:.6f} SOL ({sol_lamports} lamports)")

        if sol_lamports < 1_000_000:  # Less than 0.001 SOL
            print("⚠️  WARNING: Low SOL balance - fund wallet at https://faucet.solana.com")
            print(f"   Address: {client_keypair.address}")

        # Check USDC balance
        from solders.pubkey import Pubkey
        from x402.svm.transaction import get_associated_token_address_for_owner

        usdc_mint = Pubkey.from_string(
            "4zMMC9srt5Ri5X14GAgXhaHii3GnPAEERYPJgZJDncDU"
        )
        usdc_ata = get_associated_token_address_for_owner(
            usdc_mint, client_keypair.pubkey
        )

        try:
            usdc_account = rpc.get_account_info(usdc_ata)
            if usdc_account.value:
                # Parse token account data (simplified)
                print(f"💵 USDC Token Account: {usdc_ata}")
                print(f"   (Account exists - has USDC)")
            else:
                print(f"⚠️  No USDC token account found")
                print(f"   Get devnet USDC from: https://spl-token-faucet.com/")
                print(f"   Address: {client_keypair.address}")
        except Exception as e:
            print(f"⚠️  Could not check USDC balance: {e}")

        # Don't fail the test, just provide info
        assert True

    @pytest.mark.skipif(
        not os.getenv("RUN_SETTLEMENT_TEST"),
        reason="Set RUN_SETTLEMENT_TEST=true to run actual settlement test",
    )
    async def test_full_settlement_flow_e2e(
        self, client_keypair, server_address, payment_requirements
    ):
        """Test full settlement flow with actual blockchain transaction.

        WARNING: This test will:
        1. Create a real transaction on Solana devnet
        2. Spend real USDC tokens (devnet)
        3. Require a fee payer keypair

        Set RUN_SETTLEMENT_TEST=true in .env to enable this test.
        """
        print(f"\n🚀 Starting Full Settlement Flow")
        print(f"🔑 Client: {client_keypair.address}")
        print(f"💰 Server: {server_address}")

        # Create payment payload
        payment_payload = await create_and_sign_payment(
            keypair=client_keypair,
            payment_requirements=payment_requirements,
        )

        print(f"✅ Payment created and signed by client")

        # Get fee payer keypair (would be server/facilitator in production)
        fee_payer_key = os.getenv("FEE_PAYER_PRIVATE_KEY")
        if not fee_payer_key:
            pytest.skip("FEE_PAYER_PRIVATE_KEY not set - cannot complete settlement")

        fee_payer = create_keypair_from_base58(fee_payer_key)
        print(f"💸 Fee Payer: {fee_payer.address}")

        # Settle payment (sign with fee payer and send to blockchain)
        settle_response = await settle_payment(
            fee_payer_keypair=fee_payer,
            payment_payload=payment_payload,
            payment_requirements=payment_requirements,
        )

        print(f"\n📊 Settlement Response:")
        print(f"   Success: {settle_response['success']}")
        if settle_response["success"]:
            print(f"   ✅ Transaction: {settle_response['transaction']}")
            print(f"   🌐 Network: {settle_response['network']}")
            print(
                f"\n🔍 View on Solana Explorer:"
            )
            print(
                f"   https://explorer.solana.com/tx/{settle_response['transaction']}?cluster=devnet"
            )

            # Verify transaction exists
            rpc = get_rpc_client("solana-devnet")
            from solders.signature import Signature

            sig = Signature.from_string(settle_response["transaction"])

            # Wait a bit for confirmation
            print(f"\n⏳ Waiting for confirmation...")
            await asyncio.sleep(2)

            try:
                tx_result = rpc.get_transaction(sig)
                if tx_result.value:
                    print(f"✅ Transaction confirmed on chain!")
                else:
                    print(f"⏳ Transaction not yet confirmed (may take a few seconds)")
            except Exception as e:
                print(f"ℹ️  Transaction check: {e}")

        else:
            print(f"   ❌ Error: {settle_response.get('error', 'Unknown error')}")
            pytest.fail(f"Settlement failed: {settle_response.get('error')}")


@pytest.mark.asyncio
@pytest.mark.e2e
class TestSVMIntegration:
    """Integration tests that verify the full flow without actual settlement."""

    async def test_payment_flow_simulation(self):
        """Simulate the full payment flow without sending to blockchain."""
        print("\n📋 Simulating Payment Flow:")

        # Generate temporary keypairs
        client = generate_keypair()
        server = generate_keypair()

        print(f"1️⃣  Client generates keypair: {client.address}")
        print(f"2️⃣  Server address: {server.address}")

        # Create payment requirements
        requirements = PaymentRequirements(
            scheme="exact",
            network="solana-devnet",
            max_amount_required="1000",
            resource="https://api.example.com/protected",
            description="Test Resource",
            mime_type="application/json",
            pay_to=server.address,
            max_timeout_seconds=60,
            asset="4zMMC9srt5Ri5X14GAgXhaHii3GnPAEERYPJgZJDncDU",
            extra={"feePayer": server.address},
        )

        print(f"3️⃣  Payment requirements created: {requirements.max_amount_required} atomic units")

        # Create payment header
        header = await create_payment_header(
            keypair=client,
            x402_version=1,
            payment_requirements=requirements,
        )

        print(f"4️⃣  Payment header created: {len(header)} bytes")

        # Decode to verify structure
        from x402.exact_svm import decode_payment

        decoded = decode_payment(header)
        print(f"5️⃣  Payment decoded successfully")
        print(f"   - Scheme: {decoded['scheme']}")
        print(f"   - Network: {decoded['network']}")
        print(f"   - Has transaction: {'transaction' in decoded['payload']}")

        assert decoded["scheme"] == "exact"
        assert decoded["network"] == "solana-devnet"
        assert "transaction" in decoded["payload"]

        print(f"✅ Payment flow simulation complete!")


if __name__ == "__main__":
    # Instructions for running
    print("=" * 70)
    print("Solana E2E Test Suite")
    print("=" * 70)
    print("\n📝 Setup Instructions:")
    print("\n1. Create a .env file in python/x402/ with:")
    print("   SOLANA_PRIVATE_KEY=your_base58_private_key")
    print("   SOLANA_ADDRESS=your_solana_address")
    print("   FEE_PAYER_PRIVATE_KEY=fee_payer_base58_key  # For settlement test")
    print("   RUN_SETTLEMENT_TEST=true  # Optional - enables actual settlement")
    print("\n2. Fund your wallet:")
    print("   - SOL: https://faucet.solana.com")
    print("   - USDC: https://spl-token-faucet.com")
    print(f"\n3. Run tests:")
    print("   uv run pytest tests/test_svm_e2e.py -v -s")
    print("\n" + "=" * 70)

    pytest.main([__file__, "-v", "-s"])

