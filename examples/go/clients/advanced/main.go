package main

import (
	"context"
	"encoding/json"
	"fmt"
	"net/http"
	"os"
	"time"

	"github.com/joho/godotenv"
)

/**
 * Advanced Client Examples
 *
 * This package demonstrates advanced patterns for production-ready x402 clients:
 *
 * - custom-transport: Custom HTTP transport with retry logic and circuit breaker
 * - error-recovery: Advanced error handling and automatic recovery strategies
 * - multi-network-priority: Network selection with priority and fallback
 * - hooks: Payment lifecycle hooks for custom logic at different stages
 *
 * Usage:
 *   go run . custom-transport
 *   go run . error-recovery
 *   go run . multi-network-priority
 *   go run . hooks
 */

func main() {
	// Load .env file if it exists
	if err := godotenv.Load(); err != nil {
		fmt.Println("No .env file found, using environment variables")
	}

	pattern := "custom-transport"
	if len(os.Args) > 1 {
		pattern = os.Args[1]
	}

	fmt.Printf("\n🚀 Running advanced example: %s\n\n", pattern)

	// Get configuration
	evmPrivateKey := os.Getenv("EVM_PRIVATE_KEY")
	if evmPrivateKey == "" {
		fmt.Println("❌ EVM_PRIVATE_KEY environment variable is required")
		os.Exit(1)
	}

	url := os.Getenv("SERVER_URL")
	if url == "" {
		url = "http://localhost:4021/weather"
	}

	// Run the selected example
	ctx := context.Background()

	switch pattern {
	case "custom-transport":
		if err := runCustomTransportExample(ctx, evmPrivateKey, url); err != nil {
			fmt.Printf("❌ Error: %v\n", err)
			os.Exit(1)
		}

	case "error-recovery":
		if err := runErrorRecoveryExample(ctx, evmPrivateKey, url); err != nil {
			fmt.Printf("❌ Error: %v\n", err)
			os.Exit(1)
		}

	case "multi-network-priority":
		if err := runMultiNetworkPriorityExample(ctx, evmPrivateKey, url); err != nil {
			fmt.Printf("❌ Error: %v\n", err)
			os.Exit(1)
		}

	case "hooks":
		if err := runHooksExample(ctx, evmPrivateKey, url); err != nil {
			fmt.Printf("❌ Error: %v\n", err)
			os.Exit(1)
		}

	default:
		fmt.Printf("❌ Unknown pattern: %s\n", pattern)
		fmt.Println("Available patterns: custom-transport, error-recovery, multi-network-priority, hooks")
		os.Exit(1)
	}
}

// printResponse is a helper to display response data
func printResponse(resp *http.Response, label string) error {
	var data interface{}
	if err := json.NewDecoder(resp.Body).Decode(&data); err != nil {
		return err
	}

	fmt.Printf("✅ %s:\n", label)
	pretty, _ := json.MarshalIndent(data, "  ", "  ")
	fmt.Printf("  %s\n\n", string(pretty))

	return nil
}

// printDuration prints elapsed time for an operation
func printDuration(start time.Time, label string) {
	fmt.Printf("⏱️  %s took %v\n\n", label, time.Since(start))
}

