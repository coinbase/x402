package v1

import (
	"context"
	"fmt"
	"math/big"
	"strings"
	"time"

	x402 "github.com/coinbase/x402/go"
	"github.com/coinbase/x402/go/mechanisms/evm"
)

// ExactEvmFacilitatorV1 implements the SchemeNetworkFacilitator interface for EVM exact payments (V1)
type ExactEvmFacilitatorV1 struct {
	signer evm.FacilitatorEvmSigner
}

// NewExactEvmFacilitatorV1 creates a new ExactEvmFacilitatorV1
func NewExactEvmFacilitatorV1(signer evm.FacilitatorEvmSigner) *ExactEvmFacilitatorV1 {
	return &ExactEvmFacilitatorV1{
		signer: signer,
	}
}

// Scheme returns the scheme identifier
func (f *ExactEvmFacilitatorV1) Scheme() string {
	return evm.SchemeExact
}

// Verify verifies a payment payload against requirements (V1)
func (f *ExactEvmFacilitatorV1) Verify(
	ctx context.Context,
	payload x402.PaymentPayload,
	requirements x402.PaymentRequirements,
) (x402.VerifyResponse, error) {
	// V1 specific: only handle version 1
	if payload.X402Version != 1 {
		return x402.VerifyResponse{
			IsValid:       false,
			InvalidReason: "v1 only supports x402 version 1",
		}, nil
	}

	// Validate scheme
	if payload.Accepted.Scheme != evm.SchemeExact || requirements.Scheme != evm.SchemeExact {
		return x402.VerifyResponse{
			IsValid:       false,
			InvalidReason: "unsupported_scheme",
		}, nil
	}

	// Validate network
	if payload.Accepted.Network != requirements.Network {
		return x402.VerifyResponse{
			IsValid:       false,
			InvalidReason: "network_mismatch",
		}, nil
	}

	// Parse EVM payload
	evmPayload, err := evm.PayloadFromMap(payload.Payload)
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
	config, err := evm.GetNetworkConfig(networkStr)
	if err != nil {
		return x402.VerifyResponse{}, err
	}

	// Get asset info
	assetInfo, err := evm.GetAssetInfo(networkStr, requirements.Asset)
	if err != nil {
		return x402.VerifyResponse{}, err
	}

	// Check EIP-712 domain parameters
	if requirements.Extra == nil || requirements.Extra["name"] == nil || requirements.Extra["version"] == nil {
		return x402.VerifyResponse{
			IsValid:       false,
			InvalidReason: "missing_eip712_domain",
			Payer:         evmPayload.Authorization.From,
		}, nil
	}

	// Validate authorization matches requirements
	if !strings.EqualFold(evmPayload.Authorization.To, requirements.PayTo) {
		return x402.VerifyResponse{
			IsValid:       false,
			InvalidReason: "invalid_exact_evm_payload_recipient_mismatch",
			Payer:         evmPayload.Authorization.From,
		}, nil
	}

	// Parse and validate amount
	authValue, ok := new(big.Int).SetString(evmPayload.Authorization.Value, 10)
	if !ok || evmPayload.Authorization.Value == "" {
		return x402.VerifyResponse{
			IsValid:       false,
			InvalidReason: fmt.Sprintf("invalid authorization value: %s", evmPayload.Authorization.Value),
			Payer:         evmPayload.Authorization.From,
		}, nil
	}

	// V1: Use MaxAmountRequired if present, fallback to Amount
	amountStr := requirements.MaxAmountRequired
	if amountStr == "" {
		amountStr = requirements.Amount
	}

	requiredValue, ok := new(big.Int).SetString(amountStr, 10)
	if !ok {
		return x402.VerifyResponse{
			IsValid:       false,
			InvalidReason: fmt.Sprintf("invalid required amount: %s", amountStr),
			Payer:         evmPayload.Authorization.From,
		}, nil
	}

	if authValue.Cmp(requiredValue) < 0 {
		return x402.VerifyResponse{
			IsValid:       false,
			InvalidReason: "invalid_exact_evm_payload_authorization_value",
			Payer:         evmPayload.Authorization.From,
		}, nil
	}

	// V1 specific: Check validBefore is in the future (with 6 second buffer for block time)
	now := time.Now().Unix()
	validBefore, _ := new(big.Int).SetString(evmPayload.Authorization.ValidBefore, 10)
	if validBefore.Cmp(big.NewInt(now+6)) < 0 {
		return x402.VerifyResponse{
			IsValid:       false,
			InvalidReason: "invalid_exact_evm_payload_authorization_valid_before",
			Payer:         evmPayload.Authorization.From,
		}, nil
	}

	// V1 specific: Check validAfter is not in the future
	validAfter, _ := new(big.Int).SetString(evmPayload.Authorization.ValidAfter, 10)
	if validAfter.Cmp(big.NewInt(now)) > 0 {
		return x402.VerifyResponse{
			IsValid:       false,
			InvalidReason: "invalid_exact_evm_payload_authorization_valid_after",
			Payer:         evmPayload.Authorization.From,
		}, nil
	}

	// Check balance
	balance, err := f.signer.GetBalance(evmPayload.Authorization.From, assetInfo.Address)
	if err == nil && balance.Cmp(requiredValue) < 0 {
		return x402.VerifyResponse{
			IsValid:       false,
			InvalidReason: "insufficient_funds",
			Payer:         evmPayload.Authorization.From,
		}, nil
	}

	// Extract token info from requirements
	tokenName := requirements.Extra["name"].(string)
	tokenVersion := requirements.Extra["version"].(string)

	// Verify signature
	signatureBytes, err := evm.HexToBytes(evmPayload.Signature)
	if err != nil {
		return x402.VerifyResponse{
			IsValid:       false,
			InvalidReason: "invalid signature format",
			Payer:         evmPayload.Authorization.From,
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
			InvalidReason: "invalid_exact_evm_payload_signature",
			Payer:         evmPayload.Authorization.From,
		}, nil
	}

	return x402.VerifyResponse{
		IsValid: true,
		Payer:   evmPayload.Authorization.From,
	}, nil
}

// Settle settles a payment on-chain (V1)
func (f *ExactEvmFacilitatorV1) Settle(
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
			Network:     payload.Accepted.Network,
		}, nil
	}

	// Parse EVM payload
	evmPayload, err := evm.PayloadFromMap(payload.Payload)
	if err != nil {
		return x402.SettleResponse{
			Success:     false,
			ErrorReason: fmt.Sprintf("invalid payload: %v", err),
			Network:     payload.Accepted.Network,
		}, nil
	}

	// Get asset info
	networkStr := string(requirements.Network)
	assetInfo, err := evm.GetAssetInfo(networkStr, requirements.Asset)
	if err != nil {
		return x402.SettleResponse{}, err
	}

	// Parse signature components (v, r, s)
	signatureBytes, err := evm.HexToBytes(evmPayload.Signature)
	if err != nil {
		return x402.SettleResponse{
			Success:     false,
			ErrorReason: "invalid signature format",
			Network:     payload.Accepted.Network,
		}, nil
	}

	if len(signatureBytes) != 65 {
		return x402.SettleResponse{
			Success:     false,
			ErrorReason: "invalid signature length",
			Network:     payload.Accepted.Network,
		}, nil
	}

	r := signatureBytes[0:32]
	s := signatureBytes[32:64]
	v := signatureBytes[64]

	// Parse values
	value, _ := new(big.Int).SetString(evmPayload.Authorization.Value, 10)
	validAfter, _ := new(big.Int).SetString(evmPayload.Authorization.ValidAfter, 10)
	validBefore, _ := new(big.Int).SetString(evmPayload.Authorization.ValidBefore, 10)
	nonceBytes, _ := evm.HexToBytes(evmPayload.Authorization.Nonce)

	// Execute transferWithAuthorization
	txHash, err := f.signer.WriteContract(
		assetInfo.Address,
		evm.TransferWithAuthorizationABI,
		evm.FunctionTransferWithAuthorization,
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
			ErrorReason: fmt.Sprintf("transaction_failed: %v", err),
			Network:     payload.Accepted.Network,
			Payer:       evmPayload.Authorization.From,
		}, nil
	}

	// Wait for transaction confirmation
	receipt, err := f.signer.WaitForTransactionReceipt(txHash)
	if err != nil {
		return x402.SettleResponse{
			Success:     false,
			ErrorReason: fmt.Sprintf("failed to get receipt: %v", err),
			Transaction: txHash,
			Network:     payload.Accepted.Network,
			Payer:       evmPayload.Authorization.From,
		}, nil
	}

	if receipt.Status != evm.TxStatusSuccess {
		return x402.SettleResponse{
			Success:     false,
			ErrorReason: "invalid_transaction_state",
			Transaction: txHash,
			Network:     payload.Accepted.Network,
			Payer:       evmPayload.Authorization.From,
		}, nil
	}

	return x402.SettleResponse{
		Success:     true,
		Transaction: txHash,
		Network:     payload.Accepted.Network,
		Payer:       evmPayload.Authorization.From,
	}, nil
}

// verifySignature verifies the EIP-712 signature
func (f *ExactEvmFacilitatorV1) verifySignature(
	ctx context.Context,
	authorization evm.ExactEIP3009Authorization,
	signature []byte,
	chainID *big.Int,
	verifyingContract string,
	tokenName string,
	tokenVersion string,
) (bool, error) {
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
