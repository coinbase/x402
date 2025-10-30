package main

import (
	"context"
	"fmt"
	"log"

	x402 "github.com/coinbase/x402/go"
	"github.com/coinbase/x402/go/mechanisms/evm"
	evmv1 "github.com/coinbase/x402/go/mechanisms/evm/v1"
)

// Example showing how to use both V1 and V2 EVM implementations
func main() {
	// Example payment requirements
	requirements := x402.PaymentRequirements{
		Scheme:  "exact",
		Network: "base",
		Asset:   "USDC",
		Amount:  "1000000", // 1 USDC in smallest unit
		PayTo:   "0x9876543210987654321098765432109876543210",
		Extra: map[string]interface{}{
			"name":    "USD Coin",
			"version": "2",
		},
	}

	// Using V2 (default, recommended)
	fmt.Println("=== V2 Implementation ===")
	clientV2 := x402.Newx402Client()
	// Register V2 EVM client (supports x402 version 2)
	evm.RegisterClient(&clientV2, nil, "base") // nil signer for example

	// Check if client can pay
	canPayV2 := clientV2.CanPay(requirements.Network, requirements.Scheme)
	fmt.Printf("V2 Client can pay: %v\n", canPayV2)

	// Using V1 (legacy support)
	fmt.Println("\n=== V1 Implementation ===")
	clientV1 := x402.Newx402Client()
	// Register V1 EVM client (supports x402 version 1 only)
	evmv1.RegisterClient(&clientV1, nil) // nil signer for example

	// Check if client can pay
	canPayV1 := clientV1.CanPay(requirements.Network, requirements.Scheme)
	fmt.Printf("V1 Client can pay: %v\n", canPayV1)

	// Service example
	fmt.Println("\n=== Service Example ===")

	// V2 Service
	serviceV2 := x402.Newx402ResourceService(
		evm.RegisterService("base")..., // V2 service options
	)

	// V1 Service
	serviceV1 := x402.Newx402ResourceService(
		evmv1.RegisterService(), // V1 service option
	)

	// Parse price example
	evmServiceV2 := evm.NewExactEvmService()
	evmServiceV1 := evmv1.NewExactEvmServiceV1()

	price := "5.00" // $5.00
	network := x402.Network("base")

	assetAmountV2, err := evmServiceV2.ParsePrice(price, network)
	if err != nil {
		log.Printf("V2 ParsePrice error: %v", err)
	} else {
		fmt.Printf("V2 Parsed price: %s %s\n", assetAmountV2.Amount, assetAmountV2.Asset)
	}

	assetAmountV1, err := evmServiceV1.ParsePrice(price, network)
	if err != nil {
		log.Printf("V1 ParsePrice error: %v", err)
	} else {
		fmt.Printf("V1 Parsed price: %s %s\n", assetAmountV1.Amount, assetAmountV1.Asset)
	}

	// Version-specific behavior
	fmt.Println("\n=== Version Differences ===")
	fmt.Println("V2 Features:")
	fmt.Println("- Supports x402 protocol version 2")
	fmt.Println("- No buffer on validAfter (immediate use)")
	fmt.Println("- Default 1 hour validity window")
	fmt.Println("- Enhanced price parsing")

	fmt.Println("\nV1 Features:")
	fmt.Println("- Supports x402 protocol version 1 only")
	fmt.Println("- 10-minute buffer on validAfter")
	fmt.Println("- Default 10-minute validity window")
	fmt.Println("- Simpler price parsing")

	// Demonstrate version checking
	ctx := context.Background()
	supportedKindV2 := x402.SupportedKind{
		X402Version: 2,
		Scheme:      "exact",
		Network:     "base",
	}

	supportedKindV1 := x402.SupportedKind{
		X402Version: 1,
		Scheme:      "exact",
		Network:     "base",
	}

	// V2 service only accepts version 2
	_, errV2with1 := evmServiceV2.EnhancePaymentRequirements(ctx, requirements, supportedKindV1, nil)
	if errV2with1 != nil {
		fmt.Printf("\nV2 Service with version 1: %v\n", errV2with1)
	}

	// V1 service only accepts version 1
	_, errV1with2 := evmServiceV1.EnhancePaymentRequirements(ctx, requirements, supportedKindV2, nil)
	if errV1with2 != nil {
		fmt.Printf("V1 Service with version 2: %v\n", errV1with2)
	}

	_ = serviceV2
	_ = serviceV1
}
