package evm

import (
	"context"
	"fmt"
	"math/big"
	"strings"

	x402 "github.com/coinbase/x402/go"
)

// ExactEvmFacilitator implements the SchemeNetworkFacilitator interface for EVM exact payments (V2)
type ExactEvmFacilitator struct {
	signer FacilitatorEvmSigner
}

// NewExactEvmFacilitator creates a new ExactEvmFacilitator
func NewExactEvmFacilitator(signer FacilitatorEvmSigner) *ExactEvmFacilitator {
	return &ExactEvmFacilitator{
		signer: signer,
	}
}

// Scheme returns the scheme identifier
func (f *ExactEvmFacilitator) Scheme() string {
	return SchemeExact
}

// Verify verifies a payment payload against requirements (V2)
func (f *ExactEvmFacilitator) Verify(
	ctx context.Context,
	payload x402.PaymentPayload,
	requirements x402.PaymentRequirements,
) (x402.VerifyResponse, error) {
	// V2 specific: only handle version 2
	if payload.X402Version != 2 {
		return x402.VerifyResponse{
			IsValid:       false,
			InvalidReason: "v2 only supports x402 version 2",
		}, nil
	}

	// Validate scheme
	if payload.Scheme != SchemeExact {
		return x402.VerifyResponse{
			IsValid:       false,
			InvalidReason: "invalid scheme",
		}, nil
	}

	// Validate network
	if payload.Network != requirements.Network {
		return x402.VerifyResponse{
			IsValid:       false,
			InvalidReason: "network mismatch",
		}, nil
	}

	// Parse EVM payload
	evmPayload, err := PayloadFromMap(payload.Payload)
	if err != nil {
		return x402.VerifyResponse{
			IsValid:       false,
			InvalidReason: fmt.Sprintf("invalid payload: %v", err),
		}, nil
	}

	// Validate signature exists
	if evmPayload.Signature == "" {
		return x402.VerifyResponse{
			IsValid:       false,
			InvalidReason: "missing signature",
		}, nil
	}

	// Get network configuration
	networkStr := string(requirements.Network)
	config, err := GetNetworkConfig(networkStr)
	if err != nil {
		return x402.VerifyResponse{}, err
	}

	// Get asset info
	assetInfo, err := GetAssetInfo(networkStr, requirements.Asset)
	if err != nil {
		return x402.VerifyResponse{}, err
	}

	// Validate authorization matches requirements
	if !strings.EqualFold(evmPayload.Authorization.To, requirements.PayTo) {
		return x402.VerifyResponse{
			IsValid:       false,
			InvalidReason: "recipient mismatch",
		}, nil
	}

	// Parse and validate amount
	authValue, ok := new(big.Int).SetString(evmPayload.Authorization.Value, 10)
	if !ok {
		return x402.VerifyResponse{
			IsValid:       false,
			InvalidReason: "invalid authorization value",
		}, nil
	}

	// Requirements.Amount is already in the smallest unit
	requiredValue, ok := new(big.Int).SetString(requirements.Amount, 10)
	if !ok {
		return x402.VerifyResponse{
			IsValid:       false,
			InvalidReason: fmt.Sprintf("invalid required amount: %s", requirements.Amount),
		}, nil
	}

	if authValue.Cmp(requiredValue) < 0 {
		return x402.VerifyResponse{
			IsValid:       false,
			InvalidReason: "insufficient amount",
		}, nil
	}

	// Check if nonce has been used
	nonceUsed, err := f.checkNonceUsed(ctx, evmPayload.Authorization.From, evmPayload.Authorization.Nonce, assetInfo.Address)
	if err != nil {
		return x402.VerifyResponse{}, fmt.Errorf("failed to check nonce: %w", err)
	}
	if nonceUsed {
		return x402.VerifyResponse{
			IsValid:       false,
			InvalidReason: "nonce already used",
		}, nil
	}

	// Check balance
	balance, err := f.signer.GetBalance(evmPayload.Authorization.From, assetInfo.Address)
	if err != nil {
		return x402.VerifyResponse{}, fmt.Errorf("failed to get balance: %w", err)
	}
	if balance.Cmp(authValue) < 0 {
		return x402.VerifyResponse{
			IsValid:       false,
			InvalidReason: "insufficient balance",
		}, nil
	}

	// Extract token info from requirements
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

	// Verify signature
	signatureBytes, err := HexToBytes(evmPayload.Signature)
	if err != nil {
		return x402.VerifyResponse{
			IsValid:       false,
			InvalidReason: "invalid signature format",
		}, nil
	}

	valid, err := f.verifySignature(
		ctx,
		evmPayload.Authorization,
		signatureBytes,
		config.ChainID,
		assetInfo.Address,
		tokenName,
		tokenVersion,
	)
	if err != nil {
		return x402.VerifyResponse{}, fmt.Errorf("failed to verify signature: %w", err)
	}

	if !valid {
		return x402.VerifyResponse{
			IsValid:       false,
			InvalidReason: "invalid signature",
		}, nil
	}

	return x402.VerifyResponse{
		IsValid: true,
		Payer:   evmPayload.Authorization.From,
	}, nil
}

// Settle settles a payment on-chain (V2)
func (f *ExactEvmFacilitator) Settle(
	ctx context.Context,
	payload x402.PaymentPayload,
	requirements x402.PaymentRequirements,
) (x402.SettleResponse, error) {
	// First verify the payment
	verifyResp, err := f.Verify(ctx, payload, requirements)
	if err != nil {
		return x402.SettleResponse{}, err
	}
	if !verifyResp.IsValid {
		return x402.SettleResponse{
			Success:     false,
			ErrorReason: verifyResp.InvalidReason,
			Network:     payload.Network,
		}, nil
	}

	// Parse EVM payload
	evmPayload, err := PayloadFromMap(payload.Payload)
	if err != nil {
		return x402.SettleResponse{
			Success:     false,
			ErrorReason: fmt.Sprintf("invalid payload: %v", err),
		}, nil
	}

	// Get asset info
	networkStr := string(requirements.Network)
	assetInfo, err := GetAssetInfo(networkStr, requirements.Asset)
	if err != nil {
		return x402.SettleResponse{}, err
	}

	// Parse signature components (v, r, s)
	signatureBytes, err := HexToBytes(evmPayload.Signature)
	if err != nil {
		return x402.SettleResponse{
			Success:     false,
			ErrorReason: "invalid signature format",
		}, nil
	}

	if len(signatureBytes) != 65 {
		return x402.SettleResponse{
			Success:     false,
			ErrorReason: "invalid signature length",
		}, nil
	}

	r := signatureBytes[0:32]
	s := signatureBytes[32:64]
	v := signatureBytes[64]

	// Parse values
	value, _ := new(big.Int).SetString(evmPayload.Authorization.Value, 10)
	validAfter, _ := new(big.Int).SetString(evmPayload.Authorization.ValidAfter, 10)
	validBefore, _ := new(big.Int).SetString(evmPayload.Authorization.ValidBefore, 10)
	nonceBytes, _ := HexToBytes(evmPayload.Authorization.Nonce)

	// Execute transferWithAuthorization
	txHash, err := f.signer.WriteContract(
		assetInfo.Address,
		TransferWithAuthorizationABI,
		FunctionTransferWithAuthorization,
		evmPayload.Authorization.From,
		evmPayload.Authorization.To,
		value,
		validAfter,
		validBefore,
		[32]byte(nonceBytes),
		v,
		[32]byte(r),
		[32]byte(s),
	)
	if err != nil {
		return x402.SettleResponse{
			Success:     false,
			ErrorReason: fmt.Sprintf("failed to execute transfer: %v", err),
		}, nil
	}

	// Wait for transaction confirmation
	receipt, err := f.signer.WaitForTransactionReceipt(txHash)
	if err != nil {
		return x402.SettleResponse{
			Success:     false,
			ErrorReason: fmt.Sprintf("failed to get receipt: %v", err),
		}, nil
	}

	if receipt.Status != TxStatusSuccess {
		return x402.SettleResponse{
			Success:     false,
			ErrorReason: "transaction failed",
			Transaction: txHash,
		}, nil
	}

	return x402.SettleResponse{
		Success:     true,
		Transaction: txHash,
		Network:     payload.Network,
		Payer:       evmPayload.Authorization.From,
	}, nil
}

// checkNonceUsed checks if a nonce has already been used
func (f *ExactEvmFacilitator) checkNonceUsed(ctx context.Context, from string, nonce string, tokenAddress string) (bool, error) {
	nonceBytes, err := HexToBytes(nonce)
	if err != nil {
		return false, err
	}

	result, err := f.signer.ReadContract(
		tokenAddress,
		TransferWithAuthorizationABI,
		FunctionAuthorizationState,
		from,
		[32]byte(nonceBytes),
	)
	if err != nil {
		return false, err
	}

	used, ok := result.(bool)
	if !ok {
		return false, fmt.Errorf("unexpected result type from authorizationState")
	}

	return used, nil
}

// verifySignature verifies the EIP-712 signature
func (f *ExactEvmFacilitator) verifySignature(
	ctx context.Context,
	authorization ExactEIP3009Authorization,
	signature []byte,
	chainID *big.Int,
	verifyingContract string,
	tokenName string,
	tokenVersion string,
) (bool, error) {
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

	// Verify the signature
	return f.signer.VerifyTypedData(
		authorization.From,
		domain,
		types,
		"TransferWithAuthorization",
		message,
		signature,
	)
}
