package mcp

import (
	"context"
	"fmt"

	mcpsdk "github.com/modelcontextprotocol/go-sdk/mcp"
)

// x402SDKAdapter adapts the official Go MCP SDK (github.com/modelcontextprotocol/go-sdk/mcp)
// Client and ClientSession to the MCPClientInterface.
//
// Use NewMCPClientAdapter to create an instance.
type x402SDKAdapter struct {
	client  *mcpsdk.Client
	session *mcpsdk.ClientSession
}

// NewMCPClientAdapter creates an MCPClientInterface from the official Go MCP SDK types.
//
// This is the recommended way to bridge the official MCP SDK with x402.
// It adapts a connected mcpsdk.ClientSession to the MCPClientInterface expected
// by NewX402MCPClient and NewX402MCPClientFromConfig.
//
// Example:
//
//	mcpClient := mcpsdk.NewClient(&mcpsdk.Implementation{
//	    Name: "my-agent", Version: "1.0.0",
//	}, nil)
//	session, err := mcpClient.Connect(ctx, transport, nil)
//	if err != nil { ... }
//
//	adapter := mcp.NewMCPClientAdapter(mcpClient, session)
//	x402Mcp := mcp.NewX402MCPClientFromConfig(adapter, schemes, options)
func NewMCPClientAdapter(client *mcpsdk.Client, session *mcpsdk.ClientSession) MCPClientInterface {
	return &x402SDKAdapter{client: client, session: session}
}

func (a *x402SDKAdapter) Connect(ctx context.Context, transport interface{}) error {
	// Already connected via session
	return nil
}

func (a *x402SDKAdapter) Close(ctx context.Context) error {
	return a.session.Close()
}

func (a *x402SDKAdapter) CallTool(ctx context.Context, params map[string]interface{}) (MCPToolResult, error) {
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
		return MCPToolResult{}, err
	}

	content := make([]MCPContentItem, 0, len(result.Content))
	for _, item := range result.Content {
		if textContent, ok := item.(*mcpsdk.TextContent); ok {
			content = append(content, MCPContentItem{
				Type: "text",
				Text: textContent.Text,
			})
		}
	}

	mcpResult := MCPToolResult{
		Content: content,
		IsError: result.IsError,
	}

	// Preserve StructuredContent if present (needed for payment required responses)
	if result.StructuredContent != nil {
		if structuredMap, ok := result.StructuredContent.(map[string]interface{}); ok {
			mcpResult.StructuredContent = structuredMap
		}
	}

	// Preserve Meta — critical for payment responses
	if result.Meta != nil {
		metaMap := result.Meta.GetMeta()
		if len(metaMap) > 0 {
			mcpResult.Meta = make(map[string]interface{}, len(metaMap))
			for k, v := range metaMap {
				mcpResult.Meta[k] = v
			}
		}
	}

	return mcpResult, nil
}

func (a *x402SDKAdapter) ListTools(ctx context.Context) (interface{}, error) {
	result, err := a.session.ListTools(ctx, nil)
	if err != nil {
		return nil, err
	}
	return result, nil
}

func (a *x402SDKAdapter) ListResources(ctx context.Context) (interface{}, error) {
	return a.session.ListResources(ctx, nil)
}

func (a *x402SDKAdapter) ReadResource(ctx context.Context, uri string) (interface{}, error) {
	return a.session.ReadResource(ctx, &mcpsdk.ReadResourceParams{URI: uri})
}

func (a *x402SDKAdapter) ListResourceTemplates(ctx context.Context) (interface{}, error) {
	return a.session.ListResourceTemplates(ctx, nil)
}

func (a *x402SDKAdapter) SubscribeResource(ctx context.Context, uri string) error {
	return a.session.Subscribe(ctx, &mcpsdk.SubscribeParams{URI: uri})
}

func (a *x402SDKAdapter) UnsubscribeResource(ctx context.Context, uri string) error {
	return a.session.Unsubscribe(ctx, &mcpsdk.UnsubscribeParams{URI: uri})
}

func (a *x402SDKAdapter) ListPrompts(ctx context.Context) (interface{}, error) {
	return a.session.ListPrompts(ctx, nil)
}

func (a *x402SDKAdapter) GetPrompt(ctx context.Context, name string) (interface{}, error) {
	return a.session.GetPrompt(ctx, &mcpsdk.GetPromptParams{Name: name})
}

func (a *x402SDKAdapter) GetServerCapabilities(ctx context.Context) (interface{}, error) {
	initResult := a.session.InitializeResult()
	if initResult == nil {
		return nil, fmt.Errorf("session not initialized")
	}
	return initResult.Capabilities, nil
}

func (a *x402SDKAdapter) GetServerVersion(ctx context.Context) (interface{}, error) {
	initResult := a.session.InitializeResult()
	if initResult == nil {
		return nil, fmt.Errorf("session not initialized")
	}
	return initResult.ServerInfo.Version, nil
}

func (a *x402SDKAdapter) GetInstructions(ctx context.Context) (string, error) {
	initResult := a.session.InitializeResult()
	if initResult == nil {
		return "", fmt.Errorf("session not initialized")
	}
	return initResult.Instructions, nil
}

func (a *x402SDKAdapter) Ping(ctx context.Context) error {
	return a.session.Ping(ctx, &mcpsdk.PingParams{})
}

func (a *x402SDKAdapter) Complete(ctx context.Context, prompt string, cursor int) (interface{}, error) {
	result, err := a.session.Complete(ctx, &mcpsdk.CompleteParams{
		Ref: &mcpsdk.CompleteReference{
			Type: "ref/prompt",
			Name: prompt,
		},
		Argument: mcpsdk.CompleteParamsArgument{
			Name:  "argument",
			Value: prompt,
		},
	})
	if err != nil {
		return nil, err
	}
	return result, nil
}

func (a *x402SDKAdapter) SetLoggingLevel(ctx context.Context, level string) error {
	return a.session.SetLoggingLevel(ctx, &mcpsdk.SetLoggingLevelParams{Level: mcpsdk.LoggingLevel(level)})
}

// SendRootsListChanged is a no-op for this adapter.
//
// In the official MCP SDK, roots-list-changed notifications are sent automatically
// when Client.AddRoots() or Client.RemoveRoots() are called. There is no standalone
// method to send this notification. Callers needing root management should use the
// underlying *mcpsdk.Client directly via the client field.
func (a *x402SDKAdapter) SendRootsListChanged(ctx context.Context) error {
	return nil
}
