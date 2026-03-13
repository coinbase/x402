package main

import (
	x402 "github.com/coinbase/x402/go"
	evm "github.com/coinbase/x402/go/mechanisms/evm/exact/client"
	evmsigners "github.com/coinbase/x402/go/signers/evm"
)

func createMechanismHelperRegistrationClient(evmPrivateKey string) (*x402.X402Client, error) {
	evmSigner, err := evmsigners.NewClientSignerFromPrivateKey(evmPrivateKey)
	if err != nil {
		return nil, err
	}

	client := x402.Newx402Client()
	client.Register("eip155:*", evm.NewExactEvmScheme(evmSigner, nil))

	return client, nil
}
