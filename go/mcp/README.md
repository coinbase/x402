# x402/mcp

MCP (Model Context Protocol) integration for the x402 payment protocol. This package enables paid tool calls in MCP servers and automatic payment handling in MCP clients.

## Installation

```bash
go get github.com/coinbase/x402/go/mcp
```

## Quick Start

### Server - Using Payment Wrapper

```go
package main

import (
    "context"
    "log"
    "github.com/coinbase/x402/go/mcp"
    x402 "github.com/coinbase/x402/go"
)

func main() {
    // Create x402 resource server
    facilitatorClient := // ... create facilitator client
    resourceServer := x402.NewX402ResourceServer(facilitatorClient)
    resourceServer.Register("eip155:84532", evmServerScheme)
    
    // Build payment requirements
    accepts, err := resourceServer.BuildPaymentRequirements(context.Background(), config)
    if err != nil {
        log.Fatal(err)
    }

    // Create payment wrapper
    paid, err := mcp.CreatePaymentWrapper(resourceServer, mcp.PaymentWrapperConfig{
        Accepts: accepts,
    })
    if err != nil {
        log.Fatal(err)
    }

    // Register paid tool - wrap handler
    toolHandler := func(ctx context.Context, args map[string]interface{}, toolContext mcp.MCPToolContext) (mcp.MCPToolResult, error) {
        // Your tool logic here
        return mcp.MCPToolResult{
            Content: []mcp.MCPContentItem{
                {Type: "text", Text: "Result"},
            },
        }, nil
    }
    
    wrappedHandler := paid(toolHandler)
    // Use wrappedHandler with your MCP server
}
```

### Client - Using SDK Adapter + Factory Function

```go
package main

import (
    "context"
    "fmt"
    "log"
    "github.com/coinbase/x402/go/mcp"
    mcpsdk "github.com/modelcontextprotocol/go-sdk/mcp"
)

func main() {
    // Connect to MCP server using the official SDK
    mcpClient := mcpsdk.NewClient(&mcpsdk.Implementation{
        Name: "my-agent", Version: "1.0.0",
    }, nil)
    session, err := mcpClient.Connect(ctx, transport, nil)
    if err != nil {
        log.Fatal(err)
    }
    defer session.Close()

    // Create adapter to bridge MCP SDK with x402
    adapter := mcp.NewMCPClientAdapter(mcpClient, session)

    // Create x402 MCP client with scheme registrations
    // AutoPayment defaults to true
    x402Mcp := mcp.NewX402MCPClientFromConfig(adapter, []mcp.SchemeRegistration{
        {Network: "eip155:84532", Client: evmClientScheme},
    }, mcp.Options{})

    // Call tools - payment handled automatically
    ctx := context.Background()
    result, err := x402Mcp.CallTool(ctx, "get_weather", map[string]interface{}{
        "city": "NYC",
    })
    if err != nil {
        log.Fatal(err)
    }
    fmt.Println(result)
}
```

## API Reference

### Client

#### `NewMCPClientAdapter`

Creates an `MCPClientInterface` from the official Go MCP SDK types. This is the
recommended way to bridge the official MCP SDK with x402.

```go
adapter := mcp.NewMCPClientAdapter(mcpClient, session)
```

#### `NewX402MCPClient`

Creates an x402 MCP client from an existing MCP client and payment client.

```go
paymentClient := x402.Newx402Client()
paymentClient.Register("eip155:84532", evmClientScheme)

adapter := mcp.NewMCPClientAdapter(mcpClient, session)
x402Mcp := mcp.NewX402MCPClient(adapter, paymentClient, mcp.Options{})
```

#### `NewX402MCPClientFromConfig`

Creates a fully configured x402 MCP client with scheme registrations.

```go
adapter := mcp.NewMCPClientAdapter(mcpClient, session)
x402Mcp := mcp.NewX402MCPClientFromConfig(adapter, []mcp.SchemeRegistration{
    {Network: "eip155:84532", Client: evmClientScheme},
}, mcp.Options{}) // AutoPayment defaults to true
```

### Server

#### `CreatePaymentWrapper`

Creates a payment wrapper for MCP tool handlers. Returns an error if the
configuration is invalid (e.g. empty `Accepts`). Supports multiple payment
requirements in the `Accepts` array -- the wrapper matches the client's chosen
payment method against the correct requirement automatically.

```go
beforeExecHook := mcp.BeforeExecutionHook(func(ctx mcp.ServerHookContext) (bool, error) {
    // Called after payment verification, before tool execution
    // Return false to abort execution
    return true, nil
})
afterExecHook := mcp.AfterExecutionHook(func(ctx mcp.AfterExecutionContext) error {
    // Called after tool execution, before settlement
    return nil
})
afterSettleHook := mcp.AfterSettlementHook(func(ctx mcp.SettlementContext) error {
    // Called after successful settlement
    return nil
})

paid, err := mcp.CreatePaymentWrapper(resourceServer, mcp.PaymentWrapperConfig{
    Accepts: accepts,
    Hooks: &mcp.PaymentWrapperHooks{
        OnBeforeExecution: &beforeExecHook,
        OnAfterExecution:  &afterExecHook,
        OnAfterSettlement: &afterSettleHook,
    },
})
if err != nil {
    log.Fatal(err)
}
```

### Utilities

#### Error Handling

```go
// Create payment required error
err := mcp.CreatePaymentRequiredError("Payment required", &paymentRequired)

// Check if error is payment required
if mcp.IsPaymentRequiredError(err) {
    paymentErr := err.(*mcp.PaymentRequiredError)
    // Handle payment required
}

// Extract PaymentRequired from JSON-RPC error
pr, err := mcp.ExtractPaymentRequiredFromError(jsonRpcError)
```

#### Type Guards

```go
// Check if value is an object
if mcp.IsObject(value) {
    obj := value.(map[string]interface{})
    // Use obj
}
```

## Constants

- `MCP_PAYMENT_REQUIRED_CODE` - JSON-RPC error code for payment required (402)
- `MCP_PAYMENT_META_KEY` - MCP _meta key for payment payload ("x402/payment")
- `MCP_PAYMENT_RESPONSE_META_KEY` - MCP _meta key for payment response ("x402/payment-response")

## Types

### Client Types

- `X402MCPClient` - x402-enabled MCP client
- `Options` - Options for x402 MCP client behavior (AutoPayment defaults to true)
- `SchemeRegistration` - Payment scheme registration for factory functions
- `MCPToolCallResult` - Result of a tool call with payment metadata
- `PaymentRequiredContext` - Context provided to payment required hooks
- `PaymentRequiredHookResult` - Result from payment required hook

### Server Types

- `PaymentWrapperConfig` - Configuration for payment wrapper
- `ServerHookContext` - Context provided to server-side hooks
- `AfterExecutionContext` - Context for after execution hook
- `SettlementContext` - Context for settlement hooks

### Hook Types

- `PaymentRequiredHook` - Hook called when payment is required
- `BeforePaymentHook` - Hook called before payment creation
- `AfterPaymentHook` - Hook called after payment submission
- `BeforeExecutionHook` - Hook called before tool execution
- `AfterExecutionHook` - Hook called after tool execution
- `AfterSettlementHook` - Hook called after settlement

## Examples

See the [examples directory](../../examples) for complete examples.

## License

Copyright (c) Coinbase, Inc.
