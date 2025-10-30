package evm

import (
	"context"
	"fmt"
	"math/big"
	"time"

	x402 "github.com/coinbase/x402-go/v2"
)

// ExactEvmClient implements the SchemeNetworkClient interface for EVM exact payments (V2)
type ExactEvmClient struct {
	signer ClientEvmSigner
}

// NewExactEvmClient creates a new ExactEvmClient
func NewExactEvmClient(signer ClientEvmSigner) *ExactEvmClient {
	return &ExactEvmClient{
		signer: signer,
	}
}

// Scheme returns the scheme identifier
func (c *ExactEvmClient) Scheme() string {
	return SchemeExact
}

// CreatePaymentPayload creates a payment payload for the exact scheme (V2)
func (c *ExactEvmClient) CreatePaymentPayload(
	ctx context.Context,
	version int,
	requirements x402.PaymentRequirements,
) (x402.PaymentPayload, error) {
	// V2 specific: only handle version 2
	if version != 2 {
		return x402.PaymentPayload{}, fmt.Errorf("v2 only supports x402 version 2")
	}

	// Validate network
	networkStr := string(requirements.Network)
	if !IsValidNetwork(networkStr) {
		return x402.PaymentPayload{}, fmt.Errorf("unsupported network: %s", requirements.Network)
	}

	// Get network configuration
	config, err := GetNetworkConfig(networkStr)
	if err != nil {
		return x402.PaymentPayload{}, err
	}

	// Get asset info
	assetInfo, err := GetAssetInfo(networkStr, requirements.Asset)
	if err != nil {
		return x402.PaymentPayload{}, err
	}

	// Requirements.Amount is already in the smallest unit
	value, ok := new(big.Int).SetString(requirements.Amount, 10)
	if !ok {
		return x402.PaymentPayload{}, fmt.Errorf("invalid amount: %s", requirements.Amount)
	}

	// Create nonce
	nonce, err := CreateNonce()
	if err != nil {
		return x402.PaymentPayload{}, err
	}

	// V2 specific: No buffer on validAfter (can use immediately)
	validAfter, validBefore := CreateValidityWindow(time.Hour)

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
	authorization := ExactEIP3009Authorization{
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
		return x402.PaymentPayload{}, fmt.Errorf("failed to sign authorization: %w", err)
	}

	// Create payload
	evmPayload := &ExactEIP3009Payload{
		Signature:     BytesToHex(signature),
		Authorization: authorization,
	}

	// Convert to PaymentPayload
	payload := x402.PaymentPayload{
		X402Version: version,
		Scheme:      SchemeExact,
		Network:     requirements.Network,
		Payload:     evmPayload.ToMap(),
	}

	// V2 specific: Set Accepted field
	if version == 2 {
		payload.Accepted = requirements
	}

	return payload, nil
}

// signAuthorization signs the EIP-3009 authorization using EIP-712
func (c *ExactEvmClient) signAuthorization(
	ctx context.Context,
	authorization ExactEIP3009Authorization,
	chainID *big.Int,
	verifyingContract string,
	tokenName string,
	tokenVersion string,
) ([]byte, error) {
	// Create EIP-712 domain
	domain := TypedDataDomain{
		Name:              tokenName,
		Version:           tokenVersion,
		ChainID:           chainID,
		VerifyingContract: verifyingContract,
	}

	// Define EIP-712 types
	types := map[string][]TypedDataField{
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
	nonceBytes, _ := HexToBytes(authorization.Nonce)

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
