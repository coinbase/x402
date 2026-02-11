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

// CreatePaymentWrapper creates a payment wrapper for MCP tool handlers.
// Returns a function that wraps tool handlers with payment logic, or an error
// if the configuration is invalid.
func CreatePaymentWrapper(
	resourceServer *x402.X402ResourceServer,
	config PaymentWrapperConfig,
) (func(handler ToolHandler) ToolHandler, error) {
	// Validate accepts array
	if len(config.Accepts) == 0 {
		return nil, fmt.Errorf("PaymentWrapperConfig.Accepts must have at least one payment requirement")
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

			// Match the client's chosen payment method against config.Accepts
			matchedRequirements := resourceServer.FindMatchingRequirements(config.Accepts, *paymentPayload)
			if matchedRequirements == nil {
				return createPaymentRequiredResult(ctx, resourceServer, toolName, config, "No matching payment requirements found")
			}
			paymentRequirements := *matchedRequirements

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
				ToolName:            toolName,
				Arguments:           args,
				PaymentRequirements: paymentRequirements,
				PaymentPayload:      *paymentPayload,
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

			// Run onAfterExecution hook if present (errors are non-fatal)
			if config.Hooks != nil && config.Hooks.OnAfterExecution != nil {
				_ = (*config.Hooks.OnAfterExecution)(afterExecContext)
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
				_ = (*config.Hooks.OnAfterSettlement)(settlementContext)
			}

			// Return result with settlement in _meta
			result = AttachPaymentResponseToMeta(result, *settleResult)

			return result, nil
		}
	}, nil
}

// buildResourceInfo creates a ResourceInfo from the config and tool name.
// Shared helper used by both payment required and settlement failed results.
func buildResourceInfo(toolName string, config PaymentWrapperConfig) *types.ResourceInfo {
	if config.Resource != nil {
		return &types.ResourceInfo{
			URL:         CreateToolResourceUrl(toolName, config.Resource.URL),
			Description: config.Resource.Description,
			MimeType:    config.Resource.MimeType,
		}
	}
	return &types.ResourceInfo{
		URL: CreateToolResourceUrl(toolName, ""),
	}
}

// buildErrorResult builds the common error result structure from a PaymentRequired response.
// If extraData is non-nil, its entries are merged into the structuredContent.
func buildErrorResult(
	resourceServer *x402.X402ResourceServer,
	config PaymentWrapperConfig,
	resourceInfo *types.ResourceInfo,
	errorMessage string,
	extraData map[string]interface{},
) (MCPToolResult, error) {
	paymentRequired := resourceServer.CreatePaymentRequiredResponse(
		config.Accepts,
		resourceInfo,
		errorMessage,
		nil, // extensions
	)

	paymentRequiredBytes, err := json.Marshal(paymentRequired)
	if err != nil {
		return MCPToolResult{}, fmt.Errorf("failed to marshal payment required: %w", err)
	}

	var structuredContent map[string]interface{}
	if err := json.Unmarshal(paymentRequiredBytes, &structuredContent); err != nil {
		return MCPToolResult{}, fmt.Errorf("failed to unmarshal structured content: %w", err)
	}

	// Merge any extra data (e.g. settlement failure info) into structuredContent
	for k, v := range extraData {
		structuredContent[k] = v
	}

	contentTextBytes, err := json.Marshal(structuredContent)
	if err != nil {
		return MCPToolResult{}, fmt.Errorf("failed to marshal content text: %w", err)
	}

	return MCPToolResult{
		StructuredContent: structuredContent,
		Content: []MCPContentItem{
			{Type: "text", Text: string(contentTextBytes)},
		},
		IsError: true,
	}, nil
}

// createPaymentRequiredResult creates a 402 payment required result
func createPaymentRequiredResult(
	_ context.Context,
	resourceServer *x402.X402ResourceServer,
	toolName string,
	config PaymentWrapperConfig,
	errorMessage string,
) (MCPToolResult, error) {
	return buildErrorResult(
		resourceServer, config,
		buildResourceInfo(toolName, config),
		errorMessage, nil,
	)
}

// createSettlementFailedResult creates a 402 settlement failed result
func createSettlementFailedResult(
	_ context.Context,
	resourceServer *x402.X402ResourceServer,
	toolName string,
	config PaymentWrapperConfig,
	errorMessage string,
) (MCPToolResult, error) {
	return buildErrorResult(
		resourceServer, config,
		buildResourceInfo(toolName, config),
		fmt.Sprintf("Payment settlement failed: %s", errorMessage),
		map[string]interface{}{
			MCP_PAYMENT_RESPONSE_META_KEY: map[string]interface{}{
				"success":     false,
				"errorReason": errorMessage,
				"transaction": "",
				"network":     config.Accepts[0].Network,
			},
		},
	)
}
