# MoneyParser Example

This example demonstrates how to use custom money parsers in the x402 Go SDK for converting user-friendly prices (like `$1.50`) into blockchain token amounts with custom logic.

## Overview

MoneyParsers allow you to customize how monetary amounts are converted to token amounts. This enables:

- **Tiered pricing**: Different tokens for different amount ranges
- **Network-specific tokens**: Use different tokens on different networks  
- **Custom conversion logic**: Discounts, fees, dynamic pricing
- **Multi-token support**: Chain multiple parsers for complex logic

## How It Works

### Chain of Responsibility Pattern

```go
service.RegisterMoneyParser(parser1). // Tried first
        RegisterMoneyParser(parser2). // Tried second
        RegisterMoneyParser(parser3)  // Tried third
        
// When ParsePrice is called:
// 1. Try parser1 - if it returns non-nil, use that
// 2. If parser1 returns nil, try parser2
// 3. If parser2 returns nil, try parser3
// 4. If all return nil, use default USDC conversion
```

### Parser Function Signature

```go
type MoneyParser func(amount float64, network x402.Network) (*x402.AssetAmount, error)
```

**Returns**:
- `*AssetAmount, nil` - Parser handled the conversion
- `nil, nil` - Parser skipped, try next parser
- `nil, error` - Parser error, skip to next parser

## Examples

### Example 1: Tiered Pricing

Use different tokens based on amount tiers:

```go
evmService := evm.NewExactEvmService()

evmService.RegisterMoneyParser(func(amount float64, network x402.Network) (*x402.AssetAmount, error) {
    if amount > 100 {
        // Large amounts: Use DAI (18 decimals)
        return &x402.AssetAmount{
            Amount: fmt.Sprintf("%.0f", amount * 1e18),
            Asset:  "0x6B175474E89094C44Da98b954EedeAC495271d0F", // DAI
            Extra:  map[string]interface{}{
                "token": "DAI",
                "tier": "premium",
            },
        }, nil
    }
    return nil, nil // Use default USDC for small amounts
})

// Usage
result, _ := evmService.ParsePrice(150.0, "eip155:1")
// → Uses DAI

result, _ := evmService.ParsePrice(10.0, "eip155:1")
// → Uses default USDC
```

### Example 2: Network-Specific Tokens

Use different tokens on different networks:

```go
evmService := evm.NewExactEvmService()

evmService.RegisterMoneyParser(func(amount float64, network x402.Network) (*x402.AssetAmount, error) {
    switch string(network) {
    case "eip155:8453": // Base
        return &x402.AssetAmount{
            Amount: fmt.Sprintf("%.0f", amount * 1e6),
            Asset:  "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913", // Base USDC
        }, nil
    
    case "eip155:10": // Optimism
        return &x402.AssetAmount{
            Amount: fmt.Sprintf("%.0f", amount * 1e6),
            Asset:  "0x7F5c764cBc14f9669B88837ca1490cCa17c31607", // OP USDC
        }, nil
    
    default:
        return nil, nil // Use default
    }
})
```

### Example 3: Multiple Parsers in Chain

Chain multiple parsers for complex logic:

```go
evmService := evm.NewExactEvmService()

// Parser 1: Enterprise tier (> $10,000)
evmService.RegisterMoneyParser(func(amount float64, network x402.Network) (*x402.AssetAmount, error) {
    if amount > 10000 {
        return &x402.AssetAmount{
            Amount: fmt.Sprintf("%.0f", amount * 1e18),
            Asset:  "0xEnterpriseToken",
            Extra:  map[string]interface{}{"tier": "enterprise"},
        }, nil
    }
    return nil, nil // Try next parser
})

// Parser 2: Business tier (> $1,000)
evmService.RegisterMoneyParser(func(amount float64, network x402.Network) (*x402.AssetAmount, error) {
    if amount > 1000 {
        return &x402.AssetAmount{
            Amount: fmt.Sprintf("%.0f", amount * 1e18),
            Asset:  "0xBusinessToken",
            Extra:  map[string]interface{}{"tier": "business"},
        }, nil
    }
    return nil, nil // Try next parser
})

// Parser 3: Pro tier (> $100)
evmService.RegisterMoneyParser(func(amount float64, network x402.Network) (*x402.AssetAmount, error) {
    if amount > 100 {
        return &x402.AssetAmount{
            Amount: fmt.Sprintf("%.0f", amount * 1e6),
            Asset:  "0xProToken",
            Extra:  map[string]interface{}{"tier": "pro"},
        }, nil
    }
    return nil, nil // Use default
})

// $15,000 → Enterprise token (Parser 1)
// $5,000  → Business token (Parser 2)
// $500    → Pro token (Parser 3)
// $50     → Default USDC
```

### Example 4: SVM Custom Tokens

Use custom SPL tokens on Solana:

```go
svmService := svm.NewExactSvmService()

svmService.RegisterMoneyParser(func(amount float64, network x402.Network) (*x402.AssetAmount, error) {
    if amount > 100 {
        // Use SOL for large amounts (9 decimals)
        return &x402.AssetAmount{
            Amount: fmt.Sprintf("%.0f", amount * 1e9),
            Asset:  "So11111111111111111111111111111111111111112", // SOL
            Extra:  map[string]interface{}{
                "token": "SOL",
                "native": true,
            },
        }, nil
    }
    return nil, nil // Use USDC default
})
```

## Use Cases

### 1. Volume Discounts

```go
evmService.RegisterMoneyParser(func(amount float64, network x402.Network) (*x402.AssetAmount, error) {
    // 10% discount for amounts > $1000
    if amount > 1000 {
        discountedAmount := amount * 0.9
        return &x402.AssetAmount{
            Amount: fmt.Sprintf("%.0f", discountedAmount * 1e6),
            Asset:  getUSDCAddress(network),
            Extra:  map[string]interface{}{
                "discount": "10%",
                "originalAmount": amount,
            },
        }, nil
    }
    return nil, nil
})
```

### 2. Multi-Currency Support

```go
evmService.RegisterMoneyParser(func(amount float64, network x402.Network) (*x402.AssetAmount, error) {
    // Check user's preferred currency from database
    preferredCurrency := getUserPreferredCurrency()
    
    switch preferredCurrency {
    case "DAI":
        return &x402.AssetAmount{
            Amount: fmt.Sprintf("%.0f", amount * 1e18),
            Asset:  "0x6B175474E89094C44Da98b954EedeAC495271d0F",
        }, nil
    case "USDT":
        return &x402.AssetAmount{
            Amount: fmt.Sprintf("%.0f", amount * 1e6),
            Asset:  "0xdAC17F958D2ee523a2206206994597C13D831ec7",
        }, nil
    default:
        return nil, nil // Use USDC default
    }
})
```

### 3. Dynamic Token Selection

```go
evmService.RegisterMoneyParser(func(amount float64, network x402.Network) (*x402.AssetAmount, error) {
    // Check current gas prices
    gasPrice := getCurrentGasPrice()
    
    if gasPrice > 50 { // gwei
        // High gas: Use Layer 2 or alternative token
        return &x402.AssetAmount{
            Amount: fmt.Sprintf("%.0f", amount * 1e6),
            Asset:  getL2TokenAddress(network),
            Extra:  map[string]interface{}{
                "reason": "high_gas_fee",
                "gasPrice": gasPrice,
            },
        }, nil
    }
    
    return nil, nil // Use default
})
```

## Integration with Resource Service

MoneyParsers work seamlessly with `x402ResourceService`:

```go
// Create service with custom money parser
evmService := evm.NewExactEvmService()
evmService.RegisterMoneyParser(tieredPricingParser)

// Register with resource service
service := x402.Newx402ResourceService(
    x402.WithSchemeService("eip155:*", evmService),
)

// Build payment requirements
requirements, _ := service.BuildPaymentRequirements(context.Background(), x402.ResourceConfig{
    Scheme:  "exact",
    Network: "eip155:1",
    PayTo:   "0xRecipient",
    Price:   150.0, // Custom parser will be used
})

// The custom parser was automatically used!
```

## Running the Example

```bash
cd go/examples/money-parser
go run main.go
```

## Output

The example demonstrates:

1. **Tiered Pricing**: Different tokens for different amounts
2. **Network-Specific**: Different tokens on different networks
3. **Parser Chain**: Multiple parsers with fallback logic
4. **SVM Support**: Custom SPL tokens on Solana

## Best Practices

1. **Return nil, nil to skip**: Let next parser handle it
2. **Return AssetAmount for success**: Parser handled conversion
3. **Return nil, error for errors**: Parser failed, try next
4. **Order matters**: Register parsers from most specific to most general
5. **Always have fallback**: Default parser is automatic fallback
6. **Use Extra field**: Include metadata about the conversion
7. **Consider network**: Parsers can behave differently per network
8. **Test thoroughly**: Test all code paths and edge cases

## Related Examples

- [Lifecycle Hooks](../lifecycle-hooks/) - Hook system usage
- [Middleware Server](../middleware-server/) - HTTP middleware integration
- [Quick Start](../quick-start/) - Basic x402 usage

## Further Reading

- [Go SDK Documentation](../../README.md)
- [TypeScript MoneyParser Reference](../../../typescript/packages/mechanisms/evm/src/exact/service.ts)
- [EVM Service Tests](../../mechanisms/evm/service_money_parser_test.go)
- [SVM Service Tests](../../mechanisms/svm/service_money_parser_test.go)

