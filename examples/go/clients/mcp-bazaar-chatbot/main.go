package main

/**
 * Anthropic Claude Chatbot with MCP Tools + x402 Payments
 *
 * A complete chatbot implementation showing how to integrate:
 * - Anthropic Claude (the LLM)
 * - MCP Client (tool discovery and execution)
 * - x402 Payment Protocol (automatic payment for paid tools)
 *
 * Connects to the CDP MCP Bazaar via Streamable HTTP with JWT authentication.
 * Run with: go run .
 */

import (
	"bufio"
	"context"
	"encoding/json"
	"fmt"
	"net/http"
	"os"
	"path/filepath"
	"runtime"
	"strings"

	"github.com/anthropics/anthropic-sdk-go"
	"github.com/anthropics/anthropic-sdk-go/option"
	"github.com/anthropics/anthropic-sdk-go/shared/constant"
	"github.com/coinbase/cdp-sdk/go/auth"
	x402 "github.com/coinbase/x402/go"
	evm "github.com/coinbase/x402/go/mechanisms/evm/exact/client"
	"github.com/coinbase/x402/go/mcp"
	evmsigners "github.com/coinbase/x402/go/signers/evm"
	"github.com/joho/godotenv"
	mcpsdk "github.com/modelcontextprotocol/go-sdk/mcp"
)

const (
	serverURL    = "https://api.cdp.coinbase.com/platform/v2/x402/discovery/mcp"
	serverHost   = "api.cdp.coinbase.com"
	serverPath   = "/platform/v2/x402/discovery/mcp"
	modelName    = "claude-3-haiku-20240307"
	maxTokens    = 1024
)

// authRoundTripper adds JWT Authorization header to requests.
type authRoundTripper struct {
	jwt      string
	baseTrip http.RoundTripper
}

func (a *authRoundTripper) RoundTrip(req *http.Request) (*http.Response, error) {
	req2 := req.Clone(req.Context())
	req2.Header.Set("Authorization", "Bearer "+a.jwt)
	return a.baseTrip.RoundTrip(req2)
}

func main() {
	if err := run(); err != nil {
		fmt.Printf("\nFatal error: %v\n", err)
		os.Exit(1)
	}
}

func run() error {
	// Load .env: try source directory first (reliable with "go run"), then cwd
	loadEnv := func(path string) bool {
		err := godotenv.Load(path)
		return err == nil
	}
	var loaded bool
	if _, file, _, ok := runtime.Caller(0); ok {
		dir := filepath.Dir(file)
		loaded = loadEnv(filepath.Join(dir, ".env")) || loadEnv(filepath.Join(dir, ".env-local"))
	}
	if !loaded {
		loaded = loadEnv(".env") || loadEnv(".env-local")
	}
	if !loaded {
		fmt.Println("No .env file found, using environment variables")
	}

	anthropicKey := os.Getenv("ANTHROPIC_API_KEY")
	if anthropicKey == "" {
		return fmt.Errorf("ANTHROPIC_API_KEY environment variable is required")
	}

	evmPrivateKey := os.Getenv("EVM_PRIVATE_KEY")
	if evmPrivateKey == "" {
		return fmt.Errorf("EVM_PRIVATE_KEY environment variable is required")
	}

	cdpKeyID := os.Getenv("CDP_API_KEY_ID")
	cdpKeySecret := os.Getenv("CDP_API_KEY_SECRET")
	if cdpKeyID == "" || cdpKeySecret == "" {
		return fmt.Errorf("CDP_API_KEY_ID and CDP_API_KEY_SECRET are required for CDP Bazaar")
	}

	// Generate JWT for CDP Bazaar
	jwt, err := auth.GenerateJWT(auth.JwtOptions{
		KeyID:         cdpKeyID,
		KeySecret:     cdpKeySecret,
		RequestMethod: "POST",
		RequestHost:   serverHost,
		RequestPath:   serverPath,
	})
	if err != nil {
		return fmt.Errorf("failed to generate JWT: %w", err)
	}

	// Initialize Anthropic client
	anthropicClient := anthropic.NewClient(option.WithAPIKey(anthropicKey))
	fmt.Println("Anthropic Claude client initialized")

	// Initialize x402 signer
	evmSigner, err := evmsigners.NewClientSignerFromPrivateKey(evmPrivateKey)
	if err != nil {
		return fmt.Errorf("failed to create EVM signer: %w", err)
	}
	fmt.Printf("Wallet address: %s\n", evmSigner.Address())

	// Streamable HTTP transport with JWT
	httpClient := &http.Client{
		Transport: &authRoundTripper{jwt: jwt, baseTrip: http.DefaultTransport},
	}
	transport := &mcpsdk.StreamableClientTransport{
		Endpoint:   serverURL,
		HTTPClient: httpClient,
	}

	mcpClient := mcpsdk.NewClient(&mcpsdk.Implementation{
		Name:    "claude-mcp-bazaar-chatbot",
		Version: "1.0.0",
	}, nil)

	ctx := context.Background()
	fmt.Printf("Connecting to CDP MCP Bazaar: %s\n", serverURL)

	clientSession, err := mcpClient.Connect(ctx, transport, nil)
	if err != nil {
		return fmt.Errorf("failed to connect to MCP server: %w", err)
	}
	defer clientSession.Close()
	fmt.Println("Connected to CDP MCP Bazaar")

	// Create x402 payment client and wrap session
	paymentClient := x402.Newx402Client()
	paymentClient.Register("eip155:84532", evm.NewExactEvmScheme(evmSigner))
	x402Mcp := mcp.NewX402MCPClient(clientSession, paymentClient, mcp.Options{
		AutoPayment: mcp.BoolPtr(true),
		OnPaymentRequested: func(context mcp.PaymentRequiredContext) (bool, error) {
			if len(context.PaymentRequired.Accepts) > 0 {
				price := context.PaymentRequired.Accepts[0]
				fmt.Printf("\n  Payment requested for tool: %s\n", context.ToolName)
				fmt.Printf("   Amount: %s (%s)\n", price.Amount, price.Asset)
				fmt.Printf("   Network: %s\n", price.Network)
				fmt.Println("   Approving payment...\n")
			}
			return true, nil
		},
	})

	// List tools
	toolsResult, err := clientSession.ListTools(ctx, nil)
	if err != nil {
		return fmt.Errorf("failed to list tools: %w", err)
	}

	mcpTools := toolsResult.Tools
	fmt.Printf("\nFound %d tools:\n", len(mcpTools))
	for _, tool := range mcpTools {
		isPaid := strings.Contains(strings.ToLower(tool.Description), "payment") ||
			strings.Contains(tool.Description, "$")
		prefix := "[free]"
		if isPaid {
			prefix = "[paid]"
		}
		fmt.Printf("   %s %s: %s\n", prefix, tool.Name, tool.Description)
	}

	// Convert MCP tools to Anthropic format
	anthropicTools := make([]anthropic.ToolUnionParam, len(mcpTools))
	for i, tool := range mcpTools {
		inputSchema := anthropic.ToolInputSchemaParam{
			Type: constant.Object("object"),
		}
		if tool.InputSchema != nil {
			if m, ok := tool.InputSchema.(map[string]interface{}); ok {
				if p, ok := m["properties"]; ok {
					inputSchema.Properties = p
				}
				if r, ok := m["required"].([]interface{}); ok {
					var req []string
					for _, v := range r {
						if s, ok := v.(string); ok {
							req = append(req, s)
						}
					}
					inputSchema.Required = req
				}
			}
		}
		anthropicTools[i] = anthropic.ToolUnionParam{
			OfTool: &anthropic.ToolParam{
				Name:        tool.Name,
				Description: anthropic.String(tool.Description),
				InputSchema: inputSchema,
			},
		}
	}

	fmt.Println("Converted to Anthropic tool format")
	fmt.Println(strings.Repeat("=", 70))

	// Interactive chat loop
	fmt.Println("\nChat started! Try asking:")
	fmt.Println("   - 'What's the weather in Tokyo?'")
	fmt.Println("   - 'Can you ping the server?'")
	fmt.Println("   - 'quit' to exit\n")

	conversationHistory := []anthropic.MessageParam{
		anthropic.NewUserMessage(anthropic.NewTextBlock("You are a helpful assistant with access to MCP tools. Be concise and friendly.")),
	}

	scanner := bufio.NewScanner(os.Stdin)

	for {
		fmt.Print("You: ")
		if !scanner.Scan() {
			break
		}
		userInput := strings.TrimSpace(scanner.Text())

		if userInput == "" {
			continue
		}

		if strings.ToLower(userInput) == "quit" || strings.ToLower(userInput) == "exit" {
			fmt.Println("\nClosing connections...")
			break
		}

		// Add user message
		conversationHistory = append(conversationHistory, anthropic.NewUserMessage(anthropic.NewTextBlock(userInput)))

		// Call Anthropic
		response, err := anthropicClient.Messages.New(ctx, anthropic.MessageNewParams{
			Model:     anthropic.Model(modelName),
			MaxTokens: int64(maxTokens),
			Messages:  conversationHistory,
			Tools:     anthropicTools,
		})
		if err != nil {
			fmt.Printf("\nError calling Anthropic: %v\n\n", err)
			conversationHistory = conversationHistory[:len(conversationHistory)-1]
			continue
		}

		// Tool execution loop
		toolCallCount := 0
		for response.StopReason == anthropic.StopReasonToolUse {
			toolCallCount++
			fmt.Printf("\n  [Turn %d] LLM is calling %d tool(s)...\n", toolCallCount, len(response.Content))

			// Add assistant message with tool calls to history
			assistantBlocks := make([]anthropic.ContentBlockParamUnion, 0, len(response.Content))
			for _, block := range response.Content {
				switch v := block.AsAny().(type) {
				case anthropic.TextBlock:
					assistantBlocks = append(assistantBlocks, anthropic.NewTextBlock(v.Text))
				case anthropic.ToolUseBlock:
					assistantBlocks = append(assistantBlocks, anthropic.NewToolUseBlock(v.ID, v.Input, v.Name))
				case anthropic.ServerToolUseBlock:
					assistantBlocks = append(assistantBlocks, anthropic.NewServerToolUseBlock(v.ID, v.Input))
				}
			}
			conversationHistory = append(conversationHistory, anthropic.NewAssistantMessage(assistantBlocks...))

			// Execute each tool call
			toolResultBlocks := make([]anthropic.ContentBlockParamUnion, 0)
			for _, block := range response.Content {
				var toolName string
				var toolID string
				var toolInput map[string]interface{}

				switch v := block.AsAny().(type) {
				case anthropic.ToolUseBlock:
					toolName = v.Name
					toolID = v.ID
					if v.Input != nil {
						_ = json.Unmarshal(v.Input, &toolInput)
					}
				case anthropic.ServerToolUseBlock:
					toolName = "proxy_tool_call"
					toolID = v.ID
					if v.Input != nil {
						if b, err := json.Marshal(v.Input); err == nil {
							_ = json.Unmarshal(b, &toolInput)
							if tn, ok := toolInput["toolName"].(string); ok {
								toolName = tn
							}
						}
					}
				default:
					continue
				}

				// Remove _meta from args (LLM may include it)
				delete(toolInput, "_meta")

				if toolName == "search_resources" {
					fmt.Println("\n  Searching for available tools...")
				} else if toolName == "proxy_tool_call" {
					if tn, ok := toolInput["toolName"].(string); ok {
						fmt.Printf("\n  Selected tool: %s\n", tn)
					}
				} else {
					fmt.Printf("\n  Selected tool: %s\n", toolName)
				}

				argsJSON, _ := json.Marshal(toolInput)
				fmt.Printf("   Args: %s\n", string(argsJSON))

				mcpResult, err := x402Mcp.CallTool(ctx, toolName, toolInput)
				var resultText string
				if err != nil {
					fmt.Printf("   Error: %v\n", err)
					resultText = fmt.Sprintf("Error executing tool: %v", err)
				} else {
					if mcpResult.PaymentMade && mcpResult.PaymentResponse != nil {
						fmt.Println("   Payment settled!")
						if mcpResult.PaymentResponse.Transaction != "" {
							fmt.Printf("      Transaction: %s\n", mcpResult.PaymentResponse.Transaction)
						}
					}
					if len(mcpResult.Content) > 0 {
						resultText = mcpResult.Content[0].Text
					} else {
						resultText = "No content returned"
					}
					if len(resultText) > 200 {
						fmt.Printf("   Result: %s...\n", resultText[:200])
					} else {
						fmt.Printf("   Result: %s\n", resultText)
					}
				}

				toolResultBlocks = append(toolResultBlocks, anthropic.NewToolResultBlock(toolID, resultText, false))
			}

			// Add tool results as user message
			conversationHistory = append(conversationHistory, anthropic.NewUserMessage(toolResultBlocks...))

			// Get next response
			response, err = anthropicClient.Messages.New(ctx, anthropic.MessageNewParams{
				Model:     anthropic.Model(modelName),
				MaxTokens: int64(maxTokens),
				Messages:  conversationHistory,
				Tools:     anthropicTools,
			})
			if err != nil {
				fmt.Printf("\nError calling Anthropic: %v\n\n", err)
				break
			}
		}

		// Display final response
		var textParts []string
		for _, block := range response.Content {
			if v := block.AsAny(); v != nil {
				if tb, ok := v.(anthropic.TextBlock); ok {
					textParts = append(textParts, tb.Text)
				}
			}
		}
		if len(textParts) > 0 {
			textContent := strings.Join(textParts, "\n")
			assistantBlocks := make([]anthropic.ContentBlockParamUnion, 0, len(response.Content))
			for _, block := range response.Content {
				switch v := block.AsAny().(type) {
				case anthropic.TextBlock:
					assistantBlocks = append(assistantBlocks, anthropic.NewTextBlock(v.Text))
				case anthropic.ToolUseBlock:
					assistantBlocks = append(assistantBlocks, anthropic.NewToolUseBlock(v.ID, v.Input, v.Name))
				case anthropic.ServerToolUseBlock:
					assistantBlocks = append(assistantBlocks, anthropic.NewServerToolUseBlock(v.ID, v.Input))
				}
			}
			conversationHistory = append(conversationHistory, anthropic.NewAssistantMessage(assistantBlocks...))
			fmt.Printf("\nBot: %s\n\n", textContent)
		}
	}

	fmt.Println("Goodbye!\n")
	return nil
}
