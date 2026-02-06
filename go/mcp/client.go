package mcp

import (
	"context"
	"fmt"

	x402 "github.com/coinbase/x402/go"
	"github.com/coinbase/x402/go/types"
)

// X402MCPClient wraps an MCP client with x402 payment handling
type X402MCPClient struct {
	mcpClient            MCPClientInterface
	paymentClient        *x402.X402Client
	options              Options
	paymentRequiredHooks []PaymentRequiredHook
	beforePaymentHooks   []BeforePaymentHook
	afterPaymentHooks    []AfterPaymentHook
}

// NewX402MCPClient creates a new x402MCPClient instance
func NewX402MCPClient(
	mcpClient MCPClientInterface,
	paymentClient *x402.X402Client,
	options Options,
) *X402MCPClient {
	// Note: AutoPayment defaults to false if not explicitly set
	// The caller should set it explicitly if they want auto-payment

	return &X402MCPClient{
		mcpClient:     mcpClient,
		paymentClient: paymentClient,
		options:       options,
	}
}

// Client returns the underlying MCP client
func (c *X402MCPClient) Client() MCPClientInterface {
	return c.mcpClient
}

// PaymentClient returns the underlying x402 payment client
func (c *X402MCPClient) PaymentClient() *x402.X402Client {
	return c.paymentClient
}

// OnPaymentRequired registers a hook for payment required events
func (c *X402MCPClient) OnPaymentRequired(hook PaymentRequiredHook) *X402MCPClient {
	c.paymentRequiredHooks = append(c.paymentRequiredHooks, hook)
	return c
}

// OnBeforePayment registers a hook before payment creation
func (c *X402MCPClient) OnBeforePayment(hook BeforePaymentHook) *X402MCPClient {
	c.beforePaymentHooks = append(c.beforePaymentHooks, hook)
	return c
}

// OnAfterPayment registers a hook after payment submission
func (c *X402MCPClient) OnAfterPayment(hook AfterPaymentHook) *X402MCPClient {
	c.afterPaymentHooks = append(c.afterPaymentHooks, hook)
	return c
}

// CallTool calls a tool with automatic payment handling
func (c *X402MCPClient) CallTool(
	ctx context.Context,
	name string,
	args map[string]interface{},
) (*MCPToolCallResult, error) {
	// First attempt without payment
	callParams := map[string]interface{}{
		"name":      name,
		"arguments": args,
	}

	result, err := c.mcpClient.CallTool(ctx, callParams)
	if err != nil {
		return nil, fmt.Errorf("failed to call tool: %w", err)
	}

	// Check if this is a payment required response
	paymentRequired, err := ExtractPaymentRequiredFromResult(result)
	if err != nil {
		return nil, fmt.Errorf("failed to extract payment required: %w", err)
	}

	if paymentRequired == nil {
		// Check if this is a successful paid tool call (has payment response in meta)
		// Note: We check this even for IsError=false because successful paid calls
		// have payment response in meta, not in StructuredContent
		settleResponse, err := ExtractPaymentResponseFromMeta(result)
		if err != nil {
			return nil, fmt.Errorf("failed to extract payment response: %w", err)
		}
		if settleResponse != nil {
			// This was a paid tool call that succeeded
			return &MCPToolCallResult{
				Content:         result.Content,
				IsError:         result.IsError,
				PaymentResponse: settleResponse,
				PaymentMade:     true,
			}, nil
		}
		
		// Free tool - return as-is
		return &MCPToolCallResult{
			Content:     result.Content,
			IsError:     result.IsError,
			PaymentMade: false,
		}, nil
	}

	// Payment required - run hooks first
	paymentRequiredContext := PaymentRequiredContext{
		ToolName:        name,
		Arguments:       args,
		PaymentRequired: *paymentRequired,
	}

	// Run payment required hooks
	for _, hook := range c.paymentRequiredHooks {
		hookResult, err := hook(paymentRequiredContext)
		if err != nil {
			return nil, fmt.Errorf("payment required hook error: %w", err)
		}
		if hookResult != nil {
			if hookResult.Abort {
				return nil, CreatePaymentRequiredError("Payment aborted by hook", paymentRequired)
			}
			if hookResult.Payment != nil {
				return c.CallToolWithPayment(ctx, name, args, *hookResult.Payment)
			}
		}
	}

	// No hook handled it, proceed with normal flow
	if !c.options.AutoPayment {
		return nil, CreatePaymentRequiredError("Payment required", paymentRequired)
	}

	// Check if payment is approved
	if c.options.OnPaymentRequested != nil {
		approved, err := c.options.OnPaymentRequested(paymentRequiredContext)
		if err != nil {
			return nil, fmt.Errorf("payment request hook error: %w", err)
		}
		if !approved {
			return nil, CreatePaymentRequiredError("Payment request denied", paymentRequired)
		}
	}

	// Run before payment hooks
	for _, hook := range c.beforePaymentHooks {
		if err := hook(paymentRequiredContext); err != nil {
			return nil, fmt.Errorf("before payment hook error: %w", err)
		}
	}

	// Select payment requirement from accepts array
	selectedRequirement, err := c.paymentClient.SelectPaymentRequirements(paymentRequired.Accepts)
	if err != nil {
		return nil, fmt.Errorf("failed to select payment requirement: %w", err)
	}

	// Create payment payload
	payload, err := c.paymentClient.CreatePaymentPayload(
		ctx,
		selectedRequirement,
		paymentRequired.Resource,
		paymentRequired.Extensions,
	)
	if err != nil {
		return nil, fmt.Errorf("failed to create payment payload: %w", err)
	}

	// Retry with payment
	return c.CallToolWithPayment(ctx, name, args, payload)
}

// CallToolWithPayment calls a tool with explicit payment payload
func (c *X402MCPClient) CallToolWithPayment(
	ctx context.Context,
	name string,
	args map[string]interface{},
	payload types.PaymentPayload,
) (*MCPToolCallResult, error) {
	// Build call params with payment in _meta
	callParams := AttachPaymentToMeta(
		map[string]interface{}{
			"name":      name,
			"arguments": args,
		},
		payload,
	)

	// Call with payment
	result, err := c.mcpClient.CallTool(ctx, callParams)
	if err != nil {
		return nil, fmt.Errorf("failed to call tool with payment: %w", err)
	}

	// Extract payment response from meta
	settleResponse, err := ExtractPaymentResponseFromMeta(result)
	if err != nil {
		return nil, fmt.Errorf("failed to extract payment response: %w", err)
	}

	// Run after payment hooks
	afterContext := AfterPaymentContext{
		ToolName:       name,
		PaymentPayload: payload,
		Result:         result,
		SettleResponse: settleResponse,
	}
	for _, hook := range c.afterPaymentHooks {
		if err := hook(afterContext); err != nil {
			// Log but don't fail
		}
	}

	return &MCPToolCallResult{
		Content:         result.Content,
		IsError:         result.IsError,
		PaymentResponse: settleResponse,
		PaymentMade:     true,
	}, nil
}

// GetToolPaymentRequirements probes a tool to discover its payment requirements
// WARNING: This actually calls the tool, so it may have side effects
func (c *X402MCPClient) GetToolPaymentRequirements(
	ctx context.Context,
	name string,
	args map[string]interface{},
) (*types.PaymentRequired, error) {
	callParams := map[string]interface{}{
		"name":      name,
		"arguments": args,
	}

	result, err := c.mcpClient.CallTool(ctx, callParams)
	if err != nil {
		return nil, fmt.Errorf("failed to call tool: %w", err)
	}

	return ExtractPaymentRequiredFromResult(result)
}

// Passthrough methods - forward to underlying MCP client

// Connect connects to an MCP server transport
func (c *X402MCPClient) Connect(ctx context.Context, transport interface{}) error {
	return c.mcpClient.Connect(ctx, transport)
}

// Close closes the MCP connection
func (c *X402MCPClient) Close(ctx context.Context) error {
	return c.mcpClient.Close(ctx)
}

// ListTools lists available tools from the server
func (c *X402MCPClient) ListTools(ctx context.Context) (interface{}, error) {
	return c.mcpClient.ListTools(ctx)
}

// ListResources lists available resources from the server
func (c *X402MCPClient) ListResources(ctx context.Context) (interface{}, error) {
	return c.mcpClient.ListResources(ctx)
}

// ReadResource reads a resource from the server
func (c *X402MCPClient) ReadResource(ctx context.Context, uri string) (interface{}, error) {
	return c.mcpClient.ReadResource(ctx, uri)
}

// ListResourceTemplates lists resource templates from the server
func (c *X402MCPClient) ListResourceTemplates(ctx context.Context) (interface{}, error) {
	return c.mcpClient.ListResourceTemplates(ctx)
}

// SubscribeResource subscribes to resource updates
func (c *X402MCPClient) SubscribeResource(ctx context.Context, uri string) error {
	return c.mcpClient.SubscribeResource(ctx, uri)
}

// UnsubscribeResource unsubscribes from resource updates
func (c *X402MCPClient) UnsubscribeResource(ctx context.Context, uri string) error {
	return c.mcpClient.UnsubscribeResource(ctx, uri)
}

// ListPrompts lists available prompts from the server
func (c *X402MCPClient) ListPrompts(ctx context.Context) (interface{}, error) {
	return c.mcpClient.ListPrompts(ctx)
}

// GetPrompt gets a specific prompt from the server
func (c *X402MCPClient) GetPrompt(ctx context.Context, name string) (interface{}, error) {
	return c.mcpClient.GetPrompt(ctx, name)
}

// Ping pings the server
func (c *X402MCPClient) Ping(ctx context.Context) error {
	return c.mcpClient.Ping(ctx)
}

// Complete requests completion suggestions
func (c *X402MCPClient) Complete(ctx context.Context, prompt string, cursor int) (interface{}, error) {
	return c.mcpClient.Complete(ctx, prompt, cursor)
}

// SetLoggingLevel sets the logging level on the server
func (c *X402MCPClient) SetLoggingLevel(ctx context.Context, level string) error {
	return c.mcpClient.SetLoggingLevel(ctx, level)
}

// GetServerCapabilities gets server capabilities after initialization
func (c *X402MCPClient) GetServerCapabilities(ctx context.Context) (interface{}, error) {
	return c.mcpClient.GetServerCapabilities(ctx)
}

// GetServerVersion gets server version information after initialization
func (c *X402MCPClient) GetServerVersion(ctx context.Context) (interface{}, error) {
	return c.mcpClient.GetServerVersion(ctx)
}

// GetInstructions gets server instructions after initialization
func (c *X402MCPClient) GetInstructions(ctx context.Context) (string, error) {
	return c.mcpClient.GetInstructions(ctx)
}

// SendRootsListChanged sends notification that roots list has changed
func (c *X402MCPClient) SendRootsListChanged(ctx context.Context) error {
	return c.mcpClient.SendRootsListChanged(ctx)
}

// ============================================================================
// Factory Functions
// ============================================================================

// WrapMCPClientWithPayment wraps an existing MCP client with x402 payment handling.
//
// This is a convenience function that creates an X402MCPClient from an existing
// MCP client and payment client.
//
// Example:
//
//	mcpClient := // ... existing MCP client
//	paymentClient := x402.Newx402Client()
//	paymentClient.Register("eip155:84532", evmClientScheme)
//
//	x402Mcp := mcp.WrapMCPClientWithPayment(mcpClient, paymentClient, mcp.Options{
//	    AutoPayment: true,
//	})
func WrapMCPClientWithPayment(
	mcpClient MCPClientInterface,
	paymentClient *x402.X402Client,
	options Options,
) *X402MCPClient {
	return NewX402MCPClient(mcpClient, paymentClient, options)
}

// WrapMCPClientWithPaymentFromConfig wraps an existing MCP client with x402 payment handling
// using scheme registrations.
//
// Similar to WrapMCPClientWithPayment but accepts scheme registrations directly.
//
// Example:
//
//	mcpClient := // ... existing MCP client
//
//	x402Mcp := mcp.WrapMCPClientWithPaymentFromConfig(mcpClient, []mcp.SchemeRegistration{
//	    {Network: "eip155:84532", Client: evmClientScheme},
//	}, mcp.Options{
//	    AutoPayment: true,
//	})
func WrapMCPClientWithPaymentFromConfig(
	mcpClient MCPClientInterface,
	schemes []SchemeRegistration,
	options Options,
) *X402MCPClient {
	paymentClient := x402.Newx402Client()
	for _, scheme := range schemes {
		if scheme.X402Version == 1 {
			paymentClient.RegisterV1(scheme.Network, scheme.ClientV1)
		} else {
			paymentClient.Register(scheme.Network, scheme.Client)
		}
	}
	return NewX402MCPClient(mcpClient, paymentClient, options)
}

// CreateX402MCPClient creates a fully configured x402 MCP client.
//
// This factory function provides the simplest way to create an x402-enabled MCP client.
// It handles creation of the x402Client and scheme registration.
//
// Example:
//
//	mcpClient := // ... create MCP client from SDK
//	x402Mcp := mcp.CreateX402MCPClient(mcpClient, []mcp.SchemeRegistration{
//	    {Network: "eip155:84532", Client: evmClientScheme},
//	}, mcp.Options{AutoPayment: true})
func CreateX402MCPClient(
	mcpClient MCPClientInterface,
	schemes []SchemeRegistration,
	options Options,
) *X402MCPClient {
	paymentClient := x402.Newx402Client()
	for _, scheme := range schemes {
		if scheme.X402Version == 1 {
			paymentClient.RegisterV1(scheme.Network, scheme.ClientV1)
		} else {
			paymentClient.Register(scheme.Network, scheme.Client)
		}
	}
	return NewX402MCPClient(mcpClient, paymentClient, options)
}
