// Package mcp - map-based client API.
// NewX402MCPClient and NewX402MCPClientFromConfig provide payment-aware MCP clients
// that work with MCPClientInterface (map-based CallTool).

package mcp

import (
	"context"
	"encoding/json"
	"fmt"

	x402 "github.com/coinbase/x402/go"
	"github.com/coinbase/x402/go/types"
)

// X402MCPClient wraps an MCPClientInterface with automatic x402 payment handling.
type X402MCPClient struct {
	client        MCPClientInterface
	paymentClient *x402.X402Client
	options       Options
	onPaymentReq  PaymentRequiredHook
	onBeforePay   BeforePaymentHook
	onAfterPay    AfterPaymentHook
}

// NewX402MCPClient creates an x402-aware MCP client.
func NewX402MCPClient(mcpClient MCPClientInterface, paymentClient *x402.X402Client, options Options) *X402MCPClient {
	return &X402MCPClient{
		client:        mcpClient,
		paymentClient: paymentClient,
		options:       options,
	}
}

// NewX402MCPClientFromConfig creates an x402-aware MCP client from scheme registrations.
func NewX402MCPClientFromConfig(mcpClient MCPClientInterface, schemes []SchemeRegistration, options Options) *X402MCPClient {
	paymentClient := x402.Newx402Client()
	for _, reg := range schemes {
		if reg.Client != nil {
			paymentClient.Register(reg.Network, reg.Client)
		}
		if reg.ClientV1 != nil {
			paymentClient.RegisterV1(reg.Network, reg.ClientV1)
		}
	}
	return NewX402MCPClient(mcpClient, paymentClient, options)
}

// Client returns the underlying MCP client.
func (c *X402MCPClient) Client() MCPClientInterface {
	return c.client
}

// PaymentClient returns the underlying x402 payment client.
func (c *X402MCPClient) PaymentClient() *x402.X402Client {
	return c.paymentClient
}

// OnPaymentRequired registers a hook called when payment is required.
func (c *X402MCPClient) OnPaymentRequired(hook PaymentRequiredHook) *X402MCPClient {
	c.onPaymentReq = hook
	return c
}

// OnBeforePayment registers a hook called before creating payment.
func (c *X402MCPClient) OnBeforePayment(hook BeforePaymentHook) *X402MCPClient {
	c.onBeforePay = hook
	return c
}

// OnAfterPayment registers a hook called after payment is submitted.
func (c *X402MCPClient) OnAfterPayment(hook AfterPaymentHook) *X402MCPClient {
	c.onAfterPay = hook
	return c
}

// CallTool calls a tool with automatic payment handling.
func (c *X402MCPClient) CallTool(ctx context.Context, name string, args map[string]interface{}) (*MCPToolCallResult, error) {
	params := map[string]interface{}{
		"name":      name,
		"arguments": args,
	}

	result, err := c.client.CallTool(ctx, params)
	if err != nil {
		return nil, fmt.Errorf("tool call failed: %w", err)
	}

	if !result.IsError {
		return buildMCPToolCallResult(result, false), nil
	}

	paymentRequired, _ := ExtractPaymentRequiredFromResult(result)
	if paymentRequired == nil || len(paymentRequired.Accepts) == 0 {
		return buildMCPToolCallResult(result, false), nil
	}

	// Payment required - check auto-payment
	autoPayment := true
	if c.options.AutoPayment != nil {
		autoPayment = *c.options.AutoPayment
	}

	prCtx := PaymentRequiredContext{
		ToolName:        name,
		Arguments:       args,
		PaymentRequired: *paymentRequired,
	}

	// OnPaymentRequired hook - can provide custom payment or abort
	if c.onPaymentReq != nil {
		hookResult, err := c.onPaymentReq(prCtx)
		if err != nil {
			return nil, fmt.Errorf("payment required hook error: %w", err)
		}
		if hookResult != nil {
			if hookResult.Abort {
				return nil, &PaymentRequiredError{
					Code:            MCP_PAYMENT_REQUIRED_CODE,
					Message:         "Payment required",
					PaymentRequired: paymentRequired,
				}
			}
			if hookResult.Payment != nil {
				return c.callToolWithPayload(ctx, name, args, *hookResult.Payment)
			}
		}
	}

	if !autoPayment {
		return nil, &PaymentRequiredError{
			Code:            MCP_PAYMENT_REQUIRED_CODE,
			Message:         "Payment required",
			PaymentRequired: paymentRequired,
		}
	}

	// OnPaymentRequested - can approve/deny
	if c.options.OnPaymentRequested != nil {
		ok, err := c.options.OnPaymentRequested(prCtx)
		if err != nil {
			return nil, fmt.Errorf("payment requested hook error: %w", err)
		}
		if !ok {
			return nil, &PaymentRequiredError{
				Code:            MCP_PAYMENT_REQUIRED_CODE,
				Message:         "Payment denied by user",
				PaymentRequired: paymentRequired,
			}
		}
	}

	// OnBeforePayment hook
	if c.onBeforePay != nil {
		if err := c.onBeforePay(prCtx); err != nil {
			return nil, fmt.Errorf("before payment hook error: %w", err)
		}
	}

	payload, err := c.paymentClient.CreatePaymentPayload(
		ctx,
		paymentRequired.Accepts[0],
		paymentRequired.Resource,
		paymentRequired.Extensions,
	)
	if err != nil {
		return nil, fmt.Errorf("failed to create payment: %w", err)
	}

	return c.callToolWithPayload(ctx, name, args, payload)
}

// CallToolWithPayment calls a tool with a pre-created payment payload.
func (c *X402MCPClient) CallToolWithPayment(ctx context.Context, name string, args map[string]interface{}, payload types.PaymentPayload) (*MCPToolCallResult, error) {
	return c.callToolWithPayload(ctx, name, args, payload)
}

func (c *X402MCPClient) callToolWithPayload(ctx context.Context, name string, args map[string]interface{}, payload types.PaymentPayload) (*MCPToolCallResult, error) {
	params := AttachPaymentToMeta(map[string]interface{}{
		"name":      name,
		"arguments": args,
	}, payload)

	result, err := c.client.CallTool(ctx, params)
	if err != nil {
		return nil, fmt.Errorf("paid tool call failed: %w", err)
	}

	paymentResponse, _ := ExtractPaymentResponseFromMeta(result)

	// OnAfterPayment hook
	if c.onAfterPay != nil && paymentResponse != nil {
		_ = c.onAfterPay(AfterPaymentContext{
			ToolName:       name,
			PaymentPayload: payload,
			Result:         result,
			SettleResponse: paymentResponse,
		})
	}

	return buildMCPToolCallResult(result, true), nil
}

// GetToolPaymentRequirements fetches payment requirements for a tool without paying.
func (c *X402MCPClient) GetToolPaymentRequirements(ctx context.Context, name string, args map[string]interface{}) (*types.PaymentRequired, error) {
	params := map[string]interface{}{
		"name":      name,
		"arguments": args,
	}

	result, err := c.client.CallTool(ctx, params)
	if err != nil {
		return nil, err
	}

	return ExtractPaymentRequiredFromResult(result)
}

func buildMCPToolCallResult(result MCPToolResult, paymentMade bool) *MCPToolCallResult {
	paymentResponse, _ := ExtractPaymentResponseFromMeta(result)

	// Convert map to SettleResponse if needed
	var settleResp *x402.SettleResponse
	if paymentResponse != nil {
		settleResp = paymentResponse
	} else if result.Meta != nil {
		if pr, ok := result.Meta[MCP_PAYMENT_RESPONSE_META_KEY]; ok {
			prBytes, err := json.Marshal(pr)
			if err == nil {
				var sr x402.SettleResponse
				if json.Unmarshal(prBytes, &sr) == nil {
					settleResp = &sr
				}
			}
		}
	}

	return &MCPToolCallResult{
		Content:         result.Content,
		IsError:         result.IsError,
		PaymentResponse: settleResp,
		PaymentMade:     paymentMade,
	}
}
