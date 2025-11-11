package svm

import (
	x402 "github.com/coinbase/x402/go"
)

// V1Networks contains all supported V1 SVM networks
// Note: Defined here to avoid import cycles with v1 package
var V1Networks = []string{
	"solana",
	"solana-devnet",
	"solana-testnet",
}

// SvmClientConfig holds configuration for creating an SVM x402 client
type SvmClientConfig struct {
	// The SVM signer to use for creating payment payloads
	Signer ClientSvmSigner
	// Custom payment requirements selector (optional)
	PaymentRequirementsSelector x402.PaymentRequirementsSelector
	// Policies to apply to the client (optional)
	Policies []x402.PaymentPolicy
	// Custom RPC configuration (optional - uses network defaults if nil)
	ClientConfig *ClientConfig
	// NewSvmClientV1 factory function (optional - allows injection to avoid import cycles)
	// If nil, V1 support will not be registered
	NewSvmClientV1 func(ClientSvmSigner) x402.SchemeNetworkClient
}

// NewSvmClient creates an x402Client configured for SVM payments
//
// Registers:
// - V2: solana:* wildcard scheme with ExactSvmClient
// - V1: All supported SVM networks with ExactSvmClientV1 (if NewSvmClientV1 factory provided)
//
// Example:
//
//	import svmv1 "github.com/coinbase/x402/go/mechanisms/svm/v1"
//
//	client := svm.NewSvmClient(svm.SvmClientConfig{
//	    Signer: mySvmSigner,
//	    NewSvmClientV1: func(s svm.ClientSvmSigner) x402.SchemeNetworkClient {
//	        return svmv1.NewExactSvmClientV1(s)
//	    },
//	})
func NewSvmClient(config SvmClientConfig) *x402.X402Client {
	// Build client options
	opts := []x402.ClientOption{}

	if config.PaymentRequirementsSelector != nil {
		opts = append(opts, x402.WithPaymentSelector(config.PaymentRequirementsSelector))
	}

	for _, policy := range config.Policies {
		opts = append(opts, x402.WithPolicy(policy))
	}

	client := x402.Newx402Client(opts...)

	// Register V2 wildcard scheme (config is optional)
	var svmClient *ExactSvmClient
	if config.ClientConfig != nil {
		svmClient = NewExactSvmClient(config.Signer, config.ClientConfig)
	} else {
		svmClient = NewExactSvmClient(config.Signer)
	}
	client.RegisterScheme("solana:*", svmClient)

	// Register all V1 networks if factory provided
	if config.NewSvmClientV1 != nil {
		svmClientV1 := config.NewSvmClientV1(config.Signer)
		for _, network := range V1Networks {
			client.RegisterSchemeV1(x402.Network(network), svmClientV1)
		}
	}

	return client
}
