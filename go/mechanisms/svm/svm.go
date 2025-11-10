// Package svm provides V2 SVM (Solana Virtual Machine) blockchain support for the x402 payment protocol.
// It implements the exact payment scheme using SPL Token TransferChecked instructions.
// For V1 support, use the v1 subpackage.
package svm

import (
	x402 "github.com/coinbase/x402/go"
)

// Register registers all V2 SVM mechanism implementations with the x402 client, facilitator, and service
func Register(
	client *x402.X402Client,
	facilitator *x402.X402Facilitator,
	service *x402.X402ResourceService,
	signer interface{},
	networks []string,
) error {
	// Determine which components to register based on the signer type
	var clientSigner ClientSvmSigner
	var facilitatorSigner FacilitatorSvmSigner

	// Try to cast signer to the appropriate interfaces
	if s, ok := signer.(ClientSvmSigner); ok {
		clientSigner = s
	}
	if s, ok := signer.(FacilitatorSvmSigner); ok {
		facilitatorSigner = s
	}

	// If no specific networks provided, use all supported networks
	if len(networks) == 0 {
		networks = []string{
			SolanaMainnetCAIP2,
			SolanaDevnetCAIP2,
			SolanaTestnetCAIP2,
		}
	}

	// Register with client if we have a client signer
	if client != nil && clientSigner != nil {
		svmClient := NewExactSvmClient(clientSigner, nil)
		for _, network := range networks {
			if IsValidNetwork(network) {
				client.RegisterScheme(x402.Network(network), svmClient)
			}
		}
	}

	// Register with facilitator if we have a facilitator signer
	if facilitator != nil && facilitatorSigner != nil {
		svmFacilitator := NewExactSvmFacilitator(facilitatorSigner)
		for _, network := range networks {
			if IsValidNetwork(network) {
				facilitator.RegisterScheme(x402.Network(network), svmFacilitator)
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

// RegisterClient registers the V2 SVM client implementation
func RegisterClient(client *x402.X402Client, signer ClientSvmSigner, networks ...string) error {
	return Register(client, nil, nil, signer, networks)
}

// RegisterFacilitator registers the V2 SVM facilitator implementation
func RegisterFacilitator(facilitator *x402.X402Facilitator, signer FacilitatorSvmSigner, networks ...string) error {
	return Register(nil, facilitator, nil, signer, networks)
}

// RegisterService returns the option to register the V2 SVM service implementation
func RegisterService(networks ...string) []x402.ResourceServiceOption {
	svmService := NewExactSvmService()
	opts := []x402.ResourceServiceOption{}

	if len(networks) == 0 {
		networks = []string{
			SolanaMainnetCAIP2,
			SolanaDevnetCAIP2,
			SolanaTestnetCAIP2,
		}
	}

	for _, network := range networks {
		if IsValidNetwork(network) {
			opts = append(opts, x402.WithSchemeService(x402.Network(network), svmService))
		}
	}

	return opts
}

