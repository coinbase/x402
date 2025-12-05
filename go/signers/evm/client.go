package evm

import (
	"context"
	"crypto/ecdsa"
	"fmt"
	"strings"

	"github.com/ethereum/go-ethereum/common"
	"github.com/ethereum/go-ethereum/common/math"
	"github.com/ethereum/go-ethereum/crypto"
	"github.com/ethereum/go-ethereum/signer/core/apitypes"

	x402evm "github.com/coinbase/x402/go/mechanisms/evm"
)

// ClientSigner implements x402evm.ClientEvmSigner using an ECDSA private key.
// This provides client-side EIP-712 signing for creating payment payloads.
type ClientSigner struct {
	privateKey *ecdsa.PrivateKey
	address    common.Address
}

// NewClientSignerFromPrivateKey creates a client signer from a hex-encoded private key.
//
// Args:
//
//	privateKeyHex: Hex-encoded private key (with or without "0x" prefix)
//
// Returns:
//
//	ClientEvmSigner implementation ready for use with evm.NewExactEvmClient()
//	Error if private key is invalid
//
// Example:
//
//	signer, err := evm.NewClientSignerFromPrivateKey("0x1234...")
//	if err != nil {
//	    log.Fatal(err)
//	}
//	client := x402.Newx402Client().
//	    Register("eip155:*", evm.NewExactEvmClient(signer))
func NewClientSignerFromPrivateKey(privateKeyHex string) (x402evm.ClientEvmSigner, error) {
	// Strip 0x prefix if present
	privateKeyHex = strings.TrimPrefix(privateKeyHex, "0x")

	// Parse hex string to ECDSA private key
	privateKey, err := crypto.HexToECDSA(privateKeyHex)
	if err != nil {
		return nil, fmt.Errorf("invalid private key: %w", err)
	}

	// Derive Ethereum address from public key
	address := crypto.PubkeyToAddress(privateKey.PublicKey)

	return &ClientSigner{
		privateKey: privateKey,
		address:    address,
	}, nil
}

// Address returns the Ethereum address of the signer.
func (s *ClientSigner) Address() string {
	return s.address.Hex()
}

// SignTypedData signs EIP-712 typed data.
//
// Args:
//
//	ctx: Context for cancellation and timeout control
//	domain: EIP-712 domain separator
//	types: Type definitions for the structured data
//	primaryType: The primary type being signed
//	message: The message data to sign
//
// Returns:
//
//	65-byte signature (r, s, v)
//	Error if signing fails
func (s *ClientSigner) SignTypedData(
	ctx context.Context,
	domain x402evm.TypedDataDomain,
	types map[string][]x402evm.TypedDataField,
	primaryType string,
	message map[string]interface{},
) ([]byte, error) {
	// Convert x402 types to go-ethereum apitypes
	typedData := apitypes.TypedData{
		Types:       make(apitypes.Types),
		PrimaryType: primaryType,
		Domain: apitypes.TypedDataDomain{
			Name:              domain.Name,
			Version:           domain.Version,
			ChainId:           (*math.HexOrDecimal256)(domain.ChainID),
			VerifyingContract: domain.VerifyingContract,
		},
		Message: message,
	}

	// Convert field types
	for typeName, fields := range types {
		typedFields := make([]apitypes.Type, len(fields))
		for i, field := range fields {
			typedFields[i] = apitypes.Type{
				Name: field.Name,
				Type: field.Type,
			}
		}
		typedData.Types[typeName] = typedFields
	}

	// Add EIP712Domain type if not present
	if _, exists := typedData.Types["EIP712Domain"]; !exists {
		typedData.Types["EIP712Domain"] = []apitypes.Type{
			{Name: "name", Type: "string"},
			{Name: "version", Type: "string"},
			{Name: "chainId", Type: "uint256"},
			{Name: "verifyingContract", Type: "address"},
		}
	}

	// Hash the struct data
	dataHash, err := typedData.HashStruct(typedData.PrimaryType, typedData.Message)
	if err != nil {
		return nil, fmt.Errorf("failed to hash struct: %w", err)
	}

	// Hash the domain
	domainSeparator, err := typedData.HashStruct("EIP712Domain", typedData.Domain.Map())
	if err != nil {
		return nil, fmt.Errorf("failed to hash domain: %w", err)
	}

	// Create EIP-712 digest: 0x19 0x01 <domainSeparator> <dataHash>
	rawData := []byte{0x19, 0x01}
	rawData = append(rawData, domainSeparator...)
	rawData = append(rawData, dataHash...)
	digest := crypto.Keccak256(rawData)

	// Sign the digest with ECDSA
	signature, err := crypto.Sign(digest, s.privateKey)
	if err != nil {
		return nil, fmt.Errorf("failed to sign: %w", err)
	}

	// Adjust v value for Ethereum (recovery ID 0/1 → 27/28)
	signature[64] += 27

	return signature, nil
}
