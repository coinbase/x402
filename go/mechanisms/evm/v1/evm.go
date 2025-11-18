// Package v1 provides the V1 implementation of the EVM mechanism for x402
package v1

import (
	x402 "github.com/coinbase/x402/go"
	"github.com/coinbase/x402/go/mechanisms/evm"
)

// NETWORKS contains all supported V1 EVM networks
var NETWORKS = []string{
	"abstract",
	"abstract-testnet",
	"base-sepolia",
	"base",
	"avalanche-fuji",
	"avalanche",
	"iotex",
	"sei",
	"sei-testnet",
	"polygon",
	"polygon-amoy",
	"peaq",
	"story",
	"educhain",
	"skale-base-sepolia",
}

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

// RegisterServer returns the option to register the V1 EVM server with an x402ResourceServer
func RegisterServer() x402.ResourceServerOption {
	evmServer := NewExactEvmServerV1()
	return x402.WithSchemeServer(evm.SchemeExact, evmServer)
}
