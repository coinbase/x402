package main

import (
	"context"
	"encoding/json"
	"fmt"
	"math/rand"
	"net/http"
	"os"

	x402 "github.com/coinbase/x402/go"
	x402http "github.com/coinbase/x402/go/http"
	evm "github.com/coinbase/x402/go/mechanisms/evm/exact/server"
	"github.com/coinbase/x402/go/mcp"
	"github.com/joho/godotenv"
	mcpsdk "github.com/modelcontextprotocol/go-sdk/mcp"
)

/**
 * MCP Server with x402 Paid Tools - Advanced Example with Hooks
 *
 * This example demonstrates using CreatePaymentWrapper with hooks for:
 * - Logging and observability
 * - Rate limiting and access control
 * - Custom settlement handling
 * - Production monitoring
 *
 * Run with: go run . advanced
 */

// getWeatherData simulates fetching weather data for a city
func getWeatherData(city string) map[string]interface{} {
	conditions := []string{"sunny", "cloudy", "rainy", "snowy", "windy"}
	weather := conditions[rand.Intn(len(conditions))]
	temperature := rand.Intn(40) + 40
	return map[string]interface{}{
		"city":        city,
		"weather":     weather,
		"temperature": temperature,
	}
}

/**
 * Main entry point - demonstrates hooks with payment wrapper.
 */
func runAdvanced() error {
	fmt.Println("\n📦 Using Payment Wrapper with Hooks\n")

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
		Name:    "x402 MCP Server (Advanced)",
		Version: "1.0.0",
	}, nil)

	// ========================================================================
	// STEP 2: Set up x402 resource server
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
	// STEP 3: Build payment requirements for different tools
	// ========================================================================
	weatherConfig := x402.ResourceConfig{
		Scheme:  "exact",
		Network: "eip155:84532",
		PayTo:   evmAddress,
		Price:   "$0.001",
		Extra: map[string]interface{}{
			"name":    "USDC",
			"version": "2",
		},
	}

	weatherAccepts, err := resourceServer.BuildPaymentRequirementsFromConfig(ctx, weatherConfig)
	if err != nil {
		return fmt.Errorf("failed to build weather payment requirements: %w", err)
	}

	forecastConfig := x402.ResourceConfig{
		Scheme:  "exact",
		Network: "eip155:84532",
		PayTo:   evmAddress,
		Price:   "$0.005",
		Extra: map[string]interface{}{
			"name":    "USDC",
			"version": "2",
		},
	}

	forecastAccepts, err := resourceServer.BuildPaymentRequirementsFromConfig(ctx, forecastConfig)
	if err != nil {
		return fmt.Errorf("failed to build forecast payment requirements: %w", err)
	}

	// ========================================================================
	// STEP 4: Create payment wrappers with hooks for production features
	// ========================================================================

	// Shared hooks for all paid tools
	beforeHook := mcp.BeforeExecutionHook(func(context mcp.ServerHookContext) (bool, error) {
		fmt.Printf("\n🔧 [Hook] Before execution: %s\n", context.ToolName)
		if context.PaymentPayload.Payload != nil {
			if auth, ok := context.PaymentPayload.Payload["authorization"].(map[string]interface{}); ok {
				if from, ok := auth["from"].(string); ok {
					fmt.Printf("   Payment from: %s\n", from)
				}
			}
		}
		fmt.Printf("   Amount: %s\n", context.PaymentRequirements.Amount)

		// Example: Rate limiting (return false to abort)
		// if isRateLimited(context.PaymentPayload.Payer) {
		//     fmt.Println("   ⛔ Rate limit exceeded")
		//     return false, nil
		// }

		return true, nil // Continue execution
	})

	afterHook := mcp.AfterExecutionHook(func(context mcp.AfterExecutionContext) error {
		fmt.Printf("✅ [Hook] After execution: %s\n", context.ToolName)
		fmt.Printf("   Result error: %v\n", context.Result.IsError)

		// Example: Log to analytics
		// analytics.trackToolExecution(context.ToolName, context.Result)

		return nil
	})

	settlementHook := mcp.AfterSettlementHook(func(context mcp.SettlementContext) error {
		fmt.Printf("💸 [Hook] Settlement complete: %s\n", context.ToolName)
		if context.Settlement.Transaction != "" {
			fmt.Printf("   Transaction: %s\n", context.Settlement.Transaction)
		}
		fmt.Printf("   Success: %v\n\n", context.Settlement.Success)

		// Example: Send receipt to user
		// sendReceipt(context.PaymentPayload.Payer, context.Settlement)

		return nil
	})

	sharedHooks := &mcp.PaymentWrapperHooks{
		OnBeforeExecution: &beforeHook,
		OnAfterExecution:  &afterHook,
		OnAfterSettlement: &settlementHook,
	}

	paidWeather := mcp.CreatePaymentWrapper(resourceServer, mcp.PaymentWrapperConfig{
		Accepts: weatherAccepts,
		Resource: &mcp.ResourceInfo{
			URL:         "mcp://tool/get_weather",
			Description: "Get weather for a city",
			MimeType:    "application/json",
		},
		Hooks: sharedHooks,
	})

	paidForecast := mcp.CreatePaymentWrapper(resourceServer, mcp.PaymentWrapperConfig{
		Accepts: forecastAccepts,
		Resource: &mcp.ResourceInfo{
			URL:         "mcp://tool/get_forecast",
			Description: "Get 7-day forecast",
			MimeType:    "application/json",
		},
		Hooks: sharedHooks,
	})

	// ========================================================================
	// STEP 5: Register tools using REAL MCP SDK - each wrapper has its own price and hooks
	// ========================================================================

	// Free tool - register directly
	mcpServer.AddTool(&mcpsdk.Tool{
		Name:        "ping",
		Description: "A free health check tool",
	}, func(ctx context.Context, req *mcpsdk.CallToolRequest, _ any) (*mcpsdk.CallToolResult, any, error) {
		return &mcpsdk.CallToolResult{
			Content: []mcpsdk.Content{
				&mcpsdk.TextContent{Text: "pong"},
			},
		}, nil, nil
	})

	// Weather tool - $0.001 with hooks
	mcpServer.AddTool(&mcpsdk.Tool{
		Name:        "get_weather",
		Description: "Get current weather for a city. Requires payment of $0.001.",
	}, func(ctx context.Context, req *mcpsdk.CallToolRequest, _ any) (*mcpsdk.CallToolResult, any, error) {
		args := make(map[string]interface{})
		if req.Params.Arguments != nil {
			if argsMap, ok := req.Params.Arguments.(map[string]interface{}); ok {
				args = argsMap
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

		city, _ := args["city"].(string)
		if city == "" {
			city = "San Francisco"
		}

		// Call paid handler
		result, err := paidWeather(func(ctx context.Context, args map[string]interface{}, toolContext mcp.MCPToolContext) (mcp.MCPToolResult, error) {
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
			}, nil, nil
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

		return callResult, nil, nil
	})

	// Forecast tool - $0.005 with hooks
	mcpServer.AddTool(&mcpsdk.Tool{
		Name:        "get_forecast",
		Description: "Get 7-day weather forecast. Requires payment of $0.005.",
	}, func(ctx context.Context, req *mcpsdk.CallToolRequest, _ any) (*mcpsdk.CallToolResult, any, error) {
		args := make(map[string]interface{})
		if req.Params.Arguments != nil {
			if argsMap, ok := req.Params.Arguments.(map[string]interface{}); ok {
				args = argsMap
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

		city, _ := args["city"].(string)
		if city == "" {
			city = "San Francisco"
		}

		// Call paid handler
		result, err := paidForecast(func(ctx context.Context, args map[string]interface{}, toolContext mcp.MCPToolContext) (mcp.MCPToolResult, error) {
			forecast := make([]map[string]interface{}, 7)
			for i := 0; i < 7; i++ {
				dayData := getWeatherData(city)
				dayData["day"] = i + 1
				forecast[i] = dayData
			}

			forecastJSON, _ := json.MarshalIndent(forecast, "", "  ")

			return mcp.MCPToolResult{
				Content: []mcp.MCPContentItem{
					{Type: "text", Text: string(forecastJSON)},
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
			}, nil, nil
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

		return callResult, nil, nil
	})

	// Start HTTP server with SSE transport
	return startHTTPServerAdvanced(mcpServer, port)
}

/**
 * Helper to start HTTP server with REAL MCP SDK SSE transport
 */
func startHTTPServerAdvanced(mcpServer *mcpsdk.Server, port string) error {
	// Use SSEHandler to manage SSE connections
	sseHandler := mcpsdk.NewSSEHandler(func(req *http.Request) *mcpsdk.Server {
		return mcpServer
	}, &mcpsdk.SSEOptions{
		Endpoint: "/messages",
	})

	// Create HTTP mux
	mux := http.NewServeMux()
	mux.Handle("/sse", sseHandler)
	mux.Handle("/messages", sseHandler)

	// Health check
	mux.HandleFunc("/health", func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(http.StatusOK)
		json.NewEncoder(w).Encode(map[string]interface{}{
			"status": "ok",
			"mode":   "advanced-with-hooks",
			"server": "x402 MCP Server (Advanced)",
		})
	})

	fmt.Printf("🚀 x402 MCP Server (Advanced) running on http://localhost:%s\n", port)
	fmt.Println("\n📋 Available tools:")
	fmt.Println("   - get_weather (paid: $0.001) [with hooks]")
	fmt.Println("   - get_forecast (paid: $0.005) [with hooks]")
	fmt.Println("   - ping (free)")
	fmt.Printf("\n🔗 Connect via SSE: http://localhost:%s/sse\n", port)
	fmt.Println("\n📊 Hooks enabled:")
	fmt.Println("   - OnBeforeExecution: Rate limiting, validation")
	fmt.Println("   - OnAfterExecution: Logging, metrics")
	fmt.Println("   - OnAfterSettlement: Receipts, notifications")
	fmt.Println("\n💡 This example uses CreatePaymentWrapper() with hooks and REAL MCP SDK.\n")

	server := &http.Server{
		Addr:    ":" + port,
		Handler: mux,
	}

	return server.ListenAndServe()
}
