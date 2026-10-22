package evm

import (
	"fmt"
	"math/big"

	"github.com/ethereum/go-ethereum/accounts/abi"
	"github.com/ethereum/go-ethereum/common"
	"github.com/ethereum/go-ethereum/crypto"
)

// BuildReceiveAuthorizationMessage converts an upto authorization to the
// strongly typed values expected by EIP-712 signers and verifiers.
func BuildReceiveAuthorizationMessage(authorization UptoEIP3009Authorization) (map[string]interface{}, error) {
	if !common.IsHexAddress(authorization.From) {
		return nil, fmt.Errorf("invalid authorization from address")
	}
	if !common.IsHexAddress(authorization.To) {
		return nil, fmt.Errorf("invalid authorization to address")
	}

	value, ok := new(big.Int).SetString(authorization.Value, 10)
	if !ok || value.Sign() < 0 {
		return nil, fmt.Errorf("invalid authorization value: %s", authorization.Value)
	}
	validAfter, ok := new(big.Int).SetString(authorization.ValidAfter, 10)
	if !ok || validAfter.Sign() < 0 {
		return nil, fmt.Errorf("invalid validAfter: %s", authorization.ValidAfter)
	}
	validBefore, ok := new(big.Int).SetString(authorization.ValidBefore, 10)
	if !ok || validBefore.Sign() < 0 {
		return nil, fmt.Errorf("invalid validBefore: %s", authorization.ValidBefore)
	}
	nonce, err := parseBytes32(authorization.Nonce, "nonce")
	if err != nil {
		return nil, err
	}

	return map[string]interface{}{
		"from":        common.HexToAddress(authorization.From).Hex(),
		"to":          common.HexToAddress(authorization.To).Hex(),
		"value":       value,
		"validAfter":  validAfter,
		"validBefore": validBefore,
		"nonce":       nonce[:],
	}, nil
}

// HashReceiveAuthorization hashes an EIP-3009 ReceiveWithAuthorization message.
func HashReceiveAuthorization(
	authorization UptoEIP3009Authorization,
	chainID *big.Int,
	verifyingContract string,
	tokenName string,
	tokenVersion string,
) ([]byte, error) {
	if chainID == nil || chainID.Sign() <= 0 {
		return nil, fmt.Errorf("invalid chain ID")
	}
	if !common.IsHexAddress(verifyingContract) {
		return nil, fmt.Errorf("invalid verifying contract address")
	}
	message, err := BuildReceiveAuthorizationMessage(authorization)
	if err != nil {
		return nil, err
	}
	return HashTypedData(
		TypedDataDomain{
			Name:              tokenName,
			Version:           tokenVersion,
			ChainID:           chainID,
			VerifyingContract: common.HexToAddress(verifyingContract).Hex(),
		},
		GetReceiveAuthorizationEIP712Types(),
		"ReceiveWithAuthorization",
		message,
	)
}

// CreateUptoEIP3009Nonce computes keccak256(abi.encode(typehash, payTo, settler, salt)).
func CreateUptoEIP3009Nonce(payTo, settler, salt string) (string, error) {
	if !common.IsHexAddress(payTo) {
		return "", fmt.Errorf("invalid payTo address")
	}
	if !common.IsHexAddress(settler) {
		return "", fmt.Errorf("invalid settler address")
	}
	typehash, err := parseBytes32(UptoEIP3009NonceTypehash, "typehash")
	if err != nil {
		return "", err
	}
	saltBytes, err := parseBytes32(salt, "salt")
	if err != nil {
		return "", err
	}

	bytes32Type, err := abi.NewType("bytes32", "", nil)
	if err != nil {
		return "", err
	}
	addressType, err := abi.NewType("address", "", nil)
	if err != nil {
		return "", err
	}
	encoded, err := (abi.Arguments{
		{Type: bytes32Type},
		{Type: addressType},
		{Type: addressType},
		{Type: bytes32Type},
	}).Pack(typehash, common.HexToAddress(payTo), common.HexToAddress(settler), saltBytes)
	if err != nil {
		return "", fmt.Errorf("encode upto ERC-3009 nonce: %w", err)
	}
	return common.BytesToHash(crypto.Keccak256(encoded)).Hex(), nil
}

func parseBytes32(value, field string) ([32]byte, error) {
	var result [32]byte
	decoded, err := HexToBytes(value)
	if err != nil {
		return result, fmt.Errorf("invalid %s: %w", field, err)
	}
	if len(decoded) != len(result) {
		return result, fmt.Errorf("invalid %s length: got %d bytes, want 32", field, len(decoded))
	}
	copy(result[:], decoded)
	return result, nil
}
