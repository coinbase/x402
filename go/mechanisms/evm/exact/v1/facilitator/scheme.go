package facilitator

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"math/big"
	"strings"
	"time"

	"github.com/ethereum/go-ethereum/common"

	x402 "github.com/coinbase/x402/go"
	"github.com/coinbase/x402/go/mechanisms/evm"
	"github.com/coinbase/x402/go/types"
)

// ExactEvmSchemeV1Config holds configuration for the ExactEvmSchemeV1 facilitator
type ExactEvmSchemeV1Config struct {
	// DeployERC4337WithEIP6492 enables automatic deployment of ERC-4337 smart wallets
	// via EIP-6492 when encountering undeployed contract signatures during settlement
	DeployERC4337WithEIP6492 bool
}

// ExactEvmSchemeV1 implements the SchemeNetworkFacilitatorV1 interface for EVM exact payments (V1)
type ExactEvmSchemeV1 struct {
	signer evm.FacilitatorEvmSigner
	config ExactEvmSchemeV1Config
}

// NewExactEvmSchemeV1 creates a new ExactEvmSchemeV1
// Args:
//
//	signer: The EVM signer for facilitator operations
//	config: Optional configuration (nil uses defaults)
//
// Returns:
//
//	Configured ExactEvmSchemeV1 instance
func NewExactEvmSchemeV1(signer evm.FacilitatorEvmSigner, config *ExactEvmSchemeV1Config) *ExactEvmSchemeV1 {
	cfg := ExactEvmSchemeV1Config{}
	if config != nil {
		cfg = *config
	}
	return &ExactEvmSchemeV1{
		signer: signer,
		config: cfg,
	}
}

// Scheme returns the scheme identifier
func (f *ExactEvmSchemeV1) Scheme() string {
	return evm.SchemeExact
}

// CaipFamily returns the CAIP family pattern this facilitator supports
func (f *ExactEvmSchemeV1) CaipFamily() string {
	return "eip155:*"
}

// GetExtra returns mechanism-specific extra data for the supported kinds endpoint.
// For EVM, no extra data is needed.
func (f *ExactEvmSchemeV1) GetExtra(_ x402.Network) map[string]interface{} {
	return nil
}

// GetSigners returns signer addresses used by this facilitator.
// Returns all addresses this facilitator can use for signing/settling transactions.
func (f *ExactEvmSchemeV1) GetSigners(_ x402.Network) []string {
	return f.signer.GetAddresses()
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
	balance, err := f.signer.GetBalance(ctx, evmPayload.Authorization.From, assetInfo.Address)
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
		ve := &x402.VerifyError{}
		if errors.As(err, &ve) {
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

	// Parse signature
	signatureBytes, err := evm.HexToBytes(evmPayload.Signature)
	if err != nil {
		return nil, x402.NewSettleError("invalid_signature_format", verifyResp.Payer, network, "", err)
	}

	// Parse ERC-6492 signature to extract inner signature if needed
	sigData, err := evm.ParseERC6492Signature(signatureBytes)
	if err != nil {
		return nil, x402.NewSettleError("failed_to_parse_signature", verifyResp.Payer, network, "", err)
	}

	// Check if wallet needs deployment (undeployed smart wallet with ERC-6492)
	zeroFactory := [20]byte{}
	if sigData.Factory != zeroFactory && len(sigData.FactoryCalldata) > 0 {
		code, err := f.signer.GetCode(ctx, evmPayload.Authorization.From)
		if err != nil {
			return nil, x402.NewSettleError("failed_to_check_deployment", verifyResp.Payer, network, "", err)
		}

		if len(code) == 0 {
			// Wallet not deployed
			if f.config.DeployERC4337WithEIP6492 {
				// Deploy wallet
				err := f.deploySmartWallet(ctx, sigData)
				if err != nil {
					return nil, x402.NewSettleError(evm.ErrSmartWalletDeploymentFailed, verifyResp.Payer, network, "", err)
				}
			} else {
				// Deployment not enabled - fail settlement
				return nil, x402.NewSettleError(evm.ErrUndeployedSmartWallet, verifyResp.Payer, network, "", nil)
			}
		}
	}

	// Use inner signature for settlement
	signatureBytes = sigData.InnerSignature

	// Parse values
	value, _ := new(big.Int).SetString(evmPayload.Authorization.Value, 10)
	validAfter, _ := new(big.Int).SetString(evmPayload.Authorization.ValidAfter, 10)
	validBefore, _ := new(big.Int).SetString(evmPayload.Authorization.ValidBefore, 10)
	nonceBytes, _ := evm.HexToBytes(evmPayload.Authorization.Nonce)

	// Determine signature type: ECDSA (65 bytes) or smart wallet (longer)
	isECDSA := len(signatureBytes) == 65

	var txHash string
	if isECDSA {
		// For EOA wallets, use v,r,s overload
		r := signatureBytes[0:32]
		s := signatureBytes[32:64]
		v := signatureBytes[64]

		txHash, err = f.signer.WriteContract(
			ctx,
			assetInfo.Address,
			evm.TransferWithAuthorizationVRSABI,
			evm.FunctionTransferWithAuthorization,
			common.HexToAddress(evmPayload.Authorization.From),
			common.HexToAddress(evmPayload.Authorization.To),
			value,
			validAfter,
			validBefore,
			[32]byte(nonceBytes),
			v,
			[32]byte(r),
			[32]byte(s),
		)
	} else {
		// For smart wallets, use bytes signature overload
		txHash, err = f.signer.WriteContract(
			ctx,
			assetInfo.Address,
			evm.TransferWithAuthorizationBytesABI,
			evm.FunctionTransferWithAuthorization,
			common.HexToAddress(evmPayload.Authorization.From),
			common.HexToAddress(evmPayload.Authorization.To),
			value,
			validAfter,
			validBefore,
			[32]byte(nonceBytes),
			signatureBytes,
		)
	}

	if err != nil {
		return nil, x402.NewSettleError("transaction_failed", verifyResp.Payer, network, "", err)
	}

	// Wait for transaction confirmation
	receipt, err := f.signer.WaitForTransactionReceipt(ctx, txHash)
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
	// Hash the EIP-712 typed data
	hash, err := evm.HashEIP3009Authorization(
		authorization,
		chainID,
		verifyingContract,
		tokenName,
		tokenVersion,
	)
	if err != nil {
		return false, err
	}

	// Convert hash to [32]byte
	var hash32 [32]byte
	copy(hash32[:], hash)

	// Use universal verification (supports EOA, EIP-1271, and ERC-6492)
	valid, sigData, err := evm.VerifyUniversalSignature(
		ctx,
		f.signer,
		authorization.From,
		hash32,
		signature,
		true, // allowUndeployed in verify()
	)

	if err != nil {
		return false, err
	}

	// If undeployed wallet with deployment info, it will be deployed in settle()
	if sigData != nil {
		zeroFactory := [20]byte{}
		if sigData.Factory != zeroFactory {
			_, err := f.signer.GetCode(ctx, authorization.From)
			if err != nil {
				return false, err
			}
			// Wallet may not be deployed - this is OK in verify() if has deployment info
			// Actual deployment happens in settle() if configured
		}
	}

	return valid, nil
}

// deploySmartWallet deploys an ERC-4337 smart wallet using the ERC-6492 factory
//
// This function sends the pre-encoded factory calldata directly as a transaction.
// The factoryCalldata already contains the complete encoded function call with selector.
//
// Args:
//
//	ctx: Context for cancellation
//	sigData: Parsed ERC-6492 signature containing factory address and calldata
//
// Returns:
//
//	error if deployment fails
func (f *ExactEvmSchemeV1) deploySmartWallet(
	ctx context.Context,
	sigData *evm.ERC6492SignatureData,
) error {
	factoryAddr := common.BytesToAddress(sigData.Factory[:])

	// Send the factory calldata directly - it already contains the encoded function call
	txHash, err := f.signer.SendTransaction(
		ctx,
		factoryAddr.Hex(),
		sigData.FactoryCalldata,
	)
	if err != nil {
		return fmt.Errorf("factory deployment transaction failed: %w", err)
	}

	// Wait for deployment transaction
	receipt, err := f.signer.WaitForTransactionReceipt(ctx, txHash)
	if err != nil {
		return fmt.Errorf("failed to wait for deployment: %w", err)
	}

	if receipt.Status != evm.TxStatusSuccess {
		return fmt.Errorf("deployment transaction reverted")
	}

	return nil
}
