package mcp

import (
	"context"
	"encoding/json"
	"fmt"

	x402 "github.com/coinbase/x402/go"
	"github.com/coinbase/x402/go/types"
)

// ToolHandler is the signature for MCP tool handlers
type ToolHandler func(ctx context.Context, args map[string]interface{}, context MCPToolContext) (MCPToolResult, error)

// CreatePaymentWrapper creates a payment wrapper for MCP tool handlers
// Returns a function that wraps tool handlers with payment logic
func CreatePaymentWrapper(
	resourceServer *x402.X402ResourceServer,
	config PaymentWrapperConfig,
) func(handler ToolHandler) ToolHandler {
	// Validate accepts array
	if len(config.Accepts) == 0 {
		panic("PaymentWrapperConfig.accepts must have at least one payment requirement")
	}

	// Return wrapper function that takes a handler and returns a wrapped handler
	return func(handler ToolHandler) ToolHandler {
		return func(ctx context.Context, args map[string]interface{}, toolContext MCPToolContext) (MCPToolResult, error) {
			// Extract _meta from toolContext
			meta := toolContext.Meta
			if meta == nil {
				meta = make(map[string]interface{})
			}

			// Derive toolName from context or resource URL
			toolName := toolContext.ToolName
			if toolName == "" {
				toolName = "paid_tool"
				if config.Resource != nil && config.Resource.URL != "" {
					// Try to extract from URL
					if len(config.Resource.URL) > len("mcp://tool/") {
						toolName = config.Resource.URL[len("mcp://tool/"):]
					}
				}
			}

			// Extract payment from _meta
			paymentPayload, err := ExtractPaymentFromMeta(map[string]interface{}{
				"_meta": meta,
			})
			if err != nil || paymentPayload == nil {
				return createPaymentRequiredResult(ctx, resourceServer, toolName, config, "Payment required to access this tool")
			}

			// Use first payment requirement
			paymentRequirements := config.Accepts[0]

			// Verify payment
			verifyResult, err := resourceServer.VerifyPayment(ctx, *paymentPayload, paymentRequirements)
			if err != nil {
				return createPaymentRequiredResult(ctx, resourceServer, toolName, config, fmt.Sprintf("Payment verification error: %v", err))
			}

			if !verifyResult.IsValid {
				reason := verifyResult.InvalidReason
				if reason == "" {
					reason = "Payment verification failed"
				}
				return createPaymentRequiredResult(ctx, resourceServer, toolName, config, reason)
			}

			// Build hook context
			hookContext := ServerHookContext{
				ToolName:           toolName,
				Arguments:          args,
				PaymentRequirements: paymentRequirements,
				PaymentPayload:     *paymentPayload,
			}

			// Run onBeforeExecution hook if present
			if config.Hooks != nil && config.Hooks.OnBeforeExecution != nil {
				proceed, err := (*config.Hooks.OnBeforeExecution)(hookContext)
				if err != nil {
					return createPaymentRequiredResult(ctx, resourceServer, toolName, config, err.Error())
				}
				if !proceed {
					return createPaymentRequiredResult(ctx, resourceServer, toolName, config, "Execution blocked by hook")
				}
			}

			// Execute the tool handler
			result, err := handler(ctx, args, toolContext)
			if err != nil {
				return result, err
			}

			// Build after execution context
			afterExecContext := AfterExecutionContext{
				ServerHookContext: hookContext,
				Result:            result,
			}

			// Run onAfterExecution hook if present
			if config.Hooks != nil && config.Hooks.OnAfterExecution != nil {
				if err := (*config.Hooks.OnAfterExecution)(afterExecContext); err != nil {
					// Log but continue
				}
			}

			// If tool returned error, don't settle
			if result.IsError {
				return result, nil
			}

			// Settle payment
			settleResult, err := resourceServer.SettlePayment(ctx, *paymentPayload, paymentRequirements)
			if err != nil {
				return createSettlementFailedResult(ctx, resourceServer, toolName, config, err.Error())
			}

			// Run onAfterSettlement hook if present
			if config.Hooks != nil && config.Hooks.OnAfterSettlement != nil {
				settlementContext := SettlementContext{
					ServerHookContext: hookContext,
					Settlement:        *settleResult,
				}
				if err := (*config.Hooks.OnAfterSettlement)(settlementContext); err != nil {
					// Log but continue
				}
			}

			// Return result with settlement in _meta
			// Store as value (not pointer) to ensure proper serialization
			if result.Meta == nil {
				result.Meta = make(map[string]interface{})
			}
			result.Meta[MCP_PAYMENT_RESPONSE_META_KEY] = *settleResult

			return result, nil
		}
	}
}

// createPaymentRequiredResult creates a 402 payment required result
func createPaymentRequiredResult(
	ctx context.Context,
	resourceServer *x402.X402ResourceServer,
	toolName string,
	config PaymentWrapperConfig,
	errorMessage string,
) (MCPToolResult, error) {
	var resourceInfo *types.ResourceInfo
	if config.Resource != nil {
		resourceInfo = &types.ResourceInfo{
			URL:         CreateToolResourceUrl(toolName, config.Resource.URL),
			Description: config.Resource.Description,
			MimeType:    config.Resource.MimeType,
		}
	} else {
		resourceInfo = &types.ResourceInfo{
			URL: CreateToolResourceUrl(toolName, ""),
		}
	}

	paymentRequired := resourceServer.CreatePaymentRequiredResponse(
		config.Accepts,
		resourceInfo,
		errorMessage,
		nil, // extensions
	)

	// Convert to map for structuredContent
	paymentRequiredBytes, err := json.Marshal(paymentRequired)
	if err != nil {
		return MCPToolResult{}, fmt.Errorf("failed to marshal payment required: %w", err)
	}

	var structuredContent map[string]interface{}
	if err := json.Unmarshal(paymentRequiredBytes, &structuredContent); err != nil {
		return MCPToolResult{}, fmt.Errorf("failed to unmarshal structured content: %w", err)
	}

	// Create content text
	contentText := string(paymentRequiredBytes)

	return MCPToolResult{
		StructuredContent: structuredContent,
		Content: []MCPContentItem{
			{Type: "text", Text: contentText},
		},
		IsError: true,
	}, nil
}

// createSettlementFailedResult creates a 402 settlement failed result
func createSettlementFailedResult(
	ctx context.Context,
	resourceServer *x402.X402ResourceServer,
	toolName string,
	config PaymentWrapperConfig,
	errorMessage string,
) (MCPToolResult, error) {
	var resourceInfo *types.ResourceInfo
	if config.Resource != nil {
		resourceInfo = &types.ResourceInfo{
			URL:         CreateToolResourceUrl(toolName, config.Resource.URL),
			Description: config.Resource.Description,
			MimeType:    config.Resource.MimeType,
		}
	} else {
		resourceInfo = &types.ResourceInfo{
			URL: CreateToolResourceUrl(toolName, ""),
		}
	}

	paymentRequired := resourceServer.CreatePaymentRequiredResponse(
		config.Accepts,
		resourceInfo,
		fmt.Sprintf("Payment settlement failed: %s", errorMessage),
		nil, // extensions
	)

	settlementFailure := map[string]interface{}{
		"success":     false,
		"errorReason": errorMessage,
		"transaction": "",
		"network":      config.Accepts[0].Network,
	}

	// Merge paymentRequired with settlement failure
	paymentRequiredBytes, err := json.Marshal(paymentRequired)
	if err != nil {
		return MCPToolResult{}, fmt.Errorf("failed to marshal payment required: %w", err)
	}

	var errorData map[string]interface{}
	if err := json.Unmarshal(paymentRequiredBytes, &errorData); err != nil {
		return MCPToolResult{}, fmt.Errorf("failed to unmarshal error data: %w", err)
	}

	errorData[MCP_PAYMENT_RESPONSE_META_KEY] = settlementFailure

	contentTextBytes, err := json.Marshal(errorData)
	if err != nil {
		return MCPToolResult{}, fmt.Errorf("failed to marshal error data: %w", err)
	}

	return MCPToolResult{
		StructuredContent: errorData,
		Content: []MCPContentItem{
			{Type: "text", Text: string(contentTextBytes)},
		},
		IsError: true,
	}, nil
}
