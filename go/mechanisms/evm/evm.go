// Package evm provides V2 EVM blockchain support for the x402 payment protocol.
// It implements the exact payment scheme using EIP-3009 TransferWithAuthorization.
// For V1 support, use the v1 subpackage.
package evm

import (
	"context"

	x402 "github.com/coinbase/x402/go"
)

// Register registers all V2 EVM mechanism implementations with the x402 client, facilitator, and service
func Register(
	client *x402.X402Client,
	facilitator *x402.X402Facilitator,
	service *x402.X402ResourceService,
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

	// Register with service (no signer needed)
	// Note: Service registration is done via RegisterService() which returns options
	if service != nil {
		// Service options should be passed during service creation
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

// RegisterService returns the option to register the V2 EVM service implementation
func RegisterService(networks ...string) []x402.ResourceServiceOption {
	evmService := NewExactEvmService()
	opts := []x402.ResourceServiceOption{}

	if len(networks) == 0 {
		for network := range NetworkConfigs {
			networks = append(networks, network)
		}
	}

	for _, network := range networks {
		if IsValidNetwork(network) {
			opts = append(opts, x402.WithSchemeService(x402.Network(network), evmService))
		}
	}

	return opts
}

// CreateExactPayload is a helper to create a V2 exact EVM payment payload (partial)
// Returns only x402Version and payload - use x402Client to construct full PaymentPayload
func CreateExactPayload(
	ctx context.Context,
	signer ClientEvmSigner,
	requirements x402.PaymentRequirements,
	version int,
) (x402.PartialPaymentPayload, error) {
	client := NewExactEvmClient(signer)
	return client.CreatePaymentPayload(ctx, version, requirements)
}

// VerifyExactPayload is a helper to verify a V2 exact EVM payment payload
func VerifyExactPayload(
	ctx context.Context,
	signer FacilitatorEvmSigner,
	payload x402.PaymentPayload,
	requirements x402.PaymentRequirements,
) (x402.VerifyResponse, error) {
	facilitator := NewExactEvmFacilitator(signer)
	return facilitator.Verify(ctx, payload, requirements)
}

// SettleExactPayload is a helper to settle a V2 exact EVM payment payload
func SettleExactPayload(
	ctx context.Context,
	signer FacilitatorEvmSigner,
	payload x402.PaymentPayload,
	requirements x402.PaymentRequirements,
) (x402.SettleResponse, error) {
	facilitator := NewExactEvmFacilitator(signer)
	return facilitator.Settle(ctx, payload, requirements)
}
