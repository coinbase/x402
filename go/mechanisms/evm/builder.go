package evm

import (
	x402 "github.com/coinbase/x402/go"
)

// V1Networks contains all supported V1 EVM networks
// Note: Defined here to avoid import cycles with v1 package
var V1Networks = []string{
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

// EvmClientConfig holds configuration for creating an EVM x402 client
type EvmClientConfig struct {
	// The EVM signer to use for creating payment payloads
	Signer ClientEvmSigner
	// Custom payment requirements selector (optional)
	PaymentRequirementsSelector x402.PaymentRequirementsSelector
	// Policies to apply to the client (optional)
	Policies []x402.PaymentPolicy
	// NewEvmClientV1 factory function (optional - allows injection to avoid import cycles)
	// If nil, V1 support will not be registered
	NewEvmClientV1 func(ClientEvmSigner) x402.SchemeNetworkClient
}

// NewEvmClient creates an x402Client configured for EVM payments
//
// Registers:
// - V2: eip155:* wildcard scheme with ExactEvmClient
// - V1: All supported EVM networks with ExactEvmClientV1 (if NewEvmClientV1 factory provided)
//
// Example:
//
//	import evmv1 "github.com/coinbase/x402/go/mechanisms/evm/v1"
//
//	client := evm.NewEvmClient(evm.EvmClientConfig{
//	    Signer: myEvmSigner,
//	    NewEvmClientV1: func(s evm.ClientEvmSigner) x402.SchemeNetworkClient {
//	        return evmv1.NewExactEvmClientV1(s)
//	    },
//	})
func NewEvmClient(config EvmClientConfig) *x402.X402Client {
	// Build client options
	opts := []x402.ClientOption{}

	if config.PaymentRequirementsSelector != nil {
		opts = append(opts, x402.WithPaymentSelector(config.PaymentRequirementsSelector))
	}

	for _, policy := range config.Policies {
		opts = append(opts, x402.WithPolicy(policy))
	}

	client := x402.Newx402Client(opts...)

	// Register V2 wildcard scheme
	evmClient := NewExactEvmClient(config.Signer)
	client.RegisterScheme("eip155:*", evmClient)

	// Register all V1 networks if factory provided
	if config.NewEvmClientV1 != nil {
		evmClientV1 := config.NewEvmClientV1(config.Signer)
		for _, network := range V1Networks {
			client.RegisterSchemeV1(x402.Network(network), evmClientV1)
		}
	}

	return client
}
