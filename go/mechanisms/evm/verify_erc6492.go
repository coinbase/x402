package evm

import (
	"context"

	"github.com/ethereum/go-ethereum/common"
)

// VerifyERC6492Signature verifies an ERC-6492 counterfactual signature by calling the
// ERC-6492 UniversalSigValidator contract via eth_call (no state changes committed).
// The validator atomically simulates the factory deployment then verifies the inner
// signature using EIP-1271 isValidSignature on the resulting contract.
//
// Returns false (not an error) if the validator returns false.
// Returns false + error if the validator contract is unavailable or the call fails.
func VerifyERC6492Signature(
	ctx context.Context,
	facilitatorSigner FacilitatorEvmSigner,
	signerAddress string,
	hash [32]byte,
	signature []byte,
) (bool, error) {
	signerAddr := common.HexToAddress(signerAddress)
	result, err := facilitatorSigner.ReadContract(
		ctx,
		UniversalSigValidatorAddress,
		UniversalSigValidatorABI,
		"isValidSig",
		signerAddr,
		hash,
		signature,
	)
	if err != nil {
		return false, err
	}
	valid, ok := result.(bool)
	if !ok {
		return false, nil
	}
	return valid, nil
}
