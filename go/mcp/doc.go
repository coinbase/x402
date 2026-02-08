// Package mcp provides MCP (Model Context Protocol) transport integration for the x402 payment protocol.
//
// This package enables paid tool calls in MCP servers and automatic payment handling in MCP clients.
//
// # Client Usage
//
// Wrap an MCP client with payment handling:
//
//	import (
//	    "context"
//	    x402 "github.com/coinbase/x402/go"
//	    "github.com/coinbase/x402/go/mcp"
//	)
//
//	// Create x402 payment client
//	paymentClient := x402.Newx402Client()
//	paymentClient.Register("eip155:84532", evmClientScheme)
//
//	// Wrap MCP client (AutoPayment defaults to true)
//	x402Mcp := mcp.NewX402MCPClient(mcpClient, paymentClient, mcp.Options{})
//
//	// Call tools - payment handled automatically
//	result, err := x402Mcp.CallTool(ctx, "get_weather", map[string]interface{}{"city": "NYC"})
//
// # Server Usage
//
// Wrap tool handlers with payment:
//
//	import (
//	    "context"
//	    x402 "github.com/coinbase/x402/go"
//	    "github.com/coinbase/x402/go/mcp"
//	)
//
//	// Create resource server
//	resourceServer := x402.Newx402ResourceServer(facilitatorClient)
//	resourceServer.Register("eip155:84532", evmServerScheme)
//
//	// Build payment requirements
//	accepts, _ := resourceServer.BuildPaymentRequirements(ctx, config)
//
//	// Create payment wrapper
//	paid := mcp.CreatePaymentWrapper(resourceServer, mcp.PaymentWrapperConfig{
//	    Accepts: accepts,
//	})
//
//	// Register paid tool
//	mcpServer.Tool("get_weather", "Get weather", schema, paid(handler))
//
// # Factory Functions
//
// NewX402MCPClientFromConfig creates a client with scheme registrations:
//
//	x402Mcp := mcp.NewX402MCPClientFromConfig(mcpClient, []mcp.SchemeRegistration{
//	    {Network: "eip155:84532", Client: evmClientScheme},
//	}, mcp.Options{})
//
// # Convenience Re-exports
//
// This package re-exports commonly used types from the x402 core package for convenience:
//
//	import "github.com/coinbase/x402/go/mcp"
//
//	// Re-exported types available:
//	// - x402.X402Client (via x402 package)
//	// - x402.X402ResourceServer (via x402 package)
//	// - types.PaymentPayload, types.PaymentRequired, types.PaymentRequirements (via types package)
package mcp
