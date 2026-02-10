package mcp

import (
	"context"
	"encoding/json"
	"fmt"

	x402 "github.com/coinbase/x402/go"
	"github.com/coinbase/x402/go/types"
	"github.com/modelcontextprotocol/go-sdk/mcp"
)

// MCPCaller is the interface for making MCP tool calls.
// This is satisfied by the official MCP SDK's *mcp.ClientSession.
type MCPCaller interface {
	CallTool(ctx context.Context, params *mcp.CallToolParams) (*mcp.CallToolResult, error)
}

// ToolCallResult is the result of a paid MCP tool call.
type ToolCallResult struct {
	// Content is the list of content items from the tool response.
	Content []mcp.Content

	// IsError indicates whether the tool returned an error.
	IsError bool

	// PaymentResponse is the settlement response if payment was made.
	PaymentResponse *x402.SettleResponse

	// PaymentMade indicates whether a payment was made during this call.
	PaymentMade bool

	// RawResult is the original MCP CallToolResult.
	RawResult *mcp.CallToolResult
}

// CallPaidTool makes an MCP tool call with automatic x402 payment handling.
//
// Flow:
//  1. Calls the tool without payment
//  2. If the server returns a payment required error, creates a payment
//  3. Retries with payment attached in _meta
//  4. Returns the result with payment response extracted
//
// Example:
//
//	result, err := mcp402.CallPaidTool(ctx, session, x402Client, "get_weather", map[string]any{"city": "SF"})
//	if err != nil {
//	    log.Fatal(err)
//	}
//	fmt.Println(result.PaymentResponse.Transaction)
func CallPaidTool(
	ctx context.Context,
	mcpClient MCPCaller,
	x402Client *x402.X402Client,
	name string,
	args map[string]any,
) (*ToolCallResult, error) {
	// First call without payment
	params := &mcp.CallToolParams{
		Name:      name,
		Arguments: args,
	}

	result, err := mcpClient.CallTool(ctx, params)
	if err != nil {
		return nil, fmt.Errorf("tool call failed: %w", err)
	}

	// If no error, return directly
	if !result.IsError {
		return buildResult(result, false), nil
	}

	// Try to extract payment required from error content
	paymentRequired := extractPaymentRequired(result)
	if paymentRequired == nil {
		return buildResult(result, false), nil
	}

	if len(paymentRequired.Accepts) == 0 {
		return buildResult(result, false), nil
	}

	// Create payment payload using the first requirement
	paymentPayload, err := x402Client.CreatePaymentPayload(
		ctx,
		paymentRequired.Accepts[0],
		paymentRequired.Resource,
		paymentRequired.Extensions,
	)
	if err != nil {
		return nil, fmt.Errorf("failed to create payment: %w", err)
	}

	// Retry with payment in _meta
	params.Meta = mcp.Meta{
		PaymentMetaKey: paymentPayload,
	}

	result, err = mcpClient.CallTool(ctx, params)
	if err != nil {
		return nil, fmt.Errorf("paid tool call failed: %w", err)
	}

	return buildResult(result, true), nil
}

// buildResult converts an MCP CallToolResult into a ToolCallResult.
func buildResult(result *mcp.CallToolResult, paymentMade bool) *ToolCallResult {
	var paymentResponse *x402.SettleResponse
	if result.Meta != nil {
		if pr, ok := result.Meta[PaymentResponseMetaKey]; ok {
			// Marshal and unmarshal to convert to SettleResponse
			prBytes, err := json.Marshal(pr)
			if err == nil {
				var sr x402.SettleResponse
				if json.Unmarshal(prBytes, &sr) == nil {
					paymentResponse = &sr
				}
			}
		}
	}

	return &ToolCallResult{
		Content:         result.Content,
		IsError:         result.IsError,
		PaymentResponse: paymentResponse,
		PaymentMade:     paymentMade,
		RawResult:       result,
	}
}

// extractPaymentRequired extracts PaymentRequired from an error result.
// Prefers structuredContent (per spec), falls back to parsing content[0].text.
func extractPaymentRequired(result *mcp.CallToolResult) *types.PaymentRequired {
	// Preferred path: check structuredContent first (per MCP x402 spec)
	if result.StructuredContent != nil {
		if sc, ok := result.StructuredContent.(map[string]any); ok {
			if _, hasAccepts := sc["accepts"]; hasAccepts {
				if version, hasVersion := sc["x402Version"]; hasVersion {
					// Validate x402Version is present and numeric
					switch v := version.(type) {
					case float64:
						if v >= 1 {
							return unmarshalPaymentRequired(sc)
						}
					case int:
						if v >= 1 {
							return unmarshalPaymentRequired(sc)
						}
					}
				}
			}
		}
	}

	// Fallback: parse content[].text as JSON
	for _, content := range result.Content {
		textContent, ok := content.(*mcp.TextContent)
		if !ok {
			continue
		}

		pr := tryParsePaymentRequired(textContent.Text)
		if pr != nil {
			return pr
		}
	}
	return nil
}

// tryParsePaymentRequired attempts to parse text as a PaymentRequired response.
// Validates that x402Version and accepts are present.
func tryParsePaymentRequired(text string) *types.PaymentRequired {
	var parsed map[string]interface{}
	if err := json.Unmarshal([]byte(text), &parsed); err != nil {
		return nil
	}

	// Require both "accepts" and "x402Version"
	if _, hasAccepts := parsed["accepts"]; !hasAccepts {
		return nil
	}
	if _, hasVersion := parsed["x402Version"]; !hasVersion {
		return nil
	}

	var pr types.PaymentRequired
	if err := json.Unmarshal([]byte(text), &pr); err != nil {
		return nil
	}
	return &pr
}

// unmarshalPaymentRequired converts a map to PaymentRequired via JSON roundtrip.
func unmarshalPaymentRequired(data map[string]any) *types.PaymentRequired {
	bytes, err := json.Marshal(data)
	if err != nil {
		return nil
	}
	var pr types.PaymentRequired
	if err := json.Unmarshal(bytes, &pr); err != nil {
		return nil
	}
	return &pr
}
