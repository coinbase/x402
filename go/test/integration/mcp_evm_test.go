//go:build mcp

// Package integration_test contains integration tests for MCP transport with real EVM transactions.
// These tests verify the complete MCP payment flow using:
// - Real MCP SDK transport (github.com/modelcontextprotocol/go-sdk/mcp)
// - Real EVM blockchain transactions on Base Sepolia (NO mocks for x402 protocol)
// - Real x402 payment processing (NO mocks for payment verification or settlement)
//
// To run these tests, ensure the MCP SDK is installed:
//
//	go get github.com/modelcontextprotocol/go-sdk/mcp
//	go mod tidy
//
// Then run tests with the mcp build tag:
//
//	go test -tags=mcp ./test/integration
//
// Required environment variables:
// - EVM_CLIENT_PRIVATE_KEY: Private key for the client wallet (payer)
// - EVM_FACILITATOR_PRIVATE_KEY: Private key for the facilitator wallet (settles payments)
//
// These tests make REAL blockchain transactions on Base Sepolia testnet.
// All x402 payment operations (verification, settlement) use real blockchain calls.
package integration_test

import (
	"context"
	"encoding/json"
	"fmt"
	"net/http"
	"os"
	"testing"
	"time"

	x402 "github.com/coinbase/x402/go"
	"github.com/coinbase/x402/go/mcp"
	evmclient "github.com/coinbase/x402/go/mechanisms/evm/exact/client"
	evmfacilitator "github.com/coinbase/x402/go/mechanisms/evm/exact/facilitator"
	evmserver "github.com/coinbase/x402/go/mechanisms/evm/exact/server"
	evmsigners "github.com/coinbase/x402/go/signers/evm"
	mcpsdk "github.com/modelcontextprotocol/go-sdk/mcp"
)

const (
	TEST_NETWORK = "eip155:84532"                               // Base Sepolia
	TEST_ASSET   = "0x036CbD53842c5426634e7929541eC2318f3dCF7e" // USDC on Base Sepolia
	TEST_PRICE   = "1000"                                       // 0.001 USDC
	TEST_PORT    = 4099
)

// TestMCPEVMIntegration tests the full MCP payment flow with real EVM transactions
func TestMCPEVMIntegration(t *testing.T) {
	// Skip if environment variables not set
	clientPrivateKey := os.Getenv("EVM_CLIENT_PRIVATE_KEY")
	facilitatorPrivateKey := os.Getenv("EVM_FACILITATOR_PRIVATE_KEY")

	if clientPrivateKey == "" || facilitatorPrivateKey == "" {
		t.Skip("Skipping MCP EVM integration test: EVM_CLIENT_PRIVATE_KEY and EVM_FACILITATOR_PRIVATE_KEY must be set")
	}

	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Minute)
	defer cancel()

	t.Run("MCP Payment Flow - Real EVM Transactions with Real MCP SDK", func(t *testing.T) {
		// ========================================================================
		// Setup Client (Payer)
		// ========================================================================
		clientSigner, err := evmsigners.NewClientSignerFromPrivateKey(clientPrivateKey)
		if err != nil {
			t.Fatalf("Failed to create client signer: %v", err)
		}

		paymentClient := x402.Newx402Client()
		evmClientScheme := evmclient.NewExactEvmScheme(clientSigner)
		paymentClient.Register(TEST_NETWORK, evmClientScheme)

		// Get client address
		clientAddr := ""
		if addrGetter, ok := clientSigner.(interface{ Address() string }); ok {
			clientAddr = addrGetter.Address()
			t.Logf("\n🔑 Client address: %s", clientAddr)
		}

		// ========================================================================
		// Setup Facilitator (Settles Payments)
		// ========================================================================
		facilitatorSigner, err := newRealFacilitatorEvmSigner(facilitatorPrivateKey, "https://sepolia.base.org")
		if err != nil {
			t.Fatalf("Failed to create facilitator signer: %v", err)
		}

		facilitator := x402.Newx402Facilitator()
		evmConfig := &evmfacilitator.ExactEvmSchemeConfig{
			DeployERC4337WithEIP6492: true,
		}
		evmFacilitator := evmfacilitator.NewExactEvmScheme(facilitatorSigner, evmConfig)
		facilitator.Register([]x402.Network{TEST_NETWORK}, evmFacilitator)

		facilitatorClient := &localEvmFacilitatorClient{facilitator: facilitator}

		// ========================================================================
		// Setup Resource Server
		// ========================================================================
		resourceServer := x402.Newx402ResourceServer(
			x402.WithFacilitatorClient(facilitatorClient),
		)
		evmServerScheme := evmserver.NewExactEvmScheme()
		resourceServer.Register(TEST_NETWORK, evmServerScheme)

		err = resourceServer.Initialize(ctx)
		if err != nil {
			t.Fatalf("Failed to initialize resource server: %v", err)
		}

		// Build payment requirements
		config := x402.ResourceConfig{
			Scheme:  "exact",
			Network: TEST_NETWORK,
			PayTo:   facilitatorSigner.GetAddresses()[0],
			Price:   "$0.001",
		}

		accepts, err := resourceServer.BuildPaymentRequirementsFromConfig(ctx, config)
		if err != nil {
			t.Fatalf("Failed to build payment requirements: %v", err)
		}

		// Ensure all required fields are set
		if len(accepts) == 0 {
			t.Fatal("No payment requirements returned")
		}
		if accepts[0].Asset == "" {
			accepts[0].Asset = TEST_ASSET
		}
		if accepts[0].PayTo == "" {
			accepts[0].PayTo = facilitatorSigner.GetAddresses()[0]
		}
		if accepts[0].MaxTimeoutSeconds == 0 {
			accepts[0].MaxTimeoutSeconds = 300
		}

		// ========================================================================
		// Setup REAL MCP Server with x402
		// ========================================================================
		mcpServer := mcpsdk.NewServer(&mcpsdk.Implementation{
			Name:    "x402 Test Server",
			Version: "1.0.0",
		}, nil)

		// Create payment wrapper
		paidHandler := mcp.CreatePaymentWrapper(resourceServer, mcp.PaymentWrapperConfig{
			Accepts: accepts,
			Resource: &mcp.ResourceInfo{
				URL:         "mcp://tool/get_weather",
				Description: "Get weather for a city",
				MimeType:    "application/json",
			},
		})

		// Free tool handler
		freeHandler := func(ctx context.Context, args map[string]interface{}, toolContext mcp.MCPToolContext) (mcp.MCPToolResult, error) {
			return mcp.MCPToolResult{
				Content: []mcp.MCPContentItem{
					{Type: "text", Text: "pong"},
				},
				IsError: false,
			}, nil
		}

		// Paid tool handler - wrap free handler with payment
		paidToolHandler := paidHandler(freeHandler)

		// Register free tool
		mcpServer.AddTool(&mcpsdk.Tool{
			Name:        "ping",
			Description: "A free health check tool",
			InputSchema: json.RawMessage(`{"type": "object"}`),
		}, func(ctx context.Context, req *mcpsdk.CallToolRequest) (*mcpsdk.CallToolResult, error) {
			args := make(map[string]interface{})
			if len(req.Params.Arguments) > 0 {
				if err := json.Unmarshal(req.Params.Arguments, &args); err != nil {
					return &mcpsdk.CallToolResult{
						IsError: true,
						Content: []mcpsdk.Content{
							&mcpsdk.TextContent{Text: fmt.Sprintf("failed to unmarshal arguments: %v", err)},
						},
					}, nil
				}
			}
			meta := make(map[string]interface{})
			if req.Params.Meta != nil {
				meta = req.Params.Meta.GetMeta()
			}

			toolContext := mcp.MCPToolContext{
				ToolName:  req.Params.Name,
				Arguments: args,
				Meta:      meta,
			}

			result, err := freeHandler(ctx, args, toolContext)
			if err != nil {
				return &mcpsdk.CallToolResult{
					IsError: true,
					Content: []mcpsdk.Content{
						&mcpsdk.TextContent{Text: err.Error()},
					},
				}, nil
			}

			content := make([]mcpsdk.Content, len(result.Content))
			for i, item := range result.Content {
				content[i] = &mcpsdk.TextContent{Text: item.Text}
			}

			return &mcpsdk.CallToolResult{
				Content: content,
				IsError: result.IsError,
			}, nil
		})

		// Register paid tool
		mcpServer.AddTool(&mcpsdk.Tool{
			Name:        "get_weather",
			Description: "Get current weather for a city. Requires payment of $0.001.",
			InputSchema: json.RawMessage(`{"type": "object", "properties": {"city": {"type": "string"}}}`),
		}, func(ctx context.Context, req *mcpsdk.CallToolRequest) (*mcpsdk.CallToolResult, error) {
			args := make(map[string]interface{})
			if len(req.Params.Arguments) > 0 {
				if err := json.Unmarshal(req.Params.Arguments, &args); err != nil {
					return &mcpsdk.CallToolResult{
						IsError: true,
						Content: []mcpsdk.Content{
							&mcpsdk.TextContent{Text: fmt.Sprintf("failed to unmarshal arguments: %v", err)},
						},
					}, nil
				}
			}
			meta := make(map[string]interface{})
			if req.Params.Meta != nil {
				meta = req.Params.Meta.GetMeta()
			}

			toolContext := mcp.MCPToolContext{
				ToolName:  req.Params.Name,
				Arguments: args,
				Meta:      meta,
			}

			result, err := paidToolHandler(ctx, args, toolContext)
			if err != nil {
				return &mcpsdk.CallToolResult{
					IsError: true,
					Content: []mcpsdk.Content{
						&mcpsdk.TextContent{Text: err.Error()},
					},
				}, nil
			}

			content := make([]mcpsdk.Content, len(result.Content))
			for i, item := range result.Content {
				content[i] = &mcpsdk.TextContent{Text: item.Text}
			}

			callResult := &mcpsdk.CallToolResult{
				Content: content,
				IsError: result.IsError,
			}

			// Preserve StructuredContent if present (needed for payment required responses)
			if result.StructuredContent != nil {
				callResult.StructuredContent = result.StructuredContent
			}

			// Add _meta if present - this is critical for payment response
			// Convert map[string]interface{} to mcpsdk.Meta (which is map[string]any)
			if result.Meta != nil {
				metaMap := make(mcpsdk.Meta)
				for k, v := range result.Meta {
					metaMap[k] = v
				}
				callResult.Meta = metaMap
			}

			return callResult, nil
		})

		// ========================================================================
		// Start HTTP Server for SSE Transport
		// ========================================================================
		// Use SSEHandler to manage SSE connections
		sseHandler := mcpsdk.NewSSEHandler(func(req *http.Request) *mcpsdk.Server {
			return mcpServer
		}, &mcpsdk.SSEOptions{})

		// Create HTTP mux
		mux := http.NewServeMux()
		mux.Handle("/sse", sseHandler)
		mux.Handle("/messages", sseHandler)

		// Start HTTP server
		httpServer := &http.Server{
			Addr:    fmt.Sprintf(":%d", TEST_PORT),
			Handler: mux,
		}

		go func() {
			if err := httpServer.ListenAndServe(); err != nil && err != http.ErrServerClosed {
				t.Logf("HTTP server error: %v", err)
			}
		}()

		// Wait for server to start
		time.Sleep(100 * time.Millisecond)
		t.Logf("\n🚀 Test MCP Server running on http://localhost:%d\n", TEST_PORT)

		// Cleanup
		defer func() {
			ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
			defer cancel()
			httpServer.Shutdown(ctx)
		}()

		// ========================================================================
		// Setup REAL MCP Client with SSE Transport
		// ========================================================================
		sseClientTransport := &mcpsdk.SSEClientTransport{
			Endpoint: fmt.Sprintf("http://localhost:%d/sse", TEST_PORT),
		}

		mcpClient := mcpsdk.NewClient(&mcpsdk.Implementation{
			Name:    "x402-test-client",
			Version: "1.0.0",
		}, nil)

		clientSession, err := mcpClient.Connect(ctx, sseClientTransport, nil)
		if err != nil {
			t.Fatalf("Failed to connect MCP client: %v", err)
		}
		defer clientSession.Close()

		// Wrap with x402 - create adapter that wraps the session
		x402McpClient := mcp.NewX402MCPClient(&mcpClientAdapter{
			client:  mcpClient,
			session: clientSession,
		}, paymentClient, mcp.Options{
			AutoPayment: true,
			OnPaymentRequested: func(context mcp.PaymentRequiredContext) (bool, error) {
				t.Logf("💰 Payment requested: %s atomic units", context.PaymentRequired.Accepts[0].Amount)
				return true, nil // Auto-approve for tests
			},
		})

		// ========================================================================
		// Test 1: Free tool works without payment
		// ========================================================================
		t.Run("Free tool works without payment", func(t *testing.T) {
			result, err := x402McpClient.CallTool(ctx, "ping", map[string]interface{}{})
			if err != nil {
				t.Fatalf("Unexpected error: %v", err)
			}

			if result.PaymentMade {
				t.Error("Expected PaymentMade to be false for free tool")
			}
			if result.IsError {
				t.Error("Expected IsError to be false")
			}
			if len(result.Content) == 0 {
				t.Fatal("Expected content")
			}
			if result.Content[0].Text != "pong" {
				t.Errorf("Expected 'pong', got '%s'", result.Content[0].Text)
			}

			t.Logf("✅ Free tool result: %s", result.Content[0].Text)
		})

		// ========================================================================
		// Test 2: Paid tool returns 402 without payment (manual test)
		// ========================================================================
		t.Run("Paid tool returns 402 without payment", func(t *testing.T) {
			manualClient := mcp.NewX402MCPClient(&mcpClientAdapter{session: clientSession}, paymentClient, mcp.Options{
				AutoPayment: false,
			})

			_, err := manualClient.CallTool(ctx, "get_weather", map[string]interface{}{"city": "San Francisco"})
			if err == nil {
				t.Fatal("Expected 402 error")
			}

			paymentErr, ok := err.(*mcp.PaymentRequiredError)
			if !ok {
				t.Fatalf("Expected PaymentRequiredError, got %T: %v", err, err)
			}

			if paymentErr.Code != mcp.MCP_PAYMENT_REQUIRED_CODE {
				t.Errorf("Expected code %d, got %d", mcp.MCP_PAYMENT_REQUIRED_CODE, paymentErr.Code)
			}
			if paymentErr.PaymentRequired == nil {
				t.Fatal("Expected PaymentRequired to be set")
			}

			t.Logf("💳 402 Payment Required received as expected")
		})

		// ========================================================================
		// Test 3: Paid tool with payment succeeds (REAL BLOCKCHAIN TRANSACTION)
		// ========================================================================
		t.Run("Paid tool with auto-payment and real blockchain settlement", func(t *testing.T) {
			t.Log("\n🔄 Starting paid tool call with real blockchain settlement...\n")

			result, err := x402McpClient.CallTool(ctx, "get_weather", map[string]interface{}{"city": "New York"})
			if err != nil {
				t.Fatalf("Unexpected error: %v", err)
			}

			// Verify payment was made
			if !result.PaymentMade {
				t.Error("Expected PaymentMade to be true")
			}
			if result.IsError {
				t.Error("Expected IsError to be false")
			}

			// Verify we got the tool result
			if len(result.Content) == 0 {
				t.Fatal("Expected content")
			}

			// Verify payment response (settlement result)
			if result.PaymentResponse == nil {
				t.Fatal("Expected PaymentResponse to be set")
			}
			if !result.PaymentResponse.Success {
				t.Error("Expected settlement to succeed")
			}
			if result.PaymentResponse.Transaction == "" {
				t.Error("Expected transaction hash to be set")
			}
			if result.PaymentResponse.Network != TEST_NETWORK {
				t.Errorf("Expected network %s, got %s", TEST_NETWORK, result.PaymentResponse.Network)
			}

			t.Logf("\n✅ Settlement successful!")
			t.Logf("   Transaction: %s", result.PaymentResponse.Transaction)
			t.Logf("   Network: %s", result.PaymentResponse.Network)
			t.Logf("   View on BaseScan: https://sepolia.basescan.org/tx/%s\n", result.PaymentResponse.Transaction)
		})

		// ========================================================================
		// Test 4: Multiple paid tool calls work
		// ========================================================================
		t.Run("Multiple paid tool calls work", func(t *testing.T) {
			t.Log("\n🔄 Starting second paid tool call...\n")

			result, err := x402McpClient.CallTool(ctx, "get_weather", map[string]interface{}{"city": "Los Angeles"})
			if err != nil {
				t.Fatalf("Unexpected error: %v", err)
			}

			if !result.PaymentMade {
				t.Error("Expected PaymentMade to be true")
			}
			if result.PaymentResponse == nil {
				t.Fatal("Expected PaymentResponse to be set")
			}
			if !result.PaymentResponse.Success {
				t.Error("Expected successful settlement")
			}
			if result.PaymentResponse.Transaction == "" {
				t.Error("Expected transaction hash to be set")
			}

			t.Logf("✅ Second settlement successful!")
			t.Logf("   Transaction: %s\n", result.PaymentResponse.Transaction)
		})

		// ========================================================================
		// Test 5: List tools works
		// ========================================================================
		t.Run("List tools works", func(t *testing.T) {
			tools, err := x402McpClient.ListTools(ctx)
			if err != nil {
				t.Fatalf("Unexpected error: %v", err)
			}

			if tools == nil {
				t.Fatal("Expected tools list")
			}

			t.Logf("📋 Available tools listed successfully")
		})
	})
}

// mcpClientAdapter adapts mcpsdk.Client and ClientSession to mcp.MCPClientInterface
type mcpClientAdapter struct {
	client  *mcpsdk.Client
	session *mcpsdk.ClientSession
}

func (a *mcpClientAdapter) Connect(ctx context.Context, transport interface{}) error {
	// Already connected via session - this is called during initialization
	// but we're already connected, so just return nil
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

	// Preserve StructuredContent if present (needed for payment required responses)
	if result.StructuredContent != nil {
		if structuredMap, ok := result.StructuredContent.(map[string]interface{}); ok {
			mcpResult.StructuredContent = structuredMap
		}
	}

	// Preserve Meta - critical for payment responses
	// GetMeta() returns the underlying map, so we need to copy it to avoid sharing
	if result.Meta != nil {
		metaMap := result.Meta.GetMeta()
		if metaMap != nil && len(metaMap) > 0 {
			mcpResult.Meta = make(map[string]interface{}, len(metaMap))
			for k, v := range metaMap {
				mcpResult.Meta[k] = v
			}
		}
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

	return map[string]interface{}{
		"tools": tools,
	}, nil
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
	return initResult.Instructions, nil
}

func (a *mcpClientAdapter) Ping(ctx context.Context) error {
	return a.session.Ping(ctx, &mcpsdk.PingParams{})
}

func (a *mcpClientAdapter) Complete(ctx context.Context, prompt string, cursor int) (interface{}, error) {
	// Not implemented for this test
	return nil, fmt.Errorf("not implemented")
}

func (a *mcpClientAdapter) SetLoggingLevel(ctx context.Context, level string) error {
	return a.session.SetLoggingLevel(ctx, &mcpsdk.SetLoggingLevelParams{Level: mcpsdk.LoggingLevel(level)})
}

func (a *mcpClientAdapter) SendRootsListChanged(ctx context.Context) error {
	// Not applicable for client
	return nil
}
