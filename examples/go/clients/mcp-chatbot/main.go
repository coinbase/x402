package main

/**
 * OpenAI Chatbot with MCP Tools + x402 Payments
 *
 * A complete chatbot implementation showing how to integrate:
 * - OpenAI GPT (the LLM)
 * - MCP Client (tool discovery and execution)
 * - x402 Payment Protocol (automatic payment for paid tools)
 *
 * This demonstrates the ACTUAL MCP client methods used in production chatbots.
 *
 * Run with: go run .
 */

import (
	"bufio"
	"context"
	"encoding/json"
	"fmt"
	"os"
	"strings"

	evm "github.com/coinbase/x402/go/mechanisms/evm/exact/client"
	"github.com/coinbase/x402/go/mcp"
	evmsigners "github.com/coinbase/x402/go/signers/evm"
	"github.com/joho/godotenv"
	mcpsdk "github.com/modelcontextprotocol/go-sdk/mcp"
	openai "github.com/sashabaranov/go-openai"
)

// ============================================================================
// MCP Client Adapter
// ============================================================================

// mcpClientAdapter adapts mcpsdk.ClientSession to mcp.MCPClientInterface
type mcpClientAdapter struct {
	client  *mcpsdk.Client
	session *mcpsdk.ClientSession
}

func (a *mcpClientAdapter) Connect(ctx context.Context, transport interface{}) error {
	return nil // Already connected via session
}

func (a *mcpClientAdapter) Close(ctx context.Context) error {
	return a.session.Close()
}

func (a *mcpClientAdapter) CallTool(ctx context.Context, params map[string]interface{}) (mcp.MCPToolResult, error) {
	name, _ := params["name"].(string)
	args, _ := params["arguments"].(map[string]interface{})
	meta, _ := params["_meta"].(map[string]interface{})

	callParams := &mcpsdk.CallToolParams{
		Name:      name,
		Arguments: args,
	}
	if meta != nil {
		callParams.Meta = mcpsdk.Meta(meta)
	}

	result, err := a.session.CallTool(ctx, callParams)
	if err != nil {
		return mcp.MCPToolResult{}, err
	}

	content := make([]mcp.MCPContentItem, 0, len(result.Content))
	for _, item := range result.Content {
		if textContent, ok := item.(*mcpsdk.TextContent); ok {
			content = append(content, mcp.MCPContentItem{
				Type: "text",
				Text: textContent.Text,
			})
		}
	}

	mcpResult := mcp.MCPToolResult{
		Content: content,
		IsError: result.IsError,
	}

	if result.Meta != nil {
		mcpResult.Meta = result.Meta.GetMeta()
	}

	return mcpResult, nil
}

func (a *mcpClientAdapter) ListTools(ctx context.Context) (interface{}, error) {
	result, err := a.session.ListTools(ctx, nil)
	if err != nil {
		return nil, err
	}
	return result, nil
}

func (a *mcpClientAdapter) ListResources(ctx context.Context) (interface{}, error) {
	return a.session.ListResources(ctx, nil)
}

func (a *mcpClientAdapter) ReadResource(ctx context.Context, uri string) (interface{}, error) {
	return a.session.ReadResource(ctx, &mcpsdk.ReadResourceParams{URI: uri})
}

func (a *mcpClientAdapter) ListResourceTemplates(ctx context.Context) (interface{}, error) {
	return a.session.ListResourceTemplates(ctx, nil)
}

func (a *mcpClientAdapter) SubscribeResource(ctx context.Context, uri string) error {
	return a.session.Subscribe(ctx, &mcpsdk.SubscribeParams{URI: uri})
}

func (a *mcpClientAdapter) UnsubscribeResource(ctx context.Context, uri string) error {
	return a.session.Unsubscribe(ctx, &mcpsdk.UnsubscribeParams{URI: uri})
}

func (a *mcpClientAdapter) ListPrompts(ctx context.Context) (interface{}, error) {
	return a.session.ListPrompts(ctx, nil)
}

func (a *mcpClientAdapter) GetPrompt(ctx context.Context, name string) (interface{}, error) {
	return a.session.GetPrompt(ctx, &mcpsdk.GetPromptParams{Name: name})
}

func (a *mcpClientAdapter) GetServerCapabilities(ctx context.Context) (interface{}, error) {
	initResult := a.session.InitializeResult()
	if initResult == nil {
		return nil, fmt.Errorf("session not initialized")
	}
	return initResult.Capabilities, nil
}

func (a *mcpClientAdapter) GetServerVersion(ctx context.Context) (interface{}, error) {
	initResult := a.session.InitializeResult()
	if initResult == nil {
		return nil, fmt.Errorf("session not initialized")
	}
	return initResult.ServerInfo.Version, nil
}

func (a *mcpClientAdapter) GetInstructions(ctx context.Context) (string, error) {
	initResult := a.session.InitializeResult()
	if initResult == nil {
		return "", fmt.Errorf("session not initialized")
	}
	if initResult.Instructions != "" {
		return initResult.Instructions, nil
	}
	return "", nil
}

func (a *mcpClientAdapter) Ping(ctx context.Context) error {
	return a.session.Ping(ctx, &mcpsdk.PingParams{})
}

func (a *mcpClientAdapter) Complete(ctx context.Context, prompt string, cursor int) (interface{}, error) {
	return nil, fmt.Errorf("not implemented")
}

func (a *mcpClientAdapter) SetLoggingLevel(ctx context.Context, level string) error {
	return a.session.SetLoggingLevel(ctx, &mcpsdk.SetLoggingLevelParams{Level: mcpsdk.LoggingLevel(level)})
}

func (a *mcpClientAdapter) SendRootsListChanged(ctx context.Context) error {
	return nil
}

// ============================================================================
// Main
// ============================================================================

func main() {
	if err := run(); err != nil {
		fmt.Printf("\nFatal error: %v\n", err)
		os.Exit(1)
	}
}

func run() error {
	fmt.Println("\nOpenAI + MCP Chatbot with x402 Payments")
	fmt.Println(strings.Repeat("=", 70))

	// Load environment variables
	if err := godotenv.Load(); err != nil {
		fmt.Println("No .env file found, using environment variables")
	}

	openaiKey := os.Getenv("OPENAI_API_KEY")
	if openaiKey == "" {
		return fmt.Errorf("OPENAI_API_KEY environment variable is required")
	}

	evmPrivateKey := os.Getenv("EVM_PRIVATE_KEY")
	if evmPrivateKey == "" {
		return fmt.Errorf("EVM_PRIVATE_KEY environment variable is required")
	}

	serverURL := os.Getenv("MCP_SERVER_URL")
	if serverURL == "" {
		serverURL = "http://localhost:4022"
	}

	// ========================================================================
	// SETUP 1: Initialize OpenAI (the LLM)
	// ========================================================================
	openaiClient := openai.NewClient(openaiKey)
	fmt.Println("OpenAI client initialized")

	// ========================================================================
	// SETUP 2: Initialize x402 payment signer
	// ========================================================================
	evmSigner, err := evmsigners.NewClientSignerFromPrivateKey(evmPrivateKey)
	if err != nil {
		return fmt.Errorf("failed to create EVM signer: %w", err)
	}
	fmt.Printf("Wallet address: %s\n", evmSigner.Address())

	// ========================================================================
	// SETUP 3: Connect to MCP server
	// ========================================================================
	ctx := context.Background()
	fmt.Printf("Connecting to MCP server: %s\n", serverURL)

	// MCP TOUCHPOINT #1: connect()
	sseTransport := &mcpsdk.SSEClientTransport{
		Endpoint: serverURL + "/sse",
	}

	mcpClient := mcpsdk.NewClient(&mcpsdk.Implementation{
		Name:    "openai-mcp-chatbot",
		Version: "1.0.0",
	}, nil)

	clientSession, err := mcpClient.Connect(ctx, sseTransport, nil)
	if err != nil {
		return fmt.Errorf("failed to connect to MCP server: %w", err)
	}
	defer clientSession.Close()
	fmt.Println("Connected to MCP server")

	// Create adapter and wrap with x402
	adapter := &mcpClientAdapter{
		client:  mcpClient,
		session: clientSession,
	}

	x402Mcp := mcp.NewX402MCPClientFromConfig(
		adapter,
		[]mcp.SchemeRegistration{
			{
				Network: "eip155:84532",
				Client:  evm.NewExactEvmScheme(evmSigner),
			},
		},
		mcp.Options{
			AutoPayment: mcp.BoolPtr(true),
			OnPaymentRequested: func(context mcp.PaymentRequiredContext) (bool, error) {
				price := context.PaymentRequired.Accepts[0]
				fmt.Printf("\n  Payment requested for tool: %s\n", context.ToolName)
				fmt.Printf("   Amount: %s (%s)\n", price.Amount, price.Asset)
				fmt.Printf("   Network: %s\n", price.Network)
				fmt.Println("   Approving payment...\n")
				return true, nil // Auto-approve
			},
		},
	)

	// ========================================================================
	// MCP TOUCHPOINT #2: listTools()
	// Discover available tools from MCP server
	// ========================================================================
	fmt.Println("\nDiscovering tools from MCP server...")
	toolsResult, err := clientSession.ListTools(ctx, nil)
	if err != nil {
		return fmt.Errorf("failed to list tools: %w", err)
	}

	mcpTools := toolsResult.Tools
	fmt.Printf("Found %d tools:\n", len(mcpTools))
	for _, tool := range mcpTools {
		isPaid := strings.Contains(strings.ToLower(tool.Description), "payment") ||
			strings.Contains(tool.Description, "$")
		prefix := "[free]"
		if isPaid {
			prefix = "[paid]"
		}
		fmt.Printf("   %s %s: %s\n", prefix, tool.Name, tool.Description)
	}

	// ========================================================================
	// HOST LOGIC: Convert MCP tools to OpenAI format
	// ========================================================================
	openaiTools := make([]openai.Tool, len(mcpTools))
	for i, tool := range mcpTools {
		// Convert inputSchema to JSON params
		paramsJSON, _ := json.Marshal(tool.InputSchema)
		var params json.RawMessage = paramsJSON

		openaiTools[i] = openai.Tool{
			Type: openai.ToolTypeFunction,
			Function: &openai.FunctionDefinition{
				Name:        tool.Name,
				Description: tool.Description,
				Parameters:  params,
			},
		}
	}

	fmt.Println("Converted to OpenAI tool format")
	fmt.Println(strings.Repeat("=", 70))

	// ========================================================================
	// Interactive Chat Loop
	// ========================================================================
	fmt.Println("\nChat started! Try asking:")
	fmt.Println("   - 'What's the weather in Tokyo?'")
	fmt.Println("   - 'Can you ping the server?'")
	fmt.Println("   - 'quit' to exit\n")

	conversationHistory := []openai.ChatCompletionMessage{
		{
			Role:    openai.ChatMessageRoleSystem,
			Content: "You are a helpful assistant with access to MCP tools. When users ask about weather, use the get_weather tool. Be concise and friendly.",
		},
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

		// Add user message to history
		conversationHistory = append(conversationHistory, openai.ChatCompletionMessage{
			Role:    openai.ChatMessageRoleUser,
			Content: userInput,
		})

		// ==================================================================
		// OPENAI CALL: Send conversation + tools to LLM
		// ==================================================================
		response, err := openaiClient.CreateChatCompletion(ctx, openai.ChatCompletionRequest{
			Model:      openai.GPT4o,
			Messages:   conversationHistory,
			Tools:      openaiTools,
			ToolChoice: "auto",
		})
		if err != nil {
			fmt.Printf("\nError calling OpenAI: %v\n\n", err)
			// Remove the user message we just added since it failed
			conversationHistory = conversationHistory[:len(conversationHistory)-1]
			continue
		}

		assistantMessage := response.Choices[0].Message

		// ==================================================================
		// TOOL EXECUTION LOOP
		// ==================================================================
		toolCallCount := 0
		for len(assistantMessage.ToolCalls) > 0 {
			toolCallCount++
			fmt.Printf("\n  [Turn %d] LLM is calling %d tool(s)...\n",
				toolCallCount, len(assistantMessage.ToolCalls))

			// Add assistant message with tool calls to history
			conversationHistory = append(conversationHistory, assistantMessage)

			// Execute each tool call
			for _, toolCall := range assistantMessage.ToolCalls {
				toolName := toolCall.Function.Name
				var toolArgs map[string]interface{}
				if err := json.Unmarshal([]byte(toolCall.Function.Arguments), &toolArgs); err != nil {
					toolArgs = map[string]interface{}{}
				}

				fmt.Printf("\n   Calling: %s\n", toolName)
				argsJSON, _ := json.Marshal(toolArgs)
				fmt.Printf("   Args: %s\n", string(argsJSON))

				// ============================================================
				// MCP TOUCHPOINT #3: CallTool()
				// Payment is handled automatically by X402MCPClient
				// ============================================================
				mcpResult, err := x402Mcp.CallTool(ctx, toolName, toolArgs)

				var resultText string
				if err != nil {
					fmt.Printf("   Error: %v\n", err)
					resultText = fmt.Sprintf("Error executing tool: %v", err)
				} else {
					// Show payment info if payment was made
					if mcpResult.PaymentMade && mcpResult.PaymentResponse != nil {
						fmt.Println("   Payment settled!")
						if mcpResult.PaymentResponse.Transaction != "" {
							fmt.Printf("      Transaction: %s\n", mcpResult.PaymentResponse.Transaction)
						}
						if mcpResult.PaymentResponse.Network != "" {
							fmt.Printf("      Network: %s\n", mcpResult.PaymentResponse.Network)
						}
					}

					// Extract text content
					resultText = "No content returned"
					if len(mcpResult.Content) > 0 {
						resultText = mcpResult.Content[0].Text
					}

					truncated := resultText
					if len(truncated) > 200 {
						truncated = truncated[:200] + "..."
					}
					fmt.Printf("   Result: %s\n", truncated)
				}

				// Add tool result to conversation
				conversationHistory = append(conversationHistory, openai.ChatCompletionMessage{
					Role:       openai.ChatMessageRoleTool,
					Content:    resultText,
					ToolCallID: toolCall.ID,
				})
			}

			// ==============================================================
			// Get LLM's response after seeing tool results
			// ==============================================================
			response, err = openaiClient.CreateChatCompletion(ctx, openai.ChatCompletionRequest{
				Model:      openai.GPT4o,
				Messages:   conversationHistory,
				Tools:      openaiTools,
				ToolChoice: "auto",
			})
			if err != nil {
				fmt.Printf("\nError calling OpenAI: %v\n\n", err)
				break
			}

			assistantMessage = response.Choices[0].Message
		}

		// ==================================================================
		// Display final assistant response
		// ==================================================================
		if assistantMessage.Content != "" {
			conversationHistory = append(conversationHistory, assistantMessage)
			fmt.Printf("\nBot: %s\n\n", assistantMessage.Content)
		}
	}

	// ========================================================================
	// MCP TOUCHPOINT #4: close()
	// Clean shutdown (deferred above)
	// ========================================================================
	fmt.Println("Goodbye!\n")
	return nil
}
