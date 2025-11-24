# Advanced Gin Server Examples

This directory contains advanced examples demonstrating various x402 features and patterns for Go servers using the Gin framework.

## Examples

### 1. Bazaar Discovery Extension (`bazaar.go`)

**What it demonstrates:**
- Adding the Bazaar discovery extension to make your API discoverable
- Providing input/output schemas for machine-readable API documentation
- Enabling clients and facilitators to discover your API capabilities

**Use case:** When you want your x402-protected API to be discoverable by clients, AI agents, or through facilitator discovery mechanisms.

```bash
go run bazaar.go
```

### 2. Dynamic PayTo (`dynamic-pay-to.go`)

**What it demonstrates:**
- Using a function to dynamically resolve the payment recipient address
- Routing payments based on request context
- Implementing marketplace-style payment routing

**Use case:** Marketplace applications where payments should go to different sellers, content creators, or service providers based on the resource being accessed.

```bash
go run dynamic-pay-to.go
```

### 3. Custom Money Definition (`custom-money-definition.go`)

**What it demonstrates:**
- Registering custom money parsers for alternative tokens
- Using different tokens based on network or amount
- Chain of responsibility pattern for price parsing

**Use case:** When you want to accept payments in tokens other than USDC, or use different tokens based on conditions (e.g., DAI for large amounts, custom tokens for specific networks).

```bash
go run custom-money-definition.go
```

### 4. Dynamic Price (`dynamic-price.go`)

**What it demonstrates:**
- Using a function to dynamically calculate prices
- Implementing tiered pricing (premium vs. standard)
- Context-based pricing decisions

**Use case:** Implementing tiered pricing, user-based pricing, content-based pricing, or any scenario where the price varies based on the request.

```bash
go run dynamic-price.go
```

### 5. Lifecycle Hooks (`hooks.go`)

**What it demonstrates:**
- Extracting structured error information from `*VerifyError` and `*SettleError`
- Registering hooks for payment verification and settlement lifecycle
- Running custom logic before/after verification and settlement
- Implementing error recovery and custom validation
- Logging and side effects

**Use case:** When you need to:
- Log payment events to a database or monitoring system
- Perform custom validation before processing payments
- Implement retry or recovery logic for failed payments
- Trigger side effects (notifications, database updates) after successful payments

```bash
go run hooks.go
```

## Prerequisites

- Go 1.21 or higher
- An Ethereum address to receive payments (testnet recommended)
- Access to an x402 facilitator (e.g., `https://facilitator.x402.org`)

## Setup

1. **Install dependencies:**

```bash
go mod download
```

2. **Configure environment variables:**

Create a `.env` file with:

```bash
EVM_PAYEE_ADDRESS=0x742d35Cc6634C0532925a3b844Bc9e7595f0bEb
FACILITATOR_URL=https://facilitator.x402.org
```

## Running the Examples

**Each example is standalone and must be run individually (not with `go run .`):**

```bash
go run hooks.go
go run bazaar.go
go run dynamic-price.go
go run dynamic-pay-to.go
go run custom-money-definition.go
```

## Understanding the Patterns

### Dynamic Configuration

Both `dynamic-pay-to.go` and `dynamic-price.go` demonstrate how to use functions instead of static values:

```go
// Static
RouteConfig{
    PayTo: "0x742d35Cc6634C0532925a3b844Bc9e7595f0bEb",
    Price: "$0.001",
}

// Dynamic
RouteConfig{
    PayTo: func(ctx context.Context, reqCtx HTTPRequestContext) (string, error) {
        // Custom logic here
        return address, nil
    },
    Price: func(ctx context.Context, reqCtx HTTPRequestContext) (Price, error) {
        // Custom logic here
        return price, nil
    },
}
```

### Custom Money Parsers

The `custom-money-definition.go` example shows how to register parsers in a chain:

```go
evmScheme := evm.NewExactEvmScheme().RegisterMoneyParser(
    func(amount float64, network Network) (*AssetAmount, error) {
        if /* custom condition */ {
            return &AssetAmount{
                Amount: "...",
                Asset: "0x...",
                Extra: map[string]interface{}{"token": "CUSTOM"},
            }, nil
        }
        return nil, nil // Pass to next parser
    },
)
```

### Lifecycle Hooks

The `hooks.go` example demonstrates all available hooks:

```go
resourceServer.
    OnBeforeVerify(func(ctx VerifyContext) (*BeforeHookResult, error) {
        // Run before verification, can abort
    }).
    OnAfterVerify(func(ctx VerifyResultContext) error {
        // Run after successful verification
    }).
    OnVerifyFailure(func(ctx VerifyFailureContext) (*VerifyFailureHookResult, error) {
        // Run when verification fails, can recover
    }).
    OnBeforeSettle(func(ctx SettleContext) (*BeforeHookResult, error) {
        // Run before settlement, can abort
    }).
    OnAfterSettle(func(ctx SettleResultContext) error {
        // Run after successful settlement
    }).
    OnSettleFailure(func(ctx SettleFailureContext) (*SettleFailureHookResult, error) {
        // Run when settlement fails, can recover
    })
```

## Next Steps

- **[Basic Gin Example](../gin/)**: Start with the basics if you haven't already
- **[Custom Server Example](../custom/)**: Learn how to implement x402 without middleware
- **[Client Examples](../../clients/)**: Build clients that can interact with these servers

## Related Resources

- [x402 Protocol Specification](../../../../specs/)
- [Go Package Documentation](../../../../go/)
- [TypeScript Examples](../../../typescript/servers/) (for comparison)

