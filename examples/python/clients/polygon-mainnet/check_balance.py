#!/usr/bin/env python3
"""
Balance checking example for Polygon mainnet.

This example demonstrates:
- Checking MATIC balance (for gas fees)
- Checking USDC balance (for payments)
- Displaying balances in human-readable format
- Estimating gas costs for x402 payments
"""

import os
from decimal import Decimal
from dotenv import load_dotenv
from x402 import X402Client

# Load environment variables
load_dotenv()

def format_balance(balance: Decimal, symbol: str, decimals: int = 6) -> str:
    """Format a balance for human-readable display."""
    if balance == 0:
        return f"0 {symbol}"
    elif balance < Decimal(f"1e-{decimals}"):
        return f"<0.{'0' * (decimals-1)}1 {symbol}"
    else:
        return f"{balance:.{decimals}f} {symbol}".rstrip('0').rstrip('.')

def estimate_gas_cost() -> Decimal:
    """Estimate gas cost for an x402 payment on Polygon."""
    # Typical gas usage for EIP-3009 transferWithAuthorization
    gas_limit = 100000  # gas units
    gas_price = 30e9    # 30 gwei (typical Polygon gas price)
    
    # Convert to MATIC (18 decimals)
    cost_wei = gas_limit * gas_price
    cost_matic = Decimal(cost_wei) / Decimal(10**18)
    
    return cost_matic

def main():
    """Check wallet balances for Polygon mainnet x402 payments."""
    
    # Configuration from environment
    private_key = os.getenv("PRIVATE_KEY")
    rpc_url = os.getenv("RPC_URL")
    
    if not private_key or private_key == "your_private_key_here":
        print("❌ Please set PRIVATE_KEY in .env file")
        return
        
    if not rpc_url:
        print("❌ Please set RPC_URL in .env file")
        return
    
    print("🟣 Polygon Mainnet Balance Check")
    print("=" * 50)
    
    try:
        # Initialize x402 client for Polygon mainnet
        print("🔧 Initializing x402 client...")
        client = X402Client(
            private_key=private_key,
            rpc_url=rpc_url,
            network="eip155:137",  # Polygon mainnet
        )
        
        wallet_address = client.get_address()
        print(f"📱 Wallet Address: {wallet_address}")
        print()
        
        # Check MATIC balance (for gas)
        print("💰 Checking MATIC balance (for gas fees)...")
        try:
            matic_balance = client.get_native_balance()
            matic_formatted = format_balance(matic_balance, "MATIC", 6)
            print(f"   Balance: {matic_formatted}")
            
            # Estimate number of transactions possible
            estimated_gas_cost = estimate_gas_cost()
            if matic_balance > 0:
                tx_count = int(matic_balance / estimated_gas_cost)
                print(f"   Estimated tx capacity: ~{tx_count} transactions")
                print(f"   (assuming {estimated_gas_cost:.6f} MATIC per tx)")
            
            # Gas fee recommendations
            if matic_balance < Decimal("0.001"):
                print("   ⚠️ VERY LOW: May fail on first transaction")
            elif matic_balance < Decimal("0.01"):
                print("   ⚠️ LOW: Consider getting more MATIC")
            elif matic_balance < Decimal("0.1"):
                print("   ✅ ADEQUATE: Good for moderate usage")
            else:
                print("   ✅ EXCELLENT: Plenty for many transactions")
                
        except Exception as e:
            print(f"   ❌ Error checking MATIC: {e}")
        
        print()
        
        # Check USDC balance (for payments)
        print("💵 Checking USDC balance (for payments)...")
        try:
            usdc_balance = client.get_token_balance()
            usdc_formatted = format_balance(usdc_balance, "USDC", 6)
            print(f"   Balance: {usdc_formatted}")
            
            # Payment capacity analysis
            if usdc_balance > 0:
                print("   Payment capacity:")
                amounts = [Decimal("0.001"), Decimal("0.01"), Decimal("0.1"), Decimal("1.0")]
                for amount in amounts:
                    if usdc_balance >= amount:
                        count = int(usdc_balance / amount)
                        print(f"     ${amount}: {count} payments")
            
            # Balance recommendations
            if usdc_balance == 0:
                print("   ❌ NONE: Cannot make any payments")
                print("   💡 Get USDC via Polygon Bridge or CEX withdrawal")
            elif usdc_balance < Decimal("0.01"):
                print("   ⚠️ LOW: Only micro-payments possible")
            elif usdc_balance < Decimal("1.0"):
                print("   ✅ MODERATE: Good for regular API usage")
            else:
                print("   ✅ HIGH: Plenty for extensive API usage")
                
        except Exception as e:
            print(f"   ❌ Error checking USDC: {e}")
        
        print()
        
        # Network information
        print("🌐 Network Information:")
        print("   Chain ID: 137 (Polygon Mainnet)")
        print("   Native Asset: MATIC")
        print("   USDC Contract: 0x3c499c542cEF5E3811e1192ce70d8cC03d5c3359")
        print("   Block Explorer: https://polygonscan.com/")
        print("   Bridge: https://wallet.polygon.technology/polygon/bridge")
        print()
        
        # Quick cost comparison with other networks
        print("💸 Cost Comparison (for $0.001 payment):")
        print("   Polygon: ~$0.003 total ($0.001 + $0.002 gas)")
        print("   Base:    ~$0.021 total ($0.001 + $0.020 gas)")
        print("   Ethereum:~$15.00 total ($0.001 + ~$15 gas)")
        print("   💡 Polygon is 85% cheaper than Base!")
        print()
        
        # Getting funds instructions
        if matic_balance < Decimal("0.01") or usdc_balance < Decimal("0.01"):
            print("💡 Need more funds? Here's how to get them:")
            
            if matic_balance < Decimal("0.01"):
                print("\n📥 Getting MATIC (for gas):")
                print("   • Bridge ETH from Ethereum: https://wallet.polygon.technology/polygon/bridge")
                print("   • Buy on QuickSwap: https://quickswap.exchange/")
                print("   • Withdraw from CEX: Binance, Coinbase, etc.")
                print("   • Faucet (testnet only): Not available on mainnet")
            
            if usdc_balance < Decimal("0.01"):
                print("\n📥 Getting USDC (for payments):")
                print("   • Bridge from Ethereum: https://wallet.polygon.technology/polygon/bridge")
                print("   • Cross-chain swap: https://stargate.finance/")
                print("   • Withdraw directly to Polygon: Most CEXs support this")
                print("   • Buy with MATIC: https://quickswap.exchange/")
        
        print()
        print("✅ Balance check complete!")
        
    except Exception as e:
        print(f"❌ Error: {e}")
        import traceback
        traceback.print_exc()

if __name__ == "__main__":
    main()