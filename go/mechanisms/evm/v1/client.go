package v1

import (
	"context"
	"fmt"
	"math/big"
	"time"

	x402 "github.com/coinbase/x402-go/v2"
	"github.com/coinbase/x402-go/v2/mechanisms/evm"
)

// ExactEvmClientV1 implements the SchemeNetworkClient interface for EVM exact payments (V1)
type ExactEvmClientV1 struct {
	signer evm.ClientEvmSigner
}

// NewExactEvmClientV1 creates a new ExactEvmClientV1
func NewExactEvmClientV1(signer evm.ClientEvmSigner) *ExactEvmClientV1 {
	return &ExactEvmClientV1{
		signer: signer,
	}
}

// Scheme returns the scheme identifier
func (c *ExactEvmClientV1) Scheme() string {
	return evm.SchemeExact
}

// CreatePaymentPayload creates a payment payload for the exact scheme (V1)
func (c *ExactEvmClientV1) CreatePaymentPayload(
	ctx context.Context,
	version int,
	requirements x402.PaymentRequirements,
) (x402.PaymentPayload, error) {
	// V1 only supports version 1
	if version != 1 {
		return x402.PaymentPayload{}, fmt.Errorf("v1 only supports x402 version 1, got %d", version)
	}

	// Validate network
	networkStr := string(requirements.Network)
	if !evm.IsValidNetwork(networkStr) {
		return x402.PaymentPayload{}, fmt.Errorf("unsupported network: %s", requirements.Network)
	}

	// Get network configuration
	config, err := evm.GetNetworkConfig(networkStr)
	if err != nil {
		return x402.PaymentPayload{}, err
	}

	// Get asset info
	assetInfo, err := evm.GetAssetInfo(networkStr, requirements.Asset)
	if err != nil {
		return x402.PaymentPayload{}, err
	}

	// V1: Use MaxAmountRequired if present, fallback to Amount
	amountStr := requirements.MaxAmountRequired
	if amountStr == "" {
		amountStr = requirements.Amount
	}

	value, ok := new(big.Int).SetString(amountStr, 10)
	if !ok {
		return x402.PaymentPayload{}, fmt.Errorf("invalid amount: %s", amountStr)
	}

	// Create nonce
	nonce, err := evm.CreateNonce()
	if err != nil {
		return x402.PaymentPayload{}, err
	}

	// V1 specific: validAfter is 10 minutes before now, validBefore is 10 minutes from now
	now := time.Now().Unix()
	validAfter := big.NewInt(now - 600) // 10 minutes before
	timeout := int64(600)               // Default 10 minutes
	if requirements.MaxTimeoutSeconds > 0 {
		timeout = int64(requirements.MaxTimeoutSeconds)
	}
	validBefore := big.NewInt(now + timeout)

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
		return x402.PaymentPayload{}, fmt.Errorf("failed to sign authorization: %w", err)
	}

	// Create payload
	evmPayload := &evm.ExactEIP3009Payload{
		Signature:     evm.BytesToHex(signature),
		Authorization: authorization,
	}

	// Convert to PaymentPayload
	return x402.PaymentPayload{
		X402Version: 1,
		Scheme:      evm.SchemeExact,
		Network:     requirements.Network,
		Payload:     evmPayload.ToMap(),
	}, nil
}

// signAuthorization signs the EIP-3009 authorization using EIP-712
func (c *ExactEvmClientV1) signAuthorization(
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
