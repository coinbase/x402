package mcp

import (
	"context"
	"fmt"
	"testing"

	x402 "github.com/coinbase/x402/go"
	"github.com/coinbase/x402/go/types"
)

// Mock facilitator client for testing
type mockFacilitatorClient struct {
	verifyFunc func(ctx context.Context, payloadBytes []byte, requirementsBytes []byte) (*x402.VerifyResponse, error)
	settleFunc func(ctx context.Context, payloadBytes []byte, requirementsBytes []byte) (*x402.SettleResponse, error)
}

func (m *mockFacilitatorClient) Verify(ctx context.Context, payloadBytes []byte, requirementsBytes []byte) (*x402.VerifyResponse, error) {
	if m.verifyFunc != nil {
		return m.verifyFunc(ctx, payloadBytes, requirementsBytes)
	}
	return &x402.VerifyResponse{IsValid: true, Payer: "test-payer"}, nil
}

func (m *mockFacilitatorClient) Settle(ctx context.Context, payloadBytes []byte, requirementsBytes []byte) (*x402.SettleResponse, error) {
	if m.settleFunc != nil {
		return m.settleFunc(ctx, payloadBytes, requirementsBytes)
	}
	return &x402.SettleResponse{Success: true, Transaction: "tx123", Network: "x402:cash", Payer: "test-payer"}, nil
}

func (m *mockFacilitatorClient) GetSupported(ctx context.Context) (x402.SupportedResponse, error) {
	return x402.SupportedResponse{
		Kinds: []types.SupportedKind{
			{X402Version: 2, Scheme: "cash", Network: "x402:cash"},
		},
		Extensions: []string{},
		Signers:    make(map[string][]string),
	}, nil
}

// Mock scheme network server for testing
type mockSchemeNetworkServer struct {
	scheme string
}

func (m *mockSchemeNetworkServer) Scheme() string {
	return m.scheme
}

func (m *mockSchemeNetworkServer) ParsePrice(price x402.Price, network x402.Network) (x402.AssetAmount, error) {
	return x402.AssetAmount{
		Asset:  "USD",
		Amount: "1000",
		Extra:  make(map[string]interface{}),
	}, nil
}

func (m *mockSchemeNetworkServer) EnhancePaymentRequirements(ctx context.Context, base types.PaymentRequirements, supported types.SupportedKind, extensions []string) (types.PaymentRequirements, error) {
	enhanced := base
	if enhanced.Extra == nil {
		enhanced.Extra = make(map[string]interface{})
	}
	return enhanced, nil
}

func TestCreatePaymentWrapper_BasicFlow(t *testing.T) {
	// Create a real resource server instance with cash mock scheme
	// Use cash mock for simplicity - it doesn't require real blockchain
	mockFacilitator := &mockFacilitatorClient{}
	mockSchemeServer := &mockSchemeNetworkServer{scheme: "cash"}
	
	server := x402.Newx402ResourceServer(
		x402.WithFacilitatorClient(mockFacilitator),
		x402.WithSchemeServer("x402:cash", mockSchemeServer),
	)
	
	ctx := context.Background()
	if err := server.Initialize(ctx); err != nil {
		t.Fatalf("Failed to initialize server: %v", err)
	}
	
	config := PaymentWrapperConfig{
		Accepts: []types.PaymentRequirements{
			{
				Scheme:  "cash",
				Network: "x402:cash",
				Amount:  "1000",
				PayTo:   "test-recipient",
			},
		},
		Resource: &ResourceInfo{
			URL:         "mcp://tool/test",
			Description: "Test tool",
			MimeType:    "application/json",
		},
	}

	paid := CreatePaymentWrapper(server, config)

	// Create a handler
	handler := func(ctx context.Context, args map[string]interface{}, toolContext MCPToolContext) (MCPToolResult, error) {
		return MCPToolResult{
			Content: []MCPContentItem{
				{Type: "text", Text: "success"},
			},
			IsError: false,
		}, nil
	}

	wrapped := paid(handler)

	// Test with payment - use cash scheme format
	payload := types.PaymentPayload{
		X402Version: 2,
		Accepted: types.PaymentRequirements{
			Scheme:  "cash",
			Network: "x402:cash",
			Amount:  "1000",
			PayTo:   "test-recipient",
		},
		Payload: map[string]interface{}{
			"signature": "~test-payer",
		},
	}

	args := map[string]interface{}{"test": "value"}
	toolContext := MCPToolContext{
		ToolName:  "test",
		Arguments: args,
		Meta: map[string]interface{}{
			MCP_PAYMENT_META_KEY: payload,
		},
	}

	result, err := wrapped(ctx, args, toolContext)
	if err != nil {
		t.Fatalf("Unexpected error: %v", err)
	}

	if result.IsError {
		t.Error("Expected success result")
	}

	// Verify settlement response is in meta
	if result.Meta == nil {
		t.Fatal("Expected meta to be set")
	}
	if result.Meta[MCP_PAYMENT_RESPONSE_META_KEY] == nil {
		t.Error("Expected payment response in meta")
	}
}

func TestCreatePaymentWrapper_NoPayment(t *testing.T) {
	mockFacilitator := &mockFacilitatorClient{}
	mockSchemeServer := &mockSchemeNetworkServer{scheme: "cash"}
	
	server := x402.Newx402ResourceServer(
		x402.WithFacilitatorClient(mockFacilitator),
		x402.WithSchemeServer("x402:cash", mockSchemeServer),
	)
	
	ctx := context.Background()
	if err := server.Initialize(ctx); err != nil {
		t.Fatalf("Failed to initialize server: %v", err)
	}
	
	config := PaymentWrapperConfig{
		Accepts: []types.PaymentRequirements{
			{
				Scheme:  "cash",
				Network: "x402:cash",
				Amount:  "1000",
				PayTo:   "test-recipient",
			},
		},
	}

	paid := CreatePaymentWrapper(server, config)
	handler := func(ctx context.Context, args map[string]interface{}, toolContext MCPToolContext) (MCPToolResult, error) {
		return MCPToolResult{}, nil
	}

	wrapped := paid(handler)

	args := map[string]interface{}{}
	toolContext := MCPToolContext{
		ToolName:  "test",
		Arguments: args,
		Meta:      map[string]interface{}{}, // No payment
	}

	result, err := wrapped(ctx, args, toolContext)
	if err != nil {
		t.Fatalf("Unexpected error: %v", err)
	}

	// Should return payment required error
	if !result.IsError {
		t.Error("Expected error result for missing payment")
	}
}

func TestCreatePaymentWrapper_VerificationFailure(t *testing.T) {
	// For verification failure, we need a real server with a scheme that will fail verification
	// Since we can't easily mock this, we'll test the error path differently
	server := x402.Newx402ResourceServer()

	config := PaymentWrapperConfig{
		Accepts: []types.PaymentRequirements{
			{
				Scheme:  "cash",
				Network: "x402:cash",
				Amount:  "1000",
				PayTo:   "test-recipient",
			},
		},
	}

	paid := CreatePaymentWrapper(server, config)
	handler := func(ctx context.Context, args map[string]interface{}, toolContext MCPToolContext) (MCPToolResult, error) {
		return MCPToolResult{}, nil
	}

	wrapped := paid(handler)

	ctx := context.Background()
	args := map[string]interface{}{}
	payload := types.PaymentPayload{
		X402Version: 2,
		Payload:     map[string]interface{}{"signature": "0xinvalid"},
	}
	toolContext := MCPToolContext{
		ToolName:  "test",
		Arguments: args,
		Meta: map[string]interface{}{
			MCP_PAYMENT_META_KEY: payload,
		},
	}

	result, err := wrapped(ctx, args, toolContext)
	if err != nil {
		t.Fatalf("Unexpected error: %v", err)
	}

	// Should return payment required error
	if !result.IsError {
		t.Error("Expected error result for verification failure")
	}
}

func TestCreatePaymentWrapper_Hooks(t *testing.T) {
	beforeCalled := false
	afterCalled := false
	settlementCalled := false

	mockFacilitator := &mockFacilitatorClient{}
	mockSchemeServer := &mockSchemeNetworkServer{scheme: "cash"}
	
	server := x402.Newx402ResourceServer(
		x402.WithFacilitatorClient(mockFacilitator),
		x402.WithSchemeServer("x402:cash", mockSchemeServer),
	)
	
	ctx := context.Background()
	if err := server.Initialize(ctx); err != nil {
		t.Fatalf("Failed to initialize server: %v", err)
	}

	var beforeHook BeforeExecutionHook = func(context ServerHookContext) (bool, error) {
		beforeCalled = true
		return true, nil
	}
	var afterHook AfterExecutionHook = func(context AfterExecutionContext) error {
		afterCalled = true
		return nil
	}
	var settlementHook AfterSettlementHook = func(context SettlementContext) error {
		settlementCalled = true
		return nil
	}

	config := PaymentWrapperConfig{
		Accepts: []types.PaymentRequirements{
			{
				Scheme:  "cash",
				Network: "x402:cash",
				Amount:  "1000",
				PayTo:   "test-recipient",
			},
		},
		Hooks: &PaymentWrapperHooks{
			OnBeforeExecution: &beforeHook,
			OnAfterExecution:  &afterHook,
			OnAfterSettlement: &settlementHook,
		},
	}

	paid := CreatePaymentWrapper(server, config)
	handler := func(ctx context.Context, args map[string]interface{}, toolContext MCPToolContext) (MCPToolResult, error) {
		return MCPToolResult{
			Content: []MCPContentItem{
				{Type: "text", Text: "success"},
			},
		}, nil
	}

	wrapped := paid(handler)

	args := map[string]interface{}{"test": "value"}
	payload := types.PaymentPayload{
		X402Version: 2,
		Accepted: types.PaymentRequirements{
			Scheme:  "cash",
			Network: "x402:cash",
			Amount:  "1000",
			PayTo:   "test-recipient",
		},
		Payload: map[string]interface{}{"signature": "~test-payer"},
	}
	toolContext := MCPToolContext{
		ToolName:  "test",
		Arguments: args,
		Meta: map[string]interface{}{
			MCP_PAYMENT_META_KEY: payload,
		},
	}

	result, err := wrapped(ctx, args, toolContext)
	if err != nil {
		t.Fatalf("Unexpected error: %v", err)
	}

	if result.IsError {
		t.Error("Expected success result")
	}
	if !beforeCalled {
		t.Error("Expected OnBeforeExecution hook to be called")
	}
	if !afterCalled {
		t.Error("Expected OnAfterExecution hook to be called")
	}
	if !settlementCalled {
		t.Error("Expected OnAfterSettlement hook to be called")
	}
}

func TestCreatePaymentWrapper_AbortOnBeforeExecution(t *testing.T) {
	mockFacilitator := &mockFacilitatorClient{}
	mockSchemeServer := &mockSchemeNetworkServer{scheme: "cash"}
	
	server := x402.Newx402ResourceServer(
		x402.WithFacilitatorClient(mockFacilitator),
		x402.WithSchemeServer("x402:cash", mockSchemeServer),
	)
	
	ctx := context.Background()
	if err := server.Initialize(ctx); err != nil {
		t.Fatalf("Failed to initialize server: %v", err)
	}

	var abortHook BeforeExecutionHook = func(context ServerHookContext) (bool, error) {
		return false, nil // Abort execution
	}

	config := PaymentWrapperConfig{
		Accepts: []types.PaymentRequirements{
			{
				Scheme:  "cash",
				Network: "x402:cash",
				Amount:  "1000",
				PayTo:   "test-recipient",
			},
		},
		Hooks: &PaymentWrapperHooks{
			OnBeforeExecution: &abortHook,
		},
	}

	paid := CreatePaymentWrapper(server, config)
	handlerCalled := false
	handler := func(ctx context.Context, args map[string]interface{}, toolContext MCPToolContext) (MCPToolResult, error) {
		handlerCalled = true
		return MCPToolResult{}, nil
	}

	wrapped := paid(handler)

	args := map[string]interface{}{}
	payload := types.PaymentPayload{
		X402Version: 2,
		Accepted: types.PaymentRequirements{
			Scheme:  "cash",
			Network: "x402:cash",
			Amount:  "1000",
			PayTo:   "test-recipient",
		},
		Payload: map[string]interface{}{"signature": "~test-payer"},
	}
	toolContext := MCPToolContext{
		ToolName:  "test",
		Arguments: args,
		Meta: map[string]interface{}{
			MCP_PAYMENT_META_KEY: payload,
		},
	}

	result, err := wrapped(ctx, args, toolContext)
	if err != nil {
		t.Fatalf("Unexpected error: %v", err)
	}

	if handlerCalled {
		t.Error("Handler should not be called when hook aborts")
	}
	if !result.IsError {
		t.Error("Expected error result when hook aborts")
	}
}

func TestCreatePaymentWrapper_ToolHandlerError_NoSettlement(t *testing.T) {
	// When the tool handler returns IsError=true, settlement should NOT happen
	settleCalled := false
	mockFacilitator := &mockFacilitatorClient{
		settleFunc: func(ctx context.Context, payloadBytes []byte, requirementsBytes []byte) (*x402.SettleResponse, error) {
			settleCalled = true
			return &x402.SettleResponse{Success: true, Transaction: "tx", Network: "x402:cash", Payer: "p"}, nil
		},
	}
	mockSchemeServer := &mockSchemeNetworkServer{scheme: "cash"}

	server := x402.Newx402ResourceServer(
		x402.WithFacilitatorClient(mockFacilitator),
		x402.WithSchemeServer("x402:cash", mockSchemeServer),
	)

	ctx := context.Background()
	if err := server.Initialize(ctx); err != nil {
		t.Fatalf("Failed to initialize server: %v", err)
	}

	config := PaymentWrapperConfig{
		Accepts: []types.PaymentRequirements{
			{Scheme: "cash", Network: "x402:cash", Amount: "1000", PayTo: "test-recipient"},
		},
	}

	paid := CreatePaymentWrapper(server, config)
	handler := func(ctx context.Context, args map[string]interface{}, toolContext MCPToolContext) (MCPToolResult, error) {
		return MCPToolResult{
			Content: []MCPContentItem{{Type: "text", Text: "tool error"}},
			IsError: true,
		}, nil
	}

	wrapped := paid(handler)

	payload := types.PaymentPayload{
		X402Version: 2,
		Accepted:    types.PaymentRequirements{Scheme: "cash", Network: "x402:cash", Amount: "1000", PayTo: "test-recipient"},
		Payload:     map[string]interface{}{"signature": "~test-payer"},
	}
	toolContext := MCPToolContext{
		ToolName:  "test",
		Arguments: map[string]interface{}{},
		Meta:      map[string]interface{}{MCP_PAYMENT_META_KEY: payload},
	}

	result, err := wrapped(ctx, map[string]interface{}{}, toolContext)
	if err != nil {
		t.Fatalf("Unexpected error: %v", err)
	}

	if !result.IsError {
		t.Error("Expected error result from handler")
	}
	if settleCalled {
		t.Error("Settlement should NOT be called when handler returns an error")
	}
}

func TestCreatePaymentWrapper_HookErrors_NonFatal(t *testing.T) {
	// OnAfterExecution and OnAfterSettlement errors should be swallowed
	mockFacilitator := &mockFacilitatorClient{}
	mockSchemeServer := &mockSchemeNetworkServer{scheme: "cash"}

	server := x402.Newx402ResourceServer(
		x402.WithFacilitatorClient(mockFacilitator),
		x402.WithSchemeServer("x402:cash", mockSchemeServer),
	)

	ctx := context.Background()
	if err := server.Initialize(ctx); err != nil {
		t.Fatalf("Failed to initialize server: %v", err)
	}

	var afterExecHook AfterExecutionHook = func(context AfterExecutionContext) error {
		return fmt.Errorf("after execution hook error")
	}
	var afterSettlementHook AfterSettlementHook = func(context SettlementContext) error {
		return fmt.Errorf("after settlement hook error")
	}

	config := PaymentWrapperConfig{
		Accepts: []types.PaymentRequirements{
			{Scheme: "cash", Network: "x402:cash", Amount: "1000", PayTo: "test-recipient"},
		},
		Hooks: &PaymentWrapperHooks{
			OnAfterExecution:  &afterExecHook,
			OnAfterSettlement: &afterSettlementHook,
		},
	}

	paid := CreatePaymentWrapper(server, config)
	handler := func(ctx context.Context, args map[string]interface{}, toolContext MCPToolContext) (MCPToolResult, error) {
		return MCPToolResult{
			Content: []MCPContentItem{{Type: "text", Text: "success"}},
		}, nil
	}

	wrapped := paid(handler)

	payload := types.PaymentPayload{
		X402Version: 2,
		Accepted:    types.PaymentRequirements{Scheme: "cash", Network: "x402:cash", Amount: "1000", PayTo: "test-recipient"},
		Payload:     map[string]interface{}{"signature": "~test-payer"},
	}
	toolContext := MCPToolContext{
		ToolName:  "test",
		Arguments: map[string]interface{}{},
		Meta:      map[string]interface{}{MCP_PAYMENT_META_KEY: payload},
	}

	result, err := wrapped(ctx, map[string]interface{}{}, toolContext)
	if err != nil {
		t.Fatalf("Hook errors should not propagate, got: %v", err)
	}

	if result.IsError {
		t.Error("Expected success result despite hook errors")
	}

	// Verify settlement still happened (payment response in meta)
	if result.Meta == nil || result.Meta[MCP_PAYMENT_RESPONSE_META_KEY] == nil {
		t.Error("Expected payment response in meta despite hook errors")
	}
}

func TestCreatePaymentWrapper_SettlementFailure(t *testing.T) {
	// Create a facilitator that fails settlement
	mockFacilitator := &mockFacilitatorClient{
		settleFunc: func(ctx context.Context, payloadBytes []byte, requirementsBytes []byte) (*x402.SettleResponse, error) {
			return nil, fmt.Errorf("settlement failed")
		},
	}
	mockSchemeServer := &mockSchemeNetworkServer{scheme: "cash"}
	
	server := x402.Newx402ResourceServer(
		x402.WithFacilitatorClient(mockFacilitator),
		x402.WithSchemeServer("x402:cash", mockSchemeServer),
	)
	
	ctx := context.Background()
	if err := server.Initialize(ctx); err != nil {
		t.Fatalf("Failed to initialize server: %v", err)
	}

	config := PaymentWrapperConfig{
		Accepts: []types.PaymentRequirements{
			{
				Scheme:  "cash",
				Network: "x402:cash",
				Amount:  "1000",
				PayTo:   "test-recipient",
			},
		},
	}

	paid := CreatePaymentWrapper(server, config)
	handler := func(ctx context.Context, args map[string]interface{}, toolContext MCPToolContext) (MCPToolResult, error) {
		return MCPToolResult{
			Content: []MCPContentItem{
				{Type: "text", Text: "success"},
			},
		}, nil
	}

	wrapped := paid(handler)

	args := map[string]interface{}{}
	payload := types.PaymentPayload{
		X402Version: 2,
		Accepted: types.PaymentRequirements{
			Scheme:  "cash",
			Network: "x402:cash",
			Amount:  "1000",
			PayTo:   "test-recipient",
		},
		Payload: map[string]interface{}{"signature": "~test-payer"},
	}
	toolContext := MCPToolContext{
		ToolName:  "test",
		Arguments: args,
		Meta: map[string]interface{}{
			MCP_PAYMENT_META_KEY: payload,
		},
	}

	result, err := wrapped(ctx, args, toolContext)
	if err != nil {
		t.Fatalf("Unexpected error: %v", err)
	}

	if !result.IsError {
		t.Error("Expected error result for settlement failure")
	}
}
