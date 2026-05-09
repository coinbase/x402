#!/usr/bin/env python3
"""
Network comparison example: Base vs Polygon for x402 payments.

This example demonstrates:
- Comparing gas costs across networks
- Showing confirmation times
- Network-specific considerations
- When to choose each network
"""

import os
import time
from decimal import Decimal
from dotenv import load_dotenv
from x402 import X402Client

# Load environment variables
load_dotenv()

class NetworkInfo:
    """Information about a blockchain network for x402."""
    
    def __init__(self, name: str, caip2: str, native_token: str, 
                 usdc_address: str, typical_gas_gwei: int, avg_confirm_time: float):
        self.name = name
        self.caip2 = caip2  # CAIP-2 network identifier
        self.native_token = native_token
        self.usdc_address = usdc_address
        self.typical_gas_gwei = typical_gas_gwei  # Typical gas price in gwei
        self.avg_confirm_time = avg_confirm_time  # Average confirmation time in seconds

def estimate_transaction_cost(network: NetworkInfo, payment_amount: Decimal) -> dict:
    """Estimate the total cost of an x402 payment on a network."""
    
    # Typical gas usage for x402 payments
    gas_limit = 100_000  # EIP-3009 transferWithAuthorization
    
    # Calculate gas cost in native token
    gas_cost_wei = gas_limit * network.typical_gas_gwei * 1e9
    
    if network.name == "Polygon":
        # MATIC has 18 decimals
        gas_cost_native = Decimal(gas_cost_wei) / Decimal(10**18)
        # Approximate MATIC price: $0.50 (rough estimate)
        gas_cost_usd = gas_cost_native * Decimal("0.50")
    elif network.name == "Base":
        # ETH has 18 decimals
        gas_cost_native = Decimal(gas_cost_wei) / Decimal(10**18)
        # Approximate ETH price: $2500 (rough estimate)
        gas_cost_usd = gas_cost_native * Decimal("2500")
    else:
        gas_cost_native = Decimal("0")
        gas_cost_usd = Decimal("0")
    
    total_cost = payment_amount + gas_cost_usd
    
    return {
        "payment_amount": payment_amount,
        "gas_cost_native": gas_cost_native,
        "gas_cost_usd": gas_cost_usd,
        "total_cost": total_cost,
        "gas_percentage": (gas_cost_usd / total_cost * 100) if total_cost > 0 else 0
    }

def main():
    """Compare Base and Polygon networks for x402 payments."""
    
    # Network configurations
    networks = {
        "Polygon": NetworkInfo(
            name="Polygon",
            caip2="eip155:137",
            native_token="MATIC",
            usdc_address="0x3c499c542cEF5E3811e1192ce70d8cC03d5c3359",
            typical_gas_gwei=30,  # 30 gwei typical on Polygon
            avg_confirm_time=3.0  # ~3 seconds average
        ),
        "Base": NetworkInfo(
            name="Base",
            caip2="eip155:8453", 
            native_token="ETH",
            usdc_address="0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913",
            typical_gas_gwei=1,   # 1 gwei typical on Base (much lower)
            avg_confirm_time=2.0  # ~2 seconds average
        )
    }
    
    print("🔄 x402 Network Comparison: Base vs Polygon")
    print("=" * 70)
    print()
    
    # Configuration
    private_key = os.getenv("PRIVATE_KEY")
    
    if not private_key or private_key == "your_private_key_here":
        print("⚠️ PRIVATE_KEY not set - showing estimates only")
        private_key = None
    
    # Payment amounts to compare
    payment_amounts = [
        Decimal("0.001"),   # $0.001 - micro payment
        Decimal("0.01"),    # $0.01 - small payment  
        Decimal("0.1"),     # $0.10 - medium payment
        Decimal("1.0"),     # $1.00 - large payment
    ]
    
    # Cost comparison table
    print("💸 Cost Comparison Table")
    print("-" * 70)
    print(f"{'Payment':<10} {'Network':<8} {'Gas Cost':<12} {'Total':<10} {'Gas %':<8}")
    print("-" * 70)
    
    for amount in payment_amounts:
        for network_name, network in networks.items():
            cost = estimate_transaction_cost(network, amount)
            print(f"${amount:<9.3f} {network_name:<8} "
                  f"${cost['gas_cost_usd']:<11.6f} "
                  f"${cost['total_cost']:<9.6f} {cost['gas_percentage']:<7.1f}%")
    
    print()
    
    # Network feature comparison
    print("🌐 Network Feature Comparison")
    print("-" * 50)
    
    features = [
        ("Chain ID", "137", "8453"),
        ("Native Token", "MATIC", "ETH"), 
        ("Typical Gas Price", "30 gwei", "1 gwei"),
        ("Block Time", "~2 seconds", "~2 seconds"),
        ("Confirmation Time", "~3 seconds", "~2 seconds"),
        ("Ecosystem", "DeFi focused", "Coinbase ecosystem"),
        ("Bridge", "Polygon Bridge", "Native Coinbase"),
        ("Primary Use Case", "Low-cost DeFi", "Consumer crypto"),
    ]
    
    print(f"{'Feature':<20} {'Polygon':<15} {'Base':<15}")
    print("-" * 50)
    for feature, polygon_val, base_val in features:
        print(f"{feature:<20} {polygon_val:<15} {base_val:<15}")
    
    print()
    
    # If we have a private key, check actual balances
    if private_key:
        print("💰 Actual Wallet Balances")
        print("-" * 30)
        
        for network_name, network in networks.items():
            print(f"\n🔍 Checking {network_name}...")
            
            try:
                # We'd need different RPC URLs for each network
                rpc_url = os.getenv("RPC_URL")
                if not rpc_url:
                    print(f"   ⚠️ No RPC_URL configured")
                    continue
                
                client = X402Client(
                    private_key=private_key,
                    rpc_url=rpc_url,
                    network=network.caip2
                )
                
                wallet_address = client.get_address()
                native_balance = client.get_native_balance()
                usdc_balance = client.get_token_balance()
                
                print(f"   📱 Address: {wallet_address}")
                print(f"   💎 {network.native_token}: {native_balance:.6f}")
                print(f"   💵 USDC: {usdc_balance:.6f}")
                
                # Payment capacity
                if usdc_balance > 0:
                    cheapest_payment = Decimal("0.001")
                    capacity = int(usdc_balance / cheapest_payment)
                    print(f"   🔢 Payment capacity: ~{capacity} micro-payments")
                
            except Exception as e:
                print(f"   ❌ Error: {e}")
    
    print()
    
    # Recommendations
    print("💡 When to Choose Each Network")
    print("-" * 40)
    
    print("🟣 Choose Polygon When:")
    print("   ✅ Cost is the primary concern")
    print("   ✅ Making many small payments (micro-transactions)")
    print("   ✅ Users already have MATIC/USDC on Polygon")
    print("   ✅ Gas % of payment is high (small payments)")
    print("   ✅ DeFi/trading application focus")
    print()
    
    print("🔵 Choose Base When:")
    print("   ✅ Speed is critical (slightly faster)")
    print("   ✅ Users prefer Coinbase ecosystem")
    print("   ✅ Large payment amounts where gas % is minimal")
    print("   ✅ Maximum ecosystem support/adoption")
    print("   ✅ Enterprise/consumer application focus")
    print()
    
    # Break-even analysis
    print("📊 Break-Even Analysis")
    print("-" * 25)
    print("For payment amounts where gas cost becomes less significant:")
    
    for amount in [Decimal("0.1"), Decimal("1.0"), Decimal("10.0")]:
        polygon_cost = estimate_transaction_cost(networks["Polygon"], amount)
        base_cost = estimate_transaction_cost(networks["Base"], amount)
        
        savings = base_cost["total_cost"] - polygon_cost["total_cost"]
        savings_pct = (savings / base_cost["total_cost"]) * 100
        
        print(f"   ${amount}: Save ${savings:.4f} ({savings_pct:.1f}%) with Polygon")
    
    print()
    print("🎯 Conclusion: Polygon wins on cost, Base wins on ecosystem/speed")
    print("   For payments < $0.10: Polygon savings are significant (50%+)")
    print("   For payments > $1.00: Choice depends more on ecosystem fit")

if __name__ == "__main__":
    main()