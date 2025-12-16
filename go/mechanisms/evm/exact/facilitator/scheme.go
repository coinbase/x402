package facilitator

import (
	"context"
	"errors"
	"fmt"
	"math/big"
	"strings"

	"github.com/ethereum/go-ethereum/common"

	x402 "github.com/coinbase/x402/go"
	"github.com/coinbase/x402/go/mechanisms/evm"
	"github.com/coinbase/x402/go/types"
)

// ExactEvmSchemeConfig holds configuration for the ExactEvmScheme facilitator
type ExactEvmSchemeConfig struct {
	// DeployERC4337WithEIP6492 enables automatic deployment of ERC-4337 smart wallets
	// via EIP-6492 when encountering undeployed contract signatures during settlement
	DeployERC4337WithEIP6492 bool
}

// ExactEvmScheme implements the SchemeNetworkFacilitator interface for EVM exact payments (V2)
type ExactEvmScheme struct {
	signer evm.FacilitatorEvmSigner
	config ExactEvmSchemeConfig
}

// NewExactEvmScheme creates a new ExactEvmScheme
// Args:
//
//	signer: The EVM signer for facilitator operations
//	config: Optional configuration (nil uses defaults)
//
// Returns:
//
//	Configured ExactEvmScheme instance
func NewExactEvmScheme(signer evm.FacilitatorEvmSigner, config *ExactEvmSchemeConfig) *ExactEvmScheme {
	cfg := ExactEvmSchemeConfig{}
	if config != nil {
		cfg = *config
	}
	return &ExactEvmScheme{
		signer: signer,
		config: cfg,
	}
}

// Scheme returns the scheme identifier
func (f *ExactEvmScheme) Scheme() string {
	return evm.SchemeExact
}

// CaipFamily returns the CAIP family pattern this facilitator supports
func (f *ExactEvmScheme) CaipFamily() string {
	return "eip155:*"
}

// GetExtra returns mechanism-specific extra data for the supported kinds endpoint.
// For EVM, no extra data is needed.
func (f *ExactEvmScheme) GetExtra(_ x402.Network) map[string]interface{} {
	return nil
}

// GetSigners returns signer addresses used by this facilitator.
// Returns all addresses this facilitator can use for signing/settling transactions.
func (f *ExactEvmScheme) GetSigners(_ x402.Network) []string {
	return f.signer.GetAddresses()
}

// Verify verifies a V2 payment payload against requirements
func (f *ExactEvmScheme) Verify(
	ctx context.Context,
	payload types.PaymentPayload,
	requirements types.PaymentRequirements,
) (*x402.VerifyResponse, error) {
	network := x402.Network(requirements.Network)

	// Validate scheme (v2 has scheme in Accepted field)
	if payload.Accepted.Scheme != evm.SchemeExact {
		return nil, x402.NewVerifyError("invalid_scheme", "", network, nil)
	}

	// Validate network (v2 has network in Accepted field)
	if payload.Accepted.Network != requirements.Network {
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

	// Validate authorization matches requirements
	if !strings.EqualFold(evmPayload.Authorization.To, requirements.PayTo) {
		return nil, x402.NewVerifyError("recipient_mismatch", "", network, nil)
	}

	// Parse and validate amount
	authValue, ok := new(big.Int).SetString(evmPayload.Authorization.Value, 10)
	if !ok {
		return nil, x402.NewVerifyError("invalid_authorization_value", "", network, nil)
	}

	// Requirements.Amount is already in the smallest unit
	requiredValue, ok := new(big.Int).SetString(requirements.Amount, 10)
	if !ok {
		return nil, x402.NewVerifyError("invalid_required_amount", "", network, fmt.Errorf("invalid amount: %s", requirements.Amount))
	}

	if authValue.Cmp(requiredValue) < 0 {
		return nil, x402.NewVerifyError("insufficient_amount", evmPayload.Authorization.From, network, nil)
	}

	// Check if nonce has been used
	nonceUsed, err := f.checkNonceUsed(ctx, evmPayload.Authorization.From, evmPayload.Authorization.Nonce, assetInfo.Address)
	if err != nil {
		return nil, x402.NewVerifyError("failed_to_check_nonce", evmPayload.Authorization.From, network, err)
	}
	if nonceUsed {
		return nil, x402.NewVerifyError("nonce_already_used", evmPayload.Authorization.From, network, nil)
	}

	// Check balance
	balance, err := f.signer.GetBalance(ctx, evmPayload.Authorization.From, assetInfo.Address)
	if err != nil {
		return nil, x402.NewVerifyError("failed_to_get_balance", evmPayload.Authorization.From, network, err)
	}
	if balance.Cmp(authValue) < 0 {
		return nil, x402.NewVerifyError("insufficient_balance", evmPayload.Authorization.From, network, nil)
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
		return nil, x402.NewVerifyError("invalid_signature", evmPayload.Authorization.From, network, nil)
	}

	return &x402.VerifyResponse{
		IsValid: true,
		Payer:   evmPayload.Authorization.From,
	}, nil
}

// Settle settles a V2 payment on-chain
func (f *ExactEvmScheme) Settle(
	ctx context.Context,
	payload types.PaymentPayload,
	requirements types.PaymentRequirements,
) (*x402.SettleResponse, error) {
	network := x402.Network(payload.Accepted.Network)

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
		return nil, x402.NewSettleError("failed_to_execute_transfer", verifyResp.Payer, network, "", err)
	}

	// Wait for transaction confirmation
	receipt, err := f.signer.WaitForTransactionReceipt(ctx, txHash)
	if err != nil {
		return nil, x402.NewSettleError("failed_to_get_receipt", verifyResp.Payer, network, txHash, err)
	}

	if receipt.Status != evm.TxStatusSuccess {
		return nil, x402.NewSettleError("transaction_failed", verifyResp.Payer, network, txHash, nil)
	}

	return &x402.SettleResponse{
		Success:     true,
		Transaction: txHash,
		Network:     network,
		Payer:       verifyResp.Payer,
	}, nil
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
func (f *ExactEvmScheme) deploySmartWallet(
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

// checkNonceUsed checks if a nonce has already been used
func (f *ExactEvmScheme) checkNonceUsed(ctx context.Context, from string, nonce string, tokenAddress string) (bool, error) {
	nonceBytes, err := evm.HexToBytes(nonce)
	if err != nil {
		return false, err
	}

	result, err := f.signer.ReadContract(
		ctx,
		tokenAddress,
		evm.AuthorizationStateABI,
		evm.FunctionAuthorizationState,
		common.HexToAddress(from),
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
func (f *ExactEvmScheme) verifySignature(
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
