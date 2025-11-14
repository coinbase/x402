package main

import (
	"context"
	"fmt"
	"log"

	x402 "github.com/coinbase/x402/go"
	"github.com/coinbase/x402/go/mechanisms/evm"
	"github.com/coinbase/x402/go/mechanisms/svm"
)

// Example demonstrating MoneyParser for custom token conversion
func main() {
	fmt.Println("=== MoneyParser Examples ===\n")

	// Example 1: Tiered pricing with different tokens
	example1TieredPricing()

	// Example 2: Network-specific tokens
	example2NetworkSpecific()

	// Example 3: Multiple parsers in chain
	example3ParserChain()

	// Example 4: SVM custom tokens
	example4SvmCustomTokens()
}

// Example 1: Tiered pricing - use different tokens for different amounts
func example1TieredPricing() {
	fmt.Println("Example 1: Tiered Pricing")
	fmt.Println("---------------------------")

	evmService := evm.NewExactEvmService()

	// Register tier-based parser
	evmService.RegisterMoneyParser(func(amount float64, network x402.Network) (*x402.AssetAmount, error) {
		if amount > 100 {
			// Premium tier: Use DAI (18 decimals)
			return &x402.AssetAmount{
				Amount: fmt.Sprintf("%.0f", amount*1e18),
				Asset:  "0x6B175474E89094C44Da98b954EedeAC495271d0F", // DAI
				Extra: map[string]interface{}{
					"token": "DAI",
					"tier":  "premium",
				},
			}, nil
		}
		// Small amounts use default USDC
		return nil, nil
	})

	// Test with large amount
	result1, _ := evmService.ParsePrice(150.0, "eip155:1")
	fmt.Printf("  Price: $150 → Asset: %s (%s), Tier: %v\n",
		result1.Asset[:10]+"...",
		result1.Extra["token"],
		result1.Extra["tier"])

	// Test with small amount
	result2, _ := evmService.ParsePrice(10.0, "eip155:1")
	fmt.Printf("  Price: $10  → Asset: %s... (USDC default)\n\n",
		result2.Asset[:10])
}

// Example 2: Network-specific token selection
func example2NetworkSpecific() {
	fmt.Println("Example 2: Network-Specific Tokens")
	fmt.Println("-----------------------------------")

	evmService := evm.NewExactEvmService()

	// Different tokens for different networks
	evmService.RegisterMoneyParser(func(amount float64, network x402.Network) (*x402.AssetAmount, error) {
		networkStr := string(network)

		switch networkStr {
		case "eip155:8453": // Base
			// Use native USDC on Base
			return &x402.AssetAmount{
				Amount: fmt.Sprintf("%.0f", amount*1e6),
				Asset:  "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913", // Base USDC
				Extra:  map[string]interface{}{"network": "base"},
			}, nil

		case "eip155:10": // Optimism
			// Use bridged USDC on Optimism
			return &x402.AssetAmount{
				Amount: fmt.Sprintf("%.0f", amount*1e6),
				Asset:  "0x7F5c764cBc14f9669B88837ca1490cCa17c31607", // Optimism USDC
				Extra:  map[string]interface{}{"network": "optimism"},
			}, nil

		default:
			// Use default for other networks
			return nil, nil
		}
	})

	// Test Base network
	result1, _ := evmService.ParsePrice(50.0, "eip155:8453")
	fmt.Printf("  Base ($50): %s... (%v)\n", result1.Asset[:10], result1.Extra["network"])

	// Test Optimism network
	result2, _ := evmService.ParsePrice(50.0, "eip155:10")
	fmt.Printf("  Optimism ($50): %s... (%v)\n", result2.Asset[:10], result2.Extra["network"])

	// Test Ethereum (uses default)
	result3, _ := evmService.ParsePrice(50.0, "eip155:1")
	fmt.Printf("  Ethereum ($50): %s... (default USDC)\n\n", result3.Asset[:10])
}

// Example 3: Multiple parsers in chain
func example3ParserChain() {
	fmt.Println("Example 3: Parser Chain")
	fmt.Println("------------------------")

	evmService := evm.NewExactEvmService()

	// Parser 1: Enterprise tier (> 10000)
	evmService.RegisterMoneyParser(func(amount float64, network x402.Network) (*x402.AssetAmount, error) {
		if amount > 10000 {
			log.Printf("  [Parser 1] Handling enterprise tier: $%.2f", amount)
			return &x402.AssetAmount{
				Amount: fmt.Sprintf("%.0f", amount*1e18),
				Asset:  "0xEnterprise",
				Extra:  map[string]interface{}{"tier": "enterprise"},
			}, nil
		}
		log.Printf("  [Parser 1] Skipping: $%.2f (not enterprise)", amount)
		return nil, nil // Skip to next parser
	})

	// Parser 2: Business tier (> 1000)
	evmService.RegisterMoneyParser(func(amount float64, network x402.Network) (*x402.AssetAmount, error) {
		if amount > 1000 {
			log.Printf("  [Parser 2] Handling business tier: $%.2f", amount)
			return &x402.AssetAmount{
				Amount: fmt.Sprintf("%.0f", amount*1e18),
				Asset:  "0xBusiness",
				Extra:  map[string]interface{}{"tier": "business"},
			}, nil
		}
		log.Printf("  [Parser 2] Skipping: $%.2f (not business)", amount)
		return nil, nil
	})

	// Parser 3: Pro tier (> 100)
	evmService.RegisterMoneyParser(func(amount float64, network x402.Network) (*x402.AssetAmount, error) {
		if amount > 100 {
			log.Printf("  [Parser 3] Handling pro tier: $%.2f", amount)
			return &x402.AssetAmount{
				Amount: fmt.Sprintf("%.0f", amount*1e6),
				Asset:  "0xPro",
				Extra:  map[string]interface{}{"tier": "pro"},
			}, nil
		}
		log.Printf("  [Parser 3] Skipping: $%.2f (not pro)", amount)
		return nil, nil
	})

	// Test enterprise tier
	fmt.Println("\n  Testing $15,000:")
	result1, _ := evmService.ParsePrice(15000.0, "eip155:1")
	fmt.Printf("  → Tier: %v\n", result1.Extra["tier"])

	// Test business tier
	fmt.Println("\n  Testing $5,000:")
	result2, _ := evmService.ParsePrice(5000.0, "eip155:1")
	fmt.Printf("  → Tier: %v\n", result2.Extra["tier"])

	// Test pro tier
	fmt.Println("\n  Testing $500:")
	result3, _ := evmService.ParsePrice(500.0, "eip155:1")
	fmt.Printf("  → Tier: %v\n", result3.Extra["tier"])

	// Test default tier
	fmt.Println("\n  Testing $50:")
	result4, _ := evmService.ParsePrice(50.0, "eip155:1")
	fmt.Printf("  → Using default USDC\n\n")
}

// Example 4: SVM custom tokens
func example4SvmCustomTokens() {
	fmt.Println("Example 4: SVM Custom Tokens")
	fmt.Println("-----------------------------")

	svmService := svm.NewExactSvmService()

	// Register custom SPL token for large amounts
	svmService.RegisterMoneyParser(func(amount float64, network x402.Network) (*x402.AssetAmount, error) {
		if amount > 100 {
			// Use custom SPL token with 9 decimals
			return &x402.AssetAmount{
				Amount: fmt.Sprintf("%.0f", amount*1e9),
				Asset:  "So11111111111111111111111111111111111111112", // SOL (example)
				Extra: map[string]interface{}{
					"token":  "SOL",
					"tier":   "large",
					"native": true,
				},
			}, nil
		}
		return nil, nil
	})

	// Test large amount
	result1, _ := svmService.ParsePrice(500.0, "solana:5eykt4UsFv8P8NJdTREpY1vzqKqZKvdp")
	fmt.Printf("  Price: $500 → Asset: %s... (%v)\n",
		result1.Asset[:10],
		result1.Extra["token"])

	// Test small amount
	result2, _ := svmService.ParsePrice(50.0, "solana:5eykt4UsFv8P8NJdTREpY1vzqKqZKvdp")
	fmt.Printf("  Price: $50  → Asset: %s... (USDC default)\n\n",
		result2.Asset[:10])
}

// Example 5: Integration with Resource Service
func example5ResourceService() {
	fmt.Println("Example 5: Integration with Resource Service")
	fmt.Println("---------------------------------------------")

	// Create EVM service with custom money parser
	evmService := evm.NewExactEvmService()
	evmService.RegisterMoneyParser(func(amount float64, network x402.Network) (*x402.AssetAmount, error) {
		// VIP customers get 50% discount and use DAI
		// In production, you'd check a database for VIP status
		isVIP := false // Placeholder

		if isVIP {
			discountedAmount := amount * 0.5
			return &x402.AssetAmount{
				Amount: fmt.Sprintf("%.0f", discountedAmount*1e18),
				Asset:  "0x6B175474E89094C44Da98b954EedeAC495271d0F",
				Extra: map[string]interface{}{
					"discount": "50%",
					"tier":     "vip",
				},
			}, nil
		}

		return nil, nil // Use default
	})

	// Create resource service with custom money parser
	service := x402.Newx402ResourceService(
		x402.WithSchemeService("eip155:*", evmService),
	)

	// Build payment requirements
	requirements, err := service.BuildPaymentRequirements(context.Background(), x402.ResourceConfig{
		Scheme:            "exact",
		Network:           "eip155:1",
		PayTo:             "0xRecipient",
		Price:             100.0, // $100
		MaxTimeoutSeconds: 300,
	})

	if err != nil {
		log.Printf("Error: %v", err)
		return
	}

	fmt.Printf("  Price: $100 → Amount: %s, Asset: %s...\n",
		requirements[0].Amount,
		requirements[0].Asset[:10])
	fmt.Printf("  Custom parser was used in resource service!\n")
}

