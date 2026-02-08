package mcp

import (
	"context"
)

// MCPClientInterface defines the interface expected from an MCP SDK client
// This allows us to work with any MCP SDK implementation
type MCPClientInterface interface {
	// Connection management
	Connect(ctx context.Context, transport interface{}) error
	Close(ctx context.Context) error

	// Tool operations
	CallTool(ctx context.Context, params map[string]interface{}) (MCPToolResult, error)
	ListTools(ctx context.Context) (interface{}, error)

	// Resource operations
	ListResources(ctx context.Context) (interface{}, error)
	ReadResource(ctx context.Context, uri string) (interface{}, error)
	ListResourceTemplates(ctx context.Context) (interface{}, error)
	SubscribeResource(ctx context.Context, uri string) error
	UnsubscribeResource(ctx context.Context, uri string) error

	// Prompt operations
	ListPrompts(ctx context.Context) (interface{}, error)
	GetPrompt(ctx context.Context, name string) (interface{}, error)

	// Server info
	GetServerCapabilities(ctx context.Context) (interface{}, error)
	GetServerVersion(ctx context.Context) (interface{}, error)
	GetInstructions(ctx context.Context) (string, error)

	// Protocol methods
	Ping(ctx context.Context) error
	Complete(ctx context.Context, prompt string, cursor int) (interface{}, error)
	SetLoggingLevel(ctx context.Context, level string) error
	SendRootsListChanged(ctx context.Context) error
}
