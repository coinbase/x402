package mcp

import (
	"context"
	"encoding/json"
	"errors"
	"testing"

	x402 "github.com/coinbase/x402/go"
	"github.com/coinbase/x402/go/types"
)

// Mock MCP client for testing
type mockMCPClient struct {
	callToolResult MCPToolResult
	callToolError  error
}

func (m *mockMCPClient) Connect(ctx context.Context, transport interface{}) error {
	return nil
}

func (m *mockMCPClient) Close(ctx context.Context) error {
	return nil
}

func (m *mockMCPClient) CallTool(ctx context.Context, params map[string]interface{}) (MCPToolResult, error) {
	return m.callToolResult, m.callToolError
}

func (m *mockMCPClient) ListTools(ctx context.Context) (interface{}, error) {
	return nil, nil
}

func (m *mockMCPClient) ListResources(ctx context.Context) (interface{}, error) {
	return nil, nil
}

func (m *mockMCPClient) ReadResource(ctx context.Context, uri string) (interface{}, error) {
	return nil, nil
}

func (m *mockMCPClient) ListResourceTemplates(ctx context.Context) (interface{}, error) {
	return nil, nil
}

func (m *mockMCPClient) SubscribeResource(ctx context.Context, uri string) error {
	return nil
}

func (m *mockMCPClient) UnsubscribeResource(ctx context.Context, uri string) error {
	return nil
}

func (m *mockMCPClient) ListPrompts(ctx context.Context) (interface{}, error) {
	return nil, nil
}

func (m *mockMCPClient) GetPrompt(ctx context.Context, name string) (interface{}, error) {
	return nil, nil
}

func (m *mockMCPClient) GetServerCapabilities(ctx context.Context) (interface{}, error) {
	return nil, nil
}

func (m *mockMCPClient) GetServerVersion(ctx context.Context) (interface{}, error) {
	return nil, nil
}

func (m *mockMCPClient) GetInstructions(ctx context.Context) (string, error) {
	return "", nil
}

func (m *mockMCPClient) Ping(ctx context.Context) error {
	return nil
}

func (m *mockMCPClient) Complete(ctx context.Context, prompt string, cursor int) (interface{}, error) {
	return nil, nil
}

func (m *mockMCPClient) SetLoggingLevel(ctx context.Context, level string) error {
	return nil
}

func (m *mockMCPClient) SendRootsListChanged(ctx context.Context) error {
	return nil
}

func TestX402MCPClient_CallTool_FreeTool(t *testing.T) {
	mockClient := &mockMCPClient{
		callToolResult: MCPToolResult{
			Content: []MCPContentItem{
				{Type: "text", Text: "pong"},
			},
			IsError: false,
		},
	}

	paymentClient := x402.Newx402Client()
	x402Client := NewX402MCPClient(mockClient, paymentClient, Options{})

	ctx := context.Background()
	result, err := x402Client.CallTool(ctx, "ping", map[string]interface{}{})
	if err != nil {
		t.Fatalf("Unexpected error: %v", err)
	}

	if result.PaymentMade {
		t.Error("Expected no payment for free tool")
	}
	if len(result.Content) == 0 {
		t.Error("Expected content")
	}
}

func TestX402MCPClient_CallTool_PaymentRequired(t *testing.T) {
	paymentRequired := types.PaymentRequired{
		X402Version: 2,
		Accepts: []types.PaymentRequirements{
			{
				Scheme:            "exact",
				Network:           "eip155:84532",
				Amount:            "1000",
				Asset:             "USDC",
				PayTo:             "0xrecipient",
				MaxTimeoutSeconds: 300,
			},
		},
	}

	// Create result with payment required
	structuredBytes, _ := json.Marshal(paymentRequired)
	var structuredContent map[string]interface{}
	json.Unmarshal(structuredBytes, &structuredContent)

	mockClient := &mockMCPClient{
		callToolResult: MCPToolResult{
			IsError:          true,
			StructuredContent: structuredContent,
		},
	}

	paymentClient := x402.Newx402Client()
	// Register a mock scheme client so SelectPaymentRequirements doesn't fail
	mockSchemeClient := &mockSchemeNetworkClient{scheme: "exact"}
	paymentClient.Register("eip155:84532", mockSchemeClient)
	
	x402Client := NewX402MCPClient(mockClient, paymentClient, Options{
		AutoPayment: false,
	})

	ctx := context.Background()
	_, err := x402Client.CallTool(ctx, "paid_tool", map[string]interface{}{})
	if err == nil {
		t.Fatal("Expected error for payment required")
	}

	// Check if error is PaymentRequiredError (may be wrapped)
	var paymentErr *PaymentRequiredError
	if !errors.As(err, &paymentErr) {
		t.Fatalf("Expected PaymentRequiredError, got %T: %v", err, err)
	}
	if paymentErr.Code != MCP_PAYMENT_REQUIRED_CODE {
		t.Errorf("Expected code %d, got %d", MCP_PAYMENT_REQUIRED_CODE, paymentErr.Code)
	}
}

// ============================================================================
// Factory Function Tests
// ============================================================================

func TestWrapMCPClientWithPayment(t *testing.T) {
	mockClient := &mockMCPClient{
		callToolResult: MCPToolResult{
			Content: []MCPContentItem{
				{Type: "text", Text: "pong"},
			},
			IsError: false,
		},
	}

	paymentClient := x402.Newx402Client()
	x402Mcp := WrapMCPClientWithPayment(mockClient, paymentClient, Options{
		AutoPayment: true,
	})

	if x402Mcp == nil {
		t.Fatal("Expected non-nil client")
	}
	if x402Mcp.Client() != mockClient {
		t.Error("Expected client to wrap mockClient")
	}
}

func TestWrapMCPClientWithPaymentFromConfig(t *testing.T) {
	mockClient := &mockMCPClient{
		callToolResult: MCPToolResult{
			Content: []MCPContentItem{
				{Type: "text", Text: "pong"},
			},
			IsError: false,
		},
	}

	// Create a mock scheme client that implements SchemeNetworkClient
	mockSchemeClient := &mockSchemeNetworkClient{scheme: "exact"}

	x402Mcp := WrapMCPClientWithPaymentFromConfig(mockClient, []SchemeRegistration{
		{Network: "eip155:84532", Client: mockSchemeClient},
	}, Options{
		AutoPayment: true,
	})

	if x402Mcp == nil {
		t.Fatal("Expected non-nil client")
	}
}

// Mock scheme network client for testing
type mockSchemeNetworkClient struct {
	scheme string
}

func (m *mockSchemeNetworkClient) Scheme() string {
	return m.scheme
}

func (m *mockSchemeNetworkClient) CreatePaymentPayload(ctx context.Context, requirements types.PaymentRequirements) (types.PaymentPayload, error) {
	return types.PaymentPayload{
		X402Version: 2,
		Accepted:    requirements,
		Payload:     map[string]interface{}{"signature": "0xmock"},
	}, nil
}

func TestCreateX402MCPClient(t *testing.T) {
	mockClient := &mockMCPClient{
		callToolResult: MCPToolResult{
			Content: []MCPContentItem{
				{Type: "text", Text: "pong"},
			},
			IsError: false,
		},
	}

	mockSchemeClient := &mockSchemeNetworkClient{scheme: "exact"}

	x402Mcp := CreateX402MCPClient(mockClient, []SchemeRegistration{
		{Network: "eip155:84532", Client: mockSchemeClient},
	}, Options{
		AutoPayment: true,
	})

	if x402Mcp == nil {
		t.Fatal("Expected non-nil client")
	}
}

// ============================================================================
// Hook Tests
// ============================================================================

func TestX402MCPClient_Hooks(t *testing.T) {
	mockClient := &mockMCPClient{
		callToolResult: MCPToolResult{
			Content: []MCPContentItem{
				{Type: "text", Text: "pong"},
			},
			IsError: false,
		},
	}

	paymentClient := x402.Newx402Client()
	x402Client := NewX402MCPClient(mockClient, paymentClient, Options{})

	// Test hook registration returns self for chaining
	result := x402Client.OnPaymentRequired(func(context PaymentRequiredContext) (*PaymentRequiredHookResult, error) {
		return nil, nil
	})

	if result != x402Client {
		t.Error("Expected OnPaymentRequired to return self for chaining")
	}

	result = x402Client.OnBeforePayment(func(context PaymentRequiredContext) error {
		return nil
	})

	if result != x402Client {
		t.Error("Expected OnBeforePayment to return self for chaining")
	}

	result = x402Client.OnAfterPayment(func(context AfterPaymentContext) error {
		return nil
	})

	if result != x402Client {
		t.Error("Expected OnAfterPayment to return self for chaining")
	}
}

// ============================================================================
// Missing Coverage Tests
// ============================================================================

func TestX402MCPClient_PaymentClient(t *testing.T) {
	mockClient := &mockMCPClient{}
	paymentClient := x402.Newx402Client()
	x402Client := NewX402MCPClient(mockClient, paymentClient, Options{})

	if x402Client.PaymentClient() != paymentClient {
		t.Error("Expected PaymentClient() to return the underlying payment client")
	}
}

func TestX402MCPClient_CallToolWithPayment(t *testing.T) {
	mockSettleResponse := &x402.SettleResponse{
		Success:     true,
		Transaction: "0xtxhash123",
		Network:     "eip155:84532",
	}

	mockClient := &mockMCPClient{
		callToolResult: MCPToolResult{
			Content: []MCPContentItem{
				{Type: "text", Text: "success"},
			},
			IsError: false,
			Meta: map[string]interface{}{
				MCP_PAYMENT_RESPONSE_META_KEY: map[string]interface{}{
					"success":     true,
					"transaction": "0xtxhash123",
					"network":     "eip155:84532",
				},
			},
		},
	}

	paymentClient := x402.Newx402Client()
	x402Client := NewX402MCPClient(mockClient, paymentClient, Options{})

	payload := types.PaymentPayload{
		X402Version: 2,
		Payload: map[string]interface{}{
			"signature": "0x123",
		},
	}

	ctx := context.Background()
	result, err := x402Client.CallToolWithPayment(ctx, "paid_tool", map[string]interface{}{"arg": "value"}, payload)

	if err != nil {
		t.Fatalf("Unexpected error: %v", err)
	}

	if result == nil {
		t.Fatal("Expected non-nil result")
	}

	if !result.PaymentMade {
		t.Error("Expected PaymentMade to be true")
	}

	if result.PaymentResponse == nil {
		t.Fatal("Expected PaymentResponse to be set")
	}

	if result.PaymentResponse.Transaction != mockSettleResponse.Transaction {
		t.Errorf("Expected transaction %s, got %s", mockSettleResponse.Transaction, result.PaymentResponse.Transaction)
	}
}

func TestX402MCPClient_CallToolWithPayment_AfterPaymentHook(t *testing.T) {
	mockClient := &mockMCPClient{
		callToolResult: MCPToolResult{
			Content: []MCPContentItem{
				{Type: "text", Text: "success"},
			},
			IsError: false,
			Meta: map[string]interface{}{
				MCP_PAYMENT_RESPONSE_META_KEY: map[string]interface{}{
					"success":     true,
					"transaction": "0xtxhash123",
					"network":     "eip155:84532",
				},
			},
		},
	}

	paymentClient := x402.Newx402Client()
	x402Client := NewX402MCPClient(mockClient, paymentClient, Options{})

	hookCalled := false
	x402Client.OnAfterPayment(func(context AfterPaymentContext) error {
		hookCalled = true
		if context.ToolName != "paid_tool" {
			t.Errorf("Expected tool name 'paid_tool', got '%s'", context.ToolName)
		}
		if context.SettleResponse == nil {
			t.Error("Expected SettleResponse to be set in hook context")
		}
		return nil
	})

	payload := types.PaymentPayload{
		X402Version: 2,
		Payload: map[string]interface{}{
			"signature": "0x123",
		},
	}

	ctx := context.Background()
	_, err := x402Client.CallToolWithPayment(ctx, "paid_tool", map[string]interface{}{}, payload)

	if err != nil {
		t.Fatalf("Unexpected error: %v", err)
	}

	if !hookCalled {
		t.Error("Expected after payment hook to be called")
	}
}

func TestX402MCPClient_GetToolPaymentRequirements(t *testing.T) {
	paymentRequired := types.PaymentRequired{
		X402Version: 2,
		Accepts: []types.PaymentRequirements{
			{
				Scheme:  "exact",
				Network: "eip155:84532",
				Amount:  "1000",
				Asset:   "USDC",
				PayTo:   "0xrecipient",
			},
		},
	}

	paymentRequiredBytes, _ := json.Marshal(paymentRequired)

	mockClient := &mockMCPClient{
		callToolResult: MCPToolResult{
			Content: []MCPContentItem{
				{Type: "text", Text: string(paymentRequiredBytes)},
			},
			IsError: true,
			StructuredContent: map[string]interface{}{
				"x402Version": 2,
				"accepts": []interface{}{
					map[string]interface{}{
						"scheme":  "exact",
						"network": "eip155:84532",
						"amount":  "1000",
						"asset":   "USDC",
						"payTo":   "0xrecipient",
					},
				},
			},
		},
	}

	paymentClient := x402.Newx402Client()
	x402Client := NewX402MCPClient(mockClient, paymentClient, Options{})

	ctx := context.Background()
	result, err := x402Client.GetToolPaymentRequirements(ctx, "paid_tool", map[string]interface{}{})

	if err != nil {
		t.Fatalf("Unexpected error: %v", err)
	}

	if result == nil {
		t.Fatal("Expected non-nil PaymentRequired")
	}

	if result.X402Version != paymentRequired.X402Version {
		t.Errorf("Expected x402Version %d, got %d", paymentRequired.X402Version, result.X402Version)
	}

	if len(result.Accepts) != 1 {
		t.Errorf("Expected 1 accept, got %d", len(result.Accepts))
	}
}
