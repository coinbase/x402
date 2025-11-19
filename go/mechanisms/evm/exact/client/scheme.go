package client

import (
	"context"
	"encoding/json"
	"fmt"
	"math/big"
	"time"

	"github.com/coinbase/x402/go/mechanisms/evm"
	"github.com/coinbase/x402/go/types"
)

// ExactEvmScheme implements the SchemeNetworkClient interface for EVM exact payments (V2)
type ExactEvmScheme struct {
	signer evm.ClientEvmSigner
}

// NewExactEvmScheme creates a new ExactEvmScheme
func NewExactEvmScheme(signer evm.ClientEvmSigner) *ExactEvmScheme {
	return &ExactEvmScheme{
		signer: signer,
	}
}

// Scheme returns the scheme identifier
func (c *ExactEvmScheme) Scheme() string {
	return evm.SchemeExact
}

// CreatePaymentPayload creates a payment payload for the exact scheme (V2)
// Returns partial payload (x402Version + payload), core wraps with accepted/resource/extensions
func (c *ExactEvmScheme) CreatePaymentPayload(
	ctx context.Context,
	version int,
	requirementsBytes []byte,
) (payloadBytes []byte, err error) {
	// Unmarshal to v2 requirements using helper
	requirements, err := types.ToPaymentRequirementsV2(requirementsBytes)
	if err != nil {
		return nil, fmt.Errorf("failed to unmarshal v2 requirements: %w", err)
	}
	// Validate network
	networkStr := requirements.Network
	if !evm.IsValidNetwork(networkStr) {
		return nil, fmt.Errorf("unsupported network: %s", requirements.Network)
	}

	// Get network configuration
	config, err := evm.GetNetworkConfig(networkStr)
	if err != nil {
		return nil, err
	}

	// Get asset info
	assetInfo, err := evm.GetAssetInfo(networkStr, requirements.Asset)
	if err != nil {
		return nil, err
	}

	// Requirements.Amount is already in the smallest unit
	value, ok := new(big.Int).SetString(requirements.Amount, 10)
	if !ok {
		return nil, fmt.Errorf("invalid amount: %s", requirements.Amount)
	}

	// Create nonce
	nonce, err := evm.CreateNonce()
	if err != nil {
		return nil, err
	}

	// V2 specific: No buffer on validAfter (can use immediately)
	validAfter, validBefore := evm.CreateValidityWindow(time.Hour)

	// Extract extra fields for EIP-3009
	tokenName := assetInfo.Name
	tokenVersion := assetInfo.Version
	if requirements.Extra != nil {
		if name, ok := requirements.Extra["name"].(string); ok {
			tokenName = name
		}
		if version, ok := requirements.Extra["version"].(string); ok {
			tokenVersion = version
		}
	}

	// Create authorization
	authorization := evm.ExactEIP3009Authorization{
		From:        c.signer.Address(),
		To:          requirements.PayTo,
		Value:       value.String(),
		ValidAfter:  validAfter.String(),
		ValidBefore: validBefore.String(),
		Nonce:       nonce,
	}

	// Sign the authorization
	signature, err := c.signAuthorization(ctx, authorization, config.ChainID, assetInfo.Address, tokenName, tokenVersion)
	if err != nil {
		return nil, fmt.Errorf("failed to sign authorization: %w", err)
	}

	// Create EVM payload
	evmPayload := &evm.ExactEIP3009Payload{
		Signature:     evm.BytesToHex(signature),
		Authorization: authorization,
	}

	// Return PARTIAL payload (just version + payload field)
	// Core will wrap with accepted, resource, extensions
	partial := types.PayloadBase{
		X402Version: version,
		Payload:     evmPayload.ToMap(),
	}

	return json.Marshal(partial)
}

// signAuthorization signs the EIP-3009 authorization using EIP-712
func (c *ExactEvmScheme) signAuthorization(
	ctx context.Context,
	authorization evm.ExactEIP3009Authorization,
	chainID *big.Int,
	verifyingContract string,
	tokenName string,
	tokenVersion string,
) ([]byte, error) {
	// Create EIP-712 domain
	domain := evm.TypedDataDomain{
		Name:              tokenName,
		Version:           tokenVersion,
		ChainID:           chainID,
		VerifyingContract: verifyingContract,
	}

	// Define EIP-712 types
	types := map[string][]evm.TypedDataField{
		"EIP712Domain": {
			{Name: "name", Type: "string"},
			{Name: "version", Type: "string"},
			{Name: "chainId", Type: "uint256"},
			{Name: "verifyingContract", Type: "address"},
		},
		"TransferWithAuthorization": {
			{Name: "from", Type: "address"},
			{Name: "to", Type: "address"},
			{Name: "value", Type: "uint256"},
			{Name: "validAfter", Type: "uint256"},
			{Name: "validBefore", Type: "uint256"},
			{Name: "nonce", Type: "bytes32"},
		},
	}

	// Parse values for message
	value, _ := new(big.Int).SetString(authorization.Value, 10)
	validAfter, _ := new(big.Int).SetString(authorization.ValidAfter, 10)
	validBefore, _ := new(big.Int).SetString(authorization.ValidBefore, 10)
	nonceBytes, _ := evm.HexToBytes(authorization.Nonce)

	// Create message
	message := map[string]interface{}{
		"from":        authorization.From,
		"to":          authorization.To,
		"value":       value,
		"validAfter":  validAfter,
		"validBefore": validBefore,
		"nonce":       nonceBytes,
	}

	// Sign the typed data
	return c.signer.SignTypedData(domain, types, "TransferWithAuthorization", message)
}
