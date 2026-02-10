package main

import (
	"context"
	"encoding/json"
	"fmt"
	"os"

	x402 "github.com/coinbase/x402/go"
	mcp402 "github.com/coinbase/x402/go/mcp"
	evm "github.com/coinbase/x402/go/mechanisms/evm/exact/client"
	evmsigners "github.com/coinbase/x402/go/signers/evm"
	"github.com/modelcontextprotocol/go-sdk/mcp"
)

// Result structure for e2e test output
type Result struct {
	Success         bool        `json:"success"`
	Data            interface{} `json:"data,omitempty"`
	StatusCode      int         `json:"status_code,omitempty"`
	PaymentResponse interface{} `json:"payment_response,omitempty"`
	Error           string      `json:"error,omitempty"`
}

func main() {
	serverURL := os.Getenv("RESOURCE_SERVER_URL")
	if serverURL == "" {
		outputError("RESOURCE_SERVER_URL is required")
		return
	}

	endpointPath := os.Getenv("ENDPOINT_PATH") // tool name, e.g. "get_weather"
	if endpointPath == "" {
		outputError("ENDPOINT_PATH is required")
		return
	}

	evmPrivateKey := os.Getenv("EVM_PRIVATE_KEY")
	if evmPrivateKey == "" {
		outputError("EVM_PRIVATE_KEY is required")
		return
	}

	// Create EVM signer for payment
	evmSigner, err := evmsigners.NewClientSignerFromPrivateKey(evmPrivateKey)
	if err != nil {
		outputError(fmt.Sprintf("Failed to create EVM signer: %v", err))
		return
	}

	// Create x402 client
	x402Client := x402.Newx402Client().
		Register("eip155:*", evm.NewExactEvmScheme(evmSigner))

	// Connect to MCP server via SSE using the official SDK
	ctx := context.Background()
	sseURL := serverURL + "/sse"

	mcpClient := mcp.NewClient(
		&mcp.Implementation{
			Name:    "x402-mcp-e2e-client",
			Version: "1.0.0",
		},
		nil,
	)

	session, err := mcpClient.Connect(ctx, &mcp.SSEClientTransport{
		Endpoint: sseURL,
	}, nil)
	if err != nil {
		outputError(fmt.Sprintf("Failed to connect to MCP server: %v", err))
		return
	}
	defer session.Close()

	// Call paid tool using the x402 MCP SDK helper
	// This automatically handles: first call -> detect 402 -> create payment -> retry
	result, err := mcp402.CallPaidTool(ctx, session, x402Client, endpointPath, map[string]any{
		"city": "San Francisco",
	})
	if err != nil {
		outputError(fmt.Sprintf("CallPaidTool failed: %v", err))
		return
	}

	// Extract data from content
	var data interface{}
	for _, content := range result.Content {
		if textContent, ok := content.(*mcp.TextContent); ok {
			var parsed interface{}
			if err := json.Unmarshal([]byte(textContent.Text), &parsed); err == nil {
				data = parsed
			} else {
				data = map[string]interface{}{"text": textContent.Text}
			}
			break
		}
	}

	// Build payment response
	var paymentResponse interface{}
	if result.PaymentResponse != nil {
		paymentResponse = result.PaymentResponse
	}

	output := Result{
		Success:         !result.IsError,
		Data:            data,
		StatusCode:      200,
		PaymentResponse: paymentResponse,
	}

	outputResult(output)
}

func outputResult(result Result) {
	data, err := json.Marshal(result)
	if err != nil {
		fmt.Printf(`{"success":false,"error":"Failed to marshal result: %v"}`, err)
		os.Exit(1)
	}
	fmt.Println(string(data))
	if !result.Success {
		os.Exit(1)
	}
	os.Exit(0)
}

func outputError(errorMsg string) {
	result := Result{
		Success: false,
		Error:   errorMsg,
	}
	data, _ := json.Marshal(result)
	fmt.Println(string(data))
	os.Exit(1)
}
