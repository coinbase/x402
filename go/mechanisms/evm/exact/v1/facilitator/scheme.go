package facilitator

import (
	"context"
	"encoding/json"
	"fmt"
	"math/big"
	"strings"
	"time"

	x402 "github.com/coinbase/x402/go"
	"github.com/coinbase/x402/go/mechanisms/evm"
	"github.com/coinbase/x402/go/types"
)

// ExactEvmSchemeV1 implements the SchemeNetworkFacilitatorV1 interface for EVM exact payments (V1)
type ExactEvmSchemeV1 struct {
	signer evm.FacilitatorEvmSigner
}

// NewExactEvmSchemeV1 creates a new ExactEvmSchemeV1
func NewExactEvmSchemeV1(signer evm.FacilitatorEvmSigner) *ExactEvmSchemeV1 {
	return &ExactEvmSchemeV1{
		signer: signer,
	}
}

// Scheme returns the scheme identifier
func (f *ExactEvmSchemeV1) Scheme() string {
	return evm.SchemeExact
}

// Verify verifies a V1 payment payload against requirements
func (f *ExactEvmSchemeV1) Verify(
	ctx context.Context,
	payload types.PaymentPayloadV1,
	requirements types.PaymentRequirementsV1,
) (*x402.VerifyResponse, error) {
	network := x402.Network(requirements.Network)

	// Validate scheme (v1 has scheme at top level)
	if payload.Scheme != evm.SchemeExact || requirements.Scheme != evm.SchemeExact {
		return nil, x402.NewVerifyError("unsupported_scheme", "", network, nil)
	}

	// Validate network (v1 has network at top level)
	if payload.Network != requirements.Network {
		return nil, x402.NewVerifyError("network_mismatch", "", network, nil)
	}

	// Parse EVM payload
	evmPayload, err := evm.PayloadFromMap(payload.Payload)
	if err != nil {
		return nil, x402.NewVerifyError("invalid_payload", "", network, err)
	}

	// Validate signature exists
	if evmPayload.Signature == "" {
		return nil, x402.NewVerifyError("missing_signature", "", network, nil)
	}

	// Get network configuration
	networkStr := string(requirements.Network)
	config, err := evm.GetNetworkConfig(networkStr)
	if err != nil {
		return nil, x402.NewVerifyError("failed_to_get_network_config", "", network, err)
	}

	// Get asset info
	assetInfo, err := evm.GetAssetInfo(networkStr, requirements.Asset)
	if err != nil {
		return nil, x402.NewVerifyError("failed_to_get_asset_info", "", network, err)
	}

	// Check EIP-712 domain parameters
	var extraMap map[string]interface{}
	if requirements.Extra != nil {
		if err := json.Unmarshal(*requirements.Extra, &extraMap); err != nil {
			return nil, x402.NewVerifyError("invalid_extra_field", evmPayload.Authorization.From, network, err)
		}
	}

	if extraMap == nil || extraMap["name"] == nil || extraMap["version"] == nil {
		return nil, x402.NewVerifyError("missing_eip712_domain", evmPayload.Authorization.From, network, nil)
	}

	// Validate authorization matches requirements
	if !strings.EqualFold(evmPayload.Authorization.To, requirements.PayTo) {
		return nil, x402.NewVerifyError("invalid_exact_evm_payload_recipient_mismatch", evmPayload.Authorization.From, network, nil)
	}

	// Parse and validate amount
	authValue, ok := new(big.Int).SetString(evmPayload.Authorization.Value, 10)
	if !ok || evmPayload.Authorization.Value == "" {
		return nil, x402.NewVerifyError("invalid_authorization_value", evmPayload.Authorization.From, network, fmt.Errorf("invalid value: %s", evmPayload.Authorization.Value))
	}

	// V1: Use MaxAmountRequired field
	amountStr := requirements.MaxAmountRequired

	requiredValue, ok := new(big.Int).SetString(amountStr, 10)
	if !ok {
		return nil, x402.NewVerifyError("invalid_required_amount", evmPayload.Authorization.From, network, fmt.Errorf("invalid amount: %s", amountStr))
	}

	if authValue.Cmp(requiredValue) < 0 {
		return nil, x402.NewVerifyError("invalid_exact_evm_payload_authorization_value", evmPayload.Authorization.From, network, nil)
	}

	// V1 specific: Check validBefore is in the future (with 6 second buffer for block time)
	now := time.Now().Unix()
	validBefore, _ := new(big.Int).SetString(evmPayload.Authorization.ValidBefore, 10)
	if validBefore.Cmp(big.NewInt(now+6)) < 0 {
		return nil, x402.NewVerifyError("invalid_exact_evm_payload_authorization_valid_before", evmPayload.Authorization.From, network, nil)
	}

	// V1 specific: Check validAfter is not in the future
	validAfter, _ := new(big.Int).SetString(evmPayload.Authorization.ValidAfter, 10)
	if validAfter.Cmp(big.NewInt(now)) > 0 {
		return nil, x402.NewVerifyError("invalid_exact_evm_payload_authorization_valid_after", evmPayload.Authorization.From, network, nil)
	}

	// Check balance
	balance, err := f.signer.GetBalance(evmPayload.Authorization.From, assetInfo.Address)
	if err == nil && balance.Cmp(requiredValue) < 0 {
		return nil, x402.NewVerifyError("insufficient_funds", evmPayload.Authorization.From, network, nil)
	}

	// Extract token info from requirements (already unmarshaled earlier)
	tokenName := extraMap["name"].(string)
	tokenVersion := extraMap["version"].(string)

	// Verify signature
	signatureBytes, err := evm.HexToBytes(evmPayload.Signature)
	if err != nil {
		return nil, x402.NewVerifyError("invalid_signature_format", evmPayload.Authorization.From, network, err)
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
		return nil, x402.NewVerifyError("failed_to_verify_signature", evmPayload.Authorization.From, network, err)
	}

	if !valid {
		return nil, x402.NewVerifyError("invalid_exact_evm_payload_signature", evmPayload.Authorization.From, network, nil)
	}

	return &x402.VerifyResponse{
		IsValid: true,
		Payer:   evmPayload.Authorization.From,
	}, nil
}

// Settle settles a V1 payment on-chain
func (f *ExactEvmSchemeV1) Settle(
	ctx context.Context,
	payload types.PaymentPayloadV1,
	requirements types.PaymentRequirementsV1,
) (*x402.SettleResponse, error) {
	network := x402.Network(payload.Network)

	// First verify the payment
	verifyResp, err := f.Verify(ctx, payload, requirements)
	if err != nil {
		// Convert VerifyError to SettleError
		if ve, ok := err.(*x402.VerifyError); ok {
			return nil, x402.NewSettleError(ve.Reason, ve.Payer, ve.Network, "", ve.Err)
		}
		return nil, x402.NewSettleError("verification_failed", "", network, "", err)
	}

	// Parse EVM payload
	evmPayload, err := evm.PayloadFromMap(payload.Payload)
	if err != nil {
		return nil, x402.NewSettleError("invalid_payload", verifyResp.Payer, network, "", err)
	}

	// Get asset info
	networkStr := string(requirements.Network)
	assetInfo, err := evm.GetAssetInfo(networkStr, requirements.Asset)
	if err != nil {
		return nil, x402.NewSettleError("failed_to_get_asset_info", verifyResp.Payer, network, "", err)
	}

	// Parse signature components (v, r, s)
	signatureBytes, err := evm.HexToBytes(evmPayload.Signature)
	if err != nil {
		return nil, x402.NewSettleError("invalid_signature_format", verifyResp.Payer, network, "", err)
	}

	if len(signatureBytes) != 65 {
		return nil, x402.NewSettleError("invalid_signature_length", verifyResp.Payer, network, "", nil)
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
		return nil, x402.NewSettleError("transaction_failed", verifyResp.Payer, network, "", err)
	}

	// Wait for transaction confirmation
	receipt, err := f.signer.WaitForTransactionReceipt(txHash)
	if err != nil {
		return nil, x402.NewSettleError("failed_to_get_receipt", verifyResp.Payer, network, txHash, err)
	}

	if receipt.Status != evm.TxStatusSuccess {
		return nil, x402.NewSettleError("invalid_transaction_state", verifyResp.Payer, network, txHash, nil)
	}

	return &x402.SettleResponse{
		Success:     true,
		Transaction: txHash,
		Network:     network,
		Payer:       verifyResp.Payer,
	}, nil
}

// verifySignature verifies the EIP-712 signature
func (f *ExactEvmSchemeV1) verifySignature(
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
