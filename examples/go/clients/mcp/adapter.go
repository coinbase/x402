package main

import (
	"context"
	"fmt"

	"github.com/coinbase/x402/go/mcp"
	mcpsdk "github.com/modelcontextprotocol/go-sdk/mcp"
)

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

	tools := make([]map[string]interface{}, len(result.Tools))
	for i, tool := range result.Tools {
		tools[i] = map[string]interface{}{
			"name":        tool.Name,
			"description": tool.Description,
		}
	}

	return tools, nil
}

func (a *mcpClientAdapter) ListResources(ctx context.Context) (interface{}, error) {
	result, err := a.session.ListResources(ctx, nil)
	if err != nil {
		return nil, err
	}
	return result, nil
}

func (a *mcpClientAdapter) ReadResource(ctx context.Context, uri string) (interface{}, error) {
	result, err := a.session.ReadResource(ctx, &mcpsdk.ReadResourceParams{URI: uri})
	if err != nil {
		return nil, err
	}
	return result, nil
}

func (a *mcpClientAdapter) ListResourceTemplates(ctx context.Context) (interface{}, error) {
	result, err := a.session.ListResourceTemplates(ctx, nil)
	if err != nil {
		return nil, err
	}
	return result, nil
}

func (a *mcpClientAdapter) SubscribeResource(ctx context.Context, uri string) error {
	return a.session.Subscribe(ctx, &mcpsdk.SubscribeParams{URI: uri})
}

func (a *mcpClientAdapter) UnsubscribeResource(ctx context.Context, uri string) error {
	return a.session.Unsubscribe(ctx, &mcpsdk.UnsubscribeParams{URI: uri})
}

func (a *mcpClientAdapter) ListPrompts(ctx context.Context) (interface{}, error) {
	result, err := a.session.ListPrompts(ctx, nil)
	if err != nil {
		return nil, err
	}
	return result, nil
}

func (a *mcpClientAdapter) GetPrompt(ctx context.Context, name string) (interface{}, error) {
	result, err := a.session.GetPrompt(ctx, &mcpsdk.GetPromptParams{Name: name})
	if err != nil {
		return nil, err
	}
	return result, nil
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
