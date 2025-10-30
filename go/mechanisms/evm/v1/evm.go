// Package v1 provides the V1 implementation of the EVM mechanism for x402
package v1

import (
	x402 "github.com/coinbase/x402-go/v2"
	"github.com/coinbase/x402-go/v2/mechanisms/evm"
)

// RegisterClient registers the V1 EVM client with an x402Client
func RegisterClient(client *x402.X402Client, signer evm.ClientEvmSigner) *x402.X402Client {
	evmClient := NewExactEvmClientV1(signer)
	return client.RegisterScheme(evm.SchemeExact, evmClient)
}

// RegisterFacilitator registers the V1 EVM facilitator with an x402Facilitator
func RegisterFacilitator(facilitator *x402.X402Facilitator, signer evm.FacilitatorEvmSigner) *x402.X402Facilitator {
	evmFacilitator := NewExactEvmFacilitatorV1(signer)
	return facilitator.RegisterScheme(evm.SchemeExact, evmFacilitator)
}

// RegisterService returns the option to register the V1 EVM service with an x402ResourceService
func RegisterService() x402.ResourceServiceOption {
	evmService := NewExactEvmServiceV1()
	return x402.WithSchemeService(evm.SchemeExact, evmService)
}
