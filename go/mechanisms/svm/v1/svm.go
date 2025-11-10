// Package v1 provides the V1 implementation of the SVM (Solana) mechanism for x402
package v1

import (
	x402 "github.com/coinbase/x402/go"
	svm "github.com/coinbase/x402/go/mechanisms/svm"
)

// RegisterClient registers the V1 SVM client with an x402Client
func RegisterClient(client *x402.X402Client, signer svm.ClientSvmSigner, networks ...string) *x402.X402Client {
	svmClient := NewExactSvmClientV1(signer, nil)

	// If no networks specified, register all
	if len(networks) == 0 {
		networks = []string{
			svm.SolanaMainnetV1,
			svm.SolanaDevnetV1,
			svm.SolanaTestnetV1,
		}
	}

	for _, network := range networks {
		if svm.IsValidNetwork(network) {
			client.RegisterSchemeV1(x402.Network(network), svmClient)
		}
	}

	return client
}

// RegisterFacilitator registers the V1 SVM facilitator with an x402Facilitator
func RegisterFacilitator(facilitator *x402.X402Facilitator, signer svm.FacilitatorSvmSigner, networks ...string) *x402.X402Facilitator {
	svmFacilitator := NewExactSvmFacilitatorV1(signer)

	// If no networks specified, register all
	if len(networks) == 0 {
		networks = []string{
			svm.SolanaMainnetV1,
			svm.SolanaDevnetV1,
			svm.SolanaTestnetV1,
		}
	}

	for _, network := range networks {
		if svm.IsValidNetwork(network) {
			facilitator.RegisterSchemeV1(x402.Network(network), svmFacilitator)
		}
	}

	return facilitator
}
