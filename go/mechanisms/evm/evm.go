// Package evm provides V2 EVM blockchain support for the x402 payment protocol.
// It implements the exact payment scheme using EIP-3009 TransferWithAuthorization.
// For V1 support, use the v1 subpackage.
package evm

import (
	"context"
	"encoding/json"

	x402 "github.com/coinbase/x402/go"
)

// Register registers all V2 EVM mechanism implementations with the x402 client, facilitator, and server
func Register(
	client *x402.X402Client,
	facilitator *x402.X402Facilitator,
	server *x402.X402ResourceServer,
	signer interface{},
	networks []string,
) error {
	// Determine which components to register based on the signer type
	var clientSigner ClientEvmSigner
	var facilitatorSigner FacilitatorEvmSigner

	// Try to cast signer to the appropriate interfaces
	if s, ok := signer.(ClientEvmSigner); ok {
		clientSigner = s
	}
	if s, ok := signer.(FacilitatorEvmSigner); ok {
		facilitatorSigner = s
	}

	// If no specific networks provided, use all supported networks
	if len(networks) == 0 {
		for network := range NetworkConfigs {
			networks = append(networks, network)
		}
	}

	// Register with client if we have a client signer
	if client != nil && clientSigner != nil {
		evmClient := NewExactEvmClient(clientSigner)
		for _, network := range networks {
			if IsValidNetwork(network) {
				client.RegisterScheme(x402.Network(network), evmClient)
			}
		}
	}

	// Register with facilitator if we have a facilitator signer
	if facilitator != nil && facilitatorSigner != nil {
		evmFacilitator := NewExactEvmFacilitator(facilitatorSigner)
		for _, network := range networks {
			if IsValidNetwork(network) {
				facilitator.RegisterScheme(x402.Network(network), evmFacilitator)
			}
		}
	}

	// Register with server (no signer needed)
	// Note: Server registration is done via RegisterServer() which returns options
	if server != nil {
		// Server options should be passed during server creation
	}

	return nil
}

// RegisterClient registers the V2 EVM client implementation
func RegisterClient(client *x402.X402Client, signer ClientEvmSigner, networks ...string) error {
	return Register(client, nil, nil, signer, networks)
}

// RegisterFacilitator registers the V2 EVM facilitator implementation
func RegisterFacilitator(facilitator *x402.X402Facilitator, signer FacilitatorEvmSigner, networks ...string) error {
	return Register(nil, facilitator, nil, signer, networks)
}

// RegisterServer returns the option to register the V2 EVM server implementation
func RegisterServer(networks ...string) []x402.ResourceServerOption {
	evmServer := NewExactEvmServer()
	opts := []x402.ResourceServerOption{}

	if len(networks) == 0 {
		for network := range NetworkConfigs {
			networks = append(networks, network)
		}
	}

	for _, network := range networks {
		if IsValidNetwork(network) {
			opts = append(opts, x402.WithSchemeServer(x402.Network(network), evmServer))
		}
	}

	return opts
}

// CreateExactPayload is a helper to create a V2 exact EVM payment payload
// Bridge helper: keeps struct API, marshals internally
func CreateExactPayload(
	ctx context.Context,
	signer ClientEvmSigner,
	requirements x402.PaymentRequirements,
	version int,
) (x402.PartialPaymentPayload, error) {
	client := NewExactEvmClient(signer)

	// Marshal requirements to bytes
	reqBytes, err := json.Marshal(requirements)
	if err != nil {
		return x402.PartialPaymentPayload{}, err
	}

	// Call bytes-based method
	payloadBytes, err := client.CreatePaymentPayload(ctx, version, reqBytes)
	if err != nil {
		return x402.PartialPaymentPayload{}, err
	}

	// Unmarshal back to struct
	var partial x402.PartialPaymentPayload
	json.Unmarshal(payloadBytes, &partial)
	return partial, nil
}

// VerifyExactPayload is a helper to verify a V2 exact EVM payment payload
// Bridge helper: keeps struct API, marshals internally
func VerifyExactPayload(
	ctx context.Context,
	signer FacilitatorEvmSigner,
	payload x402.PaymentPayload,
	requirements x402.PaymentRequirements,
) (x402.VerifyResponse, error) {
	facilitator := NewExactEvmFacilitator(signer)

	// Marshal to bytes
	payloadBytes, _ := json.Marshal(payload)
	requirementsBytes, _ := json.Marshal(requirements)

	// Call bytes-based method
	return facilitator.Verify(ctx, payload.X402Version, payloadBytes, requirementsBytes)
}

// SettleExactPayload is a helper to settle a V2 exact EVM payment payload
// Bridge helper: keeps struct API, marshals internally
func SettleExactPayload(
	ctx context.Context,
	signer FacilitatorEvmSigner,
	payload x402.PaymentPayload,
	requirements x402.PaymentRequirements,
) (x402.SettleResponse, error) {
	facilitator := NewExactEvmFacilitator(signer)

	// Marshal to bytes
	payloadBytes, _ := json.Marshal(payload)
	requirementsBytes, _ := json.Marshal(requirements)

	// Call bytes-based method
	return facilitator.Settle(ctx, payload.X402Version, payloadBytes, requirementsBytes)
}
