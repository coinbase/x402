package main

import (
	"context"
	"fmt"
	"os"

	x402 "github.com/coinbase/x402/go"
	evm "github.com/coinbase/x402/go/mechanisms/evm/exact/client"
	evmsigners "github.com/coinbase/x402/go/signers/evm"
	"github.com/coinbase/x402/go/mcp"
	"github.com/joho/godotenv"
	mcpsdk "github.com/modelcontextprotocol/go-sdk/mcp"
)

/**
 * MCP Client with x402 Payment Support - Advanced Example
 *
 * This example demonstrates the LOW-LEVEL API using X402MCPClient directly.
 * Use this approach when you need:
 * - Custom x402Client configuration
 * - Payment caching via onPaymentRequired hook
 * - Full control over the payment flow
 * - Integration with existing MCP clients
 *
 * Run with: go run . advanced
 */

// mcpClientAdapter adapts mcpsdk.ClientSession to mcp.MCPClientInterface
type mcpClientAdapter struct {
	client  *mcpsdk.Client
	session *mcpsdk.ClientSession
}

func (a *mcpClientAdapter) Connect(ctx context.Context, transport interface{}) error {
	// Already connected via session
	return nil
}

func (a *mcpClientAdapter) Close(ctx context.Context) error {
	return a.session.Close()
}

func (a *mcpClientAdapter) CallTool(ctx context.Context, params map[string]interface{}) (mcp.MCPToolResult, error) {
	name, _ := params["name"].(string)
	args, _ := params["arguments"].(map[string]interface{})
	meta, _ := params["_meta"].(map[string]interface{})

	callParams := &mcpsdk.CallToolParams{
		Name:      name,
		Arguments: args,
	}
	if meta != nil {
		callParams.Meta = mcpsdk.Meta(meta)
	}

	result, err := a.session.CallTool(ctx, callParams)
	if err != nil {
		return mcp.MCPToolResult{}, err
	}

	content := make([]mcp.MCPContentItem, len(result.Content))
	for i, item := range result.Content {
		if textContent, ok := item.(*mcpsdk.TextContent); ok {
			content[i] = mcp.MCPContentItem{
				Type: "text",
				Text: textContent.Text,
			}
		}
	}

	mcpResult := mcp.MCPToolResult{
		Content: content,
		IsError: result.IsError,
	}

	if result.Meta != nil {
		mcpResult.Meta = result.Meta.GetMeta()
	}

	return mcpResult, nil
}

func (a *mcpClientAdapter) ListTools(ctx context.Context) (interface{}, error) {
	result, err := a.session.ListTools(ctx, nil)
	if err != nil {
		return nil, err
	}

	tools := make([]map[string]interface{}, len(result.Tools))
	for i, tool := range result.Tools {
		tools[i] = map[string]interface{}{
			"name":        tool.Name,
			"description": tool.Description,
		}
	}

	return tools, nil
}

func (a *mcpClientAdapter) ListResources(ctx context.Context) (interface{}, error) {
	result, err := a.session.ListResources(ctx, nil)
	if err != nil {
		return nil, err
	}
	return result, nil
}

func (a *mcpClientAdapter) ReadResource(ctx context.Context, uri string) (interface{}, error) {
	result, err := a.session.ReadResource(ctx, &mcpsdk.ReadResourceParams{URI: uri})
	if err != nil {
		return nil, err
	}
	return result, nil
}

func (a *mcpClientAdapter) ListResourceTemplates(ctx context.Context) (interface{}, error) {
	result, err := a.session.ListResourceTemplates(ctx, nil)
	if err != nil {
		return nil, err
	}
	return result, nil
}

func (a *mcpClientAdapter) SubscribeResource(ctx context.Context, uri string) error {
	return a.session.Subscribe(ctx, &mcpsdk.SubscribeParams{URI: uri})
}

func (a *mcpClientAdapter) UnsubscribeResource(ctx context.Context, uri string) error {
	return a.session.Unsubscribe(ctx, &mcpsdk.UnsubscribeParams{URI: uri})
}

func (a *mcpClientAdapter) ListPrompts(ctx context.Context) (interface{}, error) {
	result, err := a.session.ListPrompts(ctx, nil)
	if err != nil {
		return nil, err
	}
	return result, nil
}

func (a *mcpClientAdapter) GetPrompt(ctx context.Context, name string) (interface{}, error) {
	result, err := a.session.GetPrompt(ctx, &mcpsdk.GetPromptParams{Name: name})
	if err != nil {
		return nil, err
	}
	return result, nil
}

func (a *mcpClientAdapter) GetServerCapabilities(ctx context.Context) (interface{}, error) {
	initResult := a.session.InitializeResult()
	if initResult == nil {
		return nil, fmt.Errorf("session not initialized")
	}
	return initResult.Capabilities, nil
}

func (a *mcpClientAdapter) GetServerVersion(ctx context.Context) (interface{}, error) {
	initResult := a.session.InitializeResult()
	if initResult == nil {
		return nil, fmt.Errorf("session not initialized")
	}
	return initResult.ServerInfo.Version, nil
}

func (a *mcpClientAdapter) GetInstructions(ctx context.Context) (string, error) {
	initResult := a.session.InitializeResult()
	if initResult == nil {
		return "", fmt.Errorf("session not initialized")
	}
	return initResult.ServerInfo.Instructions, nil
}

func (a *mcpClientAdapter) Ping(ctx context.Context) error {
	return a.session.Ping(ctx, &mcpsdk.PingParams{})
}

func (a *mcpClientAdapter) Complete(ctx context.Context, prompt string, cursor int) (interface{}, error) {
	return nil, fmt.Errorf("not implemented")
}

func (a *mcpClientAdapter) SetLoggingLevel(ctx context.Context, level string) error {
	return a.session.SetLoggingLevel(ctx, &mcpsdk.SetLoggingLevelParams{Level: level})
}

func (a *mcpClientAdapter) SendRootsListChanged(ctx context.Context) error {
	return nil
}

/**
 * Demonstrates the advanced API with manual setup and hooks.
 */
func runAdvanced() error {
	fmt.Println("\n📦 Using ADVANCED API (X402MCPClient with manual setup)\n")

	// Load environment variables
	if err := godotenv.Load(); err != nil {
		fmt.Println("No .env file found, using environment variables")
	}

	evmPrivateKey := os.Getenv("EVM_PRIVATE_KEY")
	if evmPrivateKey == "" {
		return fmt.Errorf("EVM_PRIVATE_KEY environment variable is required")
	}

	serverURL := os.Getenv("MCP_SERVER_URL")
	if serverURL == "" {
		serverURL = "http://localhost:4022"
	}

	fmt.Printf("🔌 Connecting to MCP server at: %s\n", serverURL)

	// Create EVM signer
	evmSigner, err := evmsigners.NewClientSignerFromPrivateKey(evmPrivateKey)
	if err != nil {
		return fmt.Errorf("failed to create EVM signer: %w", err)
	}

	fmt.Printf("💳 Using wallet: %s\n", evmSigner.Address())

	// ========================================================================
	// ADVANCED: Manual setup with full control using REAL MCP SDK
	// ========================================================================

	// Step 1: Connect to REAL MCP server using SSE transport
	ctx := context.Background()

	sseClientTransport := &mcpsdk.SSEClientTransport{
		Endpoint: serverURL + "/sse",
	}

	mcpClient := mcpsdk.NewClient(&mcpsdk.Implementation{
		Name:    "x402-mcp-client-advanced",
		Version: "1.0.0",
	}, nil)

	clientSession, err := mcpClient.Connect(ctx, sseClientTransport, nil)
	if err != nil {
		return fmt.Errorf("failed to connect to MCP server: %w", err)
	}
	defer clientSession.Close()

	// Create adapter
	adapter := &mcpClientAdapter{
		client:  mcpClient,
		session: clientSession,
	}

	// Step 2: Create x402 payment client manually
	paymentClient := x402.Newx402Client()
	paymentClient.Register("eip155:84532", evm.NewExactEvmScheme(evmSigner))

	// Step 3: Compose into X402MCPClient using adapter
	x402Mcp := mcp.NewX402MCPClient(adapter, paymentClient, mcp.Options{
		AutoPayment: true,
		OnPaymentRequested: func(context mcp.PaymentRequiredContext) (bool, error) {
			price := context.PaymentRequired.Accepts[0]
			fmt.Printf("\n💰 Payment required for tool: %s\n", context.ToolName)
			fmt.Printf("   Amount: %s (%s)\n", price.Amount, price.Asset)
			fmt.Printf("   Network: %s\n", price.Network)
			fmt.Println("   Approving payment...\n")
			return true, nil
		},
	})

	// ========================================================================
	// ADVANCED: Register hooks for observability and control
	// ========================================================================

	// Hook: Called when 402 is received (before payment)
	// Can return custom payment or abort
	x402Mcp.OnPaymentRequired(func(context mcp.PaymentRequiredContext) (*mcp.PaymentRequiredHookResult, error) {
		fmt.Printf("🔔 [Hook] Payment required received for: %s\n", context.ToolName)
		fmt.Printf("   Options: %d payment option(s)\n", len(context.PaymentRequired.Accepts))
		// Return nil to proceed with normal payment flow
		// Return &PaymentRequiredHookResult{Payment: ...} to use cached payment
		// Return &PaymentRequiredHookResult{Abort: true} to abort
		return nil, nil
	})

	// Hook: Called before payment is created
	x402Mcp.OnBeforePayment(func(context mcp.PaymentRequiredContext) error {
		fmt.Printf("📝 [Hook] Creating payment for: %s\n", context.ToolName)
		return nil
	})

	// Hook: Called after payment is submitted
	x402Mcp.OnAfterPayment(func(context mcp.AfterPaymentContext) error {
		fmt.Printf("✅ [Hook] Payment submitted for: %s\n", context.ToolName)
		if context.SettleResponse != nil {
			fmt.Printf("   Transaction: %s\n", context.SettleResponse.Transaction)
		}
		return nil
	})

	fmt.Println("✅ Connected to MCP server")
	fmt.Println("📊 Hooks enabled: OnPaymentRequired, OnBeforePayment, OnAfterPayment\n")

	// List tools
	fmt.Println("📋 Discovering available tools...")
	toolsResult, err := adapter.ListTools(ctx)
	if err != nil {
		return fmt.Errorf("failed to list tools: %w", err)
	}

	if tools, ok := toolsResult.([]map[string]interface{}); ok {
		fmt.Println("Available tools:")
		for _, tool := range tools {
			name, _ := tool["name"].(string)
			desc, _ := tool["description"].(string)
			fmt.Printf("   - %s: %s\n", name, desc)
		}
	}
	fmt.Println()

	// Test free tool
	fmt.Println("━" + string(make([]byte, 50)) + "━")
	fmt.Println("🆓 Test 1: Calling free tool (ping)")
	fmt.Println("━" + string(make([]byte, 50)) + "━")

	pingResult, err := x402Mcp.CallTool(ctx, "ping", map[string]interface{}{})
	if err != nil {
		return fmt.Errorf("failed to call ping: %w", err)
	}

	if len(pingResult.Content) > 0 {
		fmt.Printf("Response: %s\n", pingResult.Content[0].Text)
	}
	fmt.Printf("Payment made: %v\n\n", pingResult.PaymentMade)

	// Test paid tool
	fmt.Println("━" + string(make([]byte, 50)) + "━")
	fmt.Println("💰 Test 2: Calling paid tool (get_weather)")
	fmt.Println("━" + string(make([]byte, 50)) + "━")

	weatherResult, err := x402Mcp.CallTool(ctx, "get_weather", map[string]interface{}{
		"city": "San Francisco",
	})
	if err != nil {
		return fmt.Errorf("failed to call get_weather: %w", err)
	}

	if len(weatherResult.Content) > 0 {
		fmt.Printf("Response: %s\n", weatherResult.Content[0].Text)
	}
	fmt.Printf("Payment made: %v\n", weatherResult.PaymentMade)

	if weatherResult.PaymentResponse != nil {
		fmt.Println("\n📦 Payment Receipt:")
		fmt.Printf("   Success: %v\n", weatherResult.PaymentResponse.Success)
		if weatherResult.PaymentResponse.Transaction != "" {
			fmt.Printf("   Transaction: %s\n", weatherResult.PaymentResponse.Transaction)
		}
	}

	// Test accessing underlying clients
	fmt.Println("\n━" + string(make([]byte, 50)) + "━")
	fmt.Println("🔧 Test 3: Accessing underlying clients")
	fmt.Println("━" + string(make([]byte, 50)) + "━")
	fmt.Printf("MCP Client: %T\n", x402Mcp.Client())
	fmt.Printf("Payment Client: %T\n", x402Mcp.PaymentClient())

	fmt.Println("\n✅ Demo complete!")
	return nil
}
