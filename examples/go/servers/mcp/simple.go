package main

// MCP Server with x402 Paid Tools - Simple Example
//
// This example demonstrates creating an MCP server with payment-wrapped tools
// using the MCP SDK (github.com/modelcontextprotocol/go-sdk/mcp).
// Uses the CreatePaymentWrapper function to add x402 payment to individual tools.
//
// The getWeatherData helper is defined in helpers.go and shared across examples.
//
// Run with: go run . simple

import (
	"context"
	"encoding/json"
	"fmt"
	"net/http"
	"os"

	x402 "github.com/coinbase/x402/go"
	x402http "github.com/coinbase/x402/go/http"
	evm "github.com/coinbase/x402/go/mechanisms/evm/exact/server"
	"github.com/coinbase/x402/go/mcp"
	"github.com/joho/godotenv"
	mcpsdk "github.com/modelcontextprotocol/go-sdk/mcp"
)

func runSimple() error {
	fmt.Println("\n📦 Using Payment Wrapper API with REAL MCP SDK\n")

	// Load environment variables
	if err := godotenv.Load(); err != nil {
		fmt.Println("No .env file found, using environment variables")
	}

	evmAddress := os.Getenv("EVM_ADDRESS")
	if evmAddress == "" {
		return fmt.Errorf("EVM_ADDRESS environment variable is required")
	}

	facilitatorURL := os.Getenv("FACILITATOR_URL")
	if facilitatorURL == "" {
		return fmt.Errorf("FACILITATOR_URL environment variable is required")
	}

	port := os.Getenv("PORT")
	if port == "" {
		port = "4022"
	}

	// ========================================================================
	// STEP 1: Create REAL MCP server
	// ========================================================================
	mcpServer := mcpsdk.NewServer(&mcpsdk.Implementation{
		Name:    "x402 MCP Server",
		Version: "1.0.0",
	}, nil)

	// ========================================================================
	// STEP 2: Set up x402 resource server for payment handling
	// ========================================================================
	ctx := context.Background()
	facilitatorClient := x402http.NewHTTPFacilitatorClient(&x402http.FacilitatorConfig{
		URL: facilitatorURL,
	})

	resourceServer := x402.Newx402ResourceServer(
		x402.WithFacilitatorClient(facilitatorClient),
	)
	resourceServer.Register("eip155:84532", evm.NewExactEvmScheme())

	if err := resourceServer.Initialize(ctx); err != nil {
		return fmt.Errorf("failed to initialize resource server: %w", err)
	}

	// ========================================================================
	// STEP 3: Build payment requirements
	// ========================================================================
	config := x402.ResourceConfig{
		Scheme:  "exact",
		Network: "eip155:84532",
		PayTo:   evmAddress,
		Price:   "$0.001",
	}

	accepts, err := resourceServer.BuildPaymentRequirementsFromConfig(ctx, config)
	if err != nil {
		return fmt.Errorf("failed to build payment requirements: %w", err)
	}

	// ========================================================================
	// STEP 4: Create payment wrapper with accepts array
	// ========================================================================
	paidWeather := mcp.CreatePaymentWrapper(resourceServer, mcp.PaymentWrapperConfig{
		Accepts: accepts,
		Resource: &mcp.ResourceInfo{
			URL:         "mcp://tool/get_weather",
			Description: "Get weather for a city",
			MimeType:    "application/json",
		},
	})

	// ========================================================================
	// STEP 5: Register tools using REAL MCP SDK with payment wrapper
	// ========================================================================

	// Free tool - register directly
	mcpServer.AddTool(&mcpsdk.Tool{
		Name:        "ping",
		Description: "A free health check tool",
		InputSchema: map[string]interface{}{"type": "object"},
	}, func(ctx context.Context, req *mcpsdk.CallToolRequest) (*mcpsdk.CallToolResult, error) {
		return &mcpsdk.CallToolResult{
			Content: []mcpsdk.Content{
				&mcpsdk.TextContent{Text: "pong"},
			},
		}, nil
	})

	// Paid tool - wrap handler with payment
	mcpServer.AddTool(&mcpsdk.Tool{
		Name:        "get_weather",
		Description: "Get current weather for a city. Requires payment of $0.001.",
		InputSchema: map[string]interface{}{
			"type": "object",
			"properties": map[string]interface{}{
				"city": map[string]interface{}{"type": "string", "description": "The city name"},
			},
		},
	}, func(ctx context.Context, req *mcpsdk.CallToolRequest) (*mcpsdk.CallToolResult, error) {
		args := make(map[string]interface{})
		if req.Params.Arguments != nil {
			if err := json.Unmarshal(req.Params.Arguments, &args); err != nil {
				args = make(map[string]interface{})
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

		// Call paid handler
		result, err := paidWeather(func(ctx context.Context, args map[string]interface{}, toolContext mcp.MCPToolContext) (mcp.MCPToolResult, error) {
			city, _ := args["city"].(string)
			if city == "" {
				city = "San Francisco"
			}

			weatherData := getWeatherData(city)
			weatherJSON, _ := json.MarshalIndent(weatherData, "", "  ")

			return mcp.MCPToolResult{
				Content: []mcp.MCPContentItem{
					{Type: "text", Text: string(weatherJSON)},
				},
				IsError: false,
			}, nil
		})(ctx, args, toolContext)

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

		if result.Meta != nil {
			callResult.Meta = mcpsdk.Meta(result.Meta)
		}

		return callResult, nil
	})

	// Start HTTP server with SSE transport
	return startHTTPServer(mcpServer, port)
}

func startHTTPServer(mcpServer *mcpsdk.Server, port string) error {
	sseHandler := mcpsdk.NewSSEHandler(func(req *http.Request) *mcpsdk.Server {
		return mcpServer
	}, nil)

	mux := http.NewServeMux()
	mux.Handle("/sse", sseHandler)
	mux.Handle("/messages", sseHandler)

	mux.HandleFunc("/health", func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(http.StatusOK)
		json.NewEncoder(w).Encode(map[string]interface{}{
			"status": "ok",
			"server": "x402 MCP Server",
		})
	})

	fmt.Printf("🚀 x402 MCP Server running on http://localhost:%s\n", port)
	fmt.Println("\n📋 Available tools:")
	fmt.Println("   - get_weather (paid: $0.001)")
	fmt.Println("   - ping (free)")
	fmt.Printf("\n🔗 Connect via SSE: http://localhost:%s/sse\n", port)
	fmt.Println("\n💡 This example uses CreatePaymentWrapper() with REAL MCP SDK.\n")

	server := &http.Server{
		Addr:    ":" + port,
		Handler: mux,
	}

	return server.ListenAndServe()
}
