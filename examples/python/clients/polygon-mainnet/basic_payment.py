#!/usr/bin/env python3
"""
Basic x402 payment example on Polygon mainnet.

This example demonstrates:
- Initializing x402 client for Polygon
- Making a payment with USDC on Polygon 
- Handling 402 Payment Required responses
- Retrying with payment signature
"""

import os
from decimal import Decimal
from dotenv import load_dotenv
import requests
from x402 import X402Client

# Load environment variables
load_dotenv()

def main():
    """Make a basic x402 payment on Polygon mainnet."""
    
    # Configuration from environment
    private_key = os.getenv("PRIVATE_KEY")
    rpc_url = os.getenv("RPC_URL")
    target_url = os.getenv("TARGET_URL")
    payment_amount = Decimal(os.getenv("PAYMENT_AMOUNT", "0.001"))
    facilitator_url = os.getenv("FACILITATOR_URL", "https://x402.org/facilitator")
    
    if not private_key or private_key == "your_private_key_here":
        print("❌ Please set PRIVATE_KEY in .env file")
        return
        
    if not rpc_url:
        print("❌ Please set RPC_URL in .env file")
        return
        
    if not target_url or target_url == "https://api.example.com/paid-endpoint":
        print("❌ Please set TARGET_URL to a real x402-enabled endpoint in .env file")
        return
    
    print("🟣 Polygon x402 Payment Example")
    print("=" * 50)
    print(f"Network: Polygon mainnet (eip155:137)")
    print(f"Asset: USDC (0x3c499c542cEF5E3811e1192ce70d8cC03d5c3359)")
    print(f"Amount: ${payment_amount}")
    print(f"Target: {target_url}")
    print()
    
    try:
        # Initialize x402 client for Polygon mainnet
        print("🔧 Initializing x402 client...")
        client = X402Client(
            private_key=private_key,
            rpc_url=rpc_url,
            network="eip155:137",  # Polygon mainnet
            facilitator_url=facilitator_url
        )
        
        # Get wallet info
        wallet_address = client.get_address()
        print(f"📱 Wallet: {wallet_address}")
        
        # Check balances before payment
        try:
            matic_balance = client.get_native_balance()
            usdc_balance = client.get_token_balance()
            print(f"💰 MATIC balance: {matic_balance:.6f} (for gas)")
            print(f"💵 USDC balance: {usdc_balance:.6f}")
            
            if usdc_balance < payment_amount:
                print(f"❌ Insufficient USDC balance. Need ${payment_amount}, have ${usdc_balance}")
                return
                
            if matic_balance < Decimal("0.01"):
                print(f"⚠️ Low MATIC balance. You may need more for gas fees.")
        except Exception as e:
            print(f"⚠️ Could not check balances: {e}")
        
        print()
        
        # Step 1: Make initial request (expect 402)
        print("🚀 Step 1: Making initial request...")
        response = requests.get(target_url)
        
        if response.status_code != 402:
            print(f"❌ Expected 402 Payment Required, got {response.status_code}")
            if response.text:
                print(f"Response: {response.text}")
            return
            
        print("✅ Received 402 Payment Required")
        
        # Step 2: Parse payment requirements
        print("🔍 Step 2: Parsing payment requirements...")
        payment_required_header = response.headers.get("Payment-Required")
        if not payment_required_header:
            print("❌ Missing Payment-Required header")
            return
            
        print(f"💳 Payment required: {payment_required_header}")
        
        # Step 3: Create payment signature
        print("✍️ Step 3: Creating payment signature...")
        try:
            payment_signature = client.create_payment_signature(
                payment_required_header=payment_required_header,
                amount=payment_amount
            )
            print("✅ Payment signature created")
            
        except Exception as e:
            print(f"❌ Failed to create payment signature: {e}")
            return
        
        # Step 4: Retry request with payment
        print("💸 Step 4: Retrying with payment signature...")
        headers = {
            "Payment-Signature": payment_signature
        }
        
        paid_response = requests.get(target_url, headers=headers)
        
        if paid_response.status_code == 200:
            print("🎉 Payment successful!")
            print(f"📄 Response: {paid_response.text[:200]}...")
            
            # Show transaction details if available
            if hasattr(client, 'last_transaction_hash'):
                print(f"🔗 Transaction: https://polygonscan.com/tx/{client.last_transaction_hash}")
                
        else:
            print(f"❌ Payment failed with status {paid_response.status_code}")
            if paid_response.text:
                print(f"Error: {paid_response.text}")
        
        # Check balances after payment
        print("\n📊 Final Balances:")
        try:
            final_matic = client.get_native_balance()
            final_usdc = client.get_token_balance()
            print(f"💰 MATIC: {final_matic:.6f} (gas used: ~{matic_balance - final_matic:.6f})")
            print(f"💵 USDC: {final_usdc:.6f} (spent: ${usdc_balance - final_usdc:.6f})")
        except Exception as e:
            print(f"⚠️ Could not check final balances: {e}")
            
    except Exception as e:
        print(f"❌ Error: {e}")
        import traceback
        traceback.print_exc()

if __name__ == "__main__":
    main()