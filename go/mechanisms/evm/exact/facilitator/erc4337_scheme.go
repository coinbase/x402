package facilitator

import (
	"context"
	"fmt"
	"time"

	x402 "github.com/coinbase/x402/go"
	"github.com/coinbase/x402/go/mechanisms/evm"
	"github.com/coinbase/x402/go/types"
)

// ExactEvmSchemeERC4337Config holds configuration for the ERC-4337 facilitator.
type ExactEvmSchemeERC4337Config struct {
	// DefaultBundlerUrl is the default bundler URL if not provided in payload or requirements.
	DefaultBundlerUrl string
	// ReceiptPollTimeoutMs is the timeout for receipt polling in milliseconds. Default: 30000.
	ReceiptPollTimeoutMs int
	// ReceiptPollIntervalMs is the interval for receipt polling in milliseconds. Default: 1000.
	ReceiptPollIntervalMs int
}

// ExactEvmSchemeERC4337 implements SchemeNetworkFacilitator for ERC-4337 UserOperation payments.
// No facilitator signer is needed — the user signs the UserOperation.
type ExactEvmSchemeERC4337 struct {
	config ExactEvmSchemeERC4337Config
}

// NewExactEvmSchemeERC4337 creates a new ERC-4337 facilitator.
func NewExactEvmSchemeERC4337(config *ExactEvmSchemeERC4337Config) *ExactEvmSchemeERC4337 {
	cfg := ExactEvmSchemeERC4337Config{
		ReceiptPollTimeoutMs:  30000,
		ReceiptPollIntervalMs: 1000,
	}
	if config != nil {
		if config.DefaultBundlerUrl != "" {
			cfg.DefaultBundlerUrl = config.DefaultBundlerUrl
		}
		if config.ReceiptPollTimeoutMs > 0 {
			cfg.ReceiptPollTimeoutMs = config.ReceiptPollTimeoutMs
		}
		if config.ReceiptPollIntervalMs > 0 {
			cfg.ReceiptPollIntervalMs = config.ReceiptPollIntervalMs
		}
	}
	return &ExactEvmSchemeERC4337{config: cfg}
}

// Scheme returns the scheme identifier.
func (f *ExactEvmSchemeERC4337) Scheme() string {
	return evm.SchemeExact
}

// CaipFamily returns the CAIP family pattern this facilitator supports.
func (f *ExactEvmSchemeERC4337) CaipFamily() string {
	return "eip155:*"
}

// GetExtra returns mechanism-specific extra data. Returns nil for ERC-4337.
func (f *ExactEvmSchemeERC4337) GetExtra(_ x402.Network) map[string]interface{} {
	return nil
}

// GetSigners returns signer addresses. Returns empty — no facilitator signer needed for AA.
func (f *ExactEvmSchemeERC4337) GetSigners(_ x402.Network) []string {
	return []string{}
}

// Verify verifies a payment payload containing a user operation.
func (f *ExactEvmSchemeERC4337) Verify(
	ctx context.Context,
	payload types.PaymentPayload,
	requirements types.PaymentRequirements,
	_ *x402.FacilitatorContext,
) (*x402.VerifyResponse, error) {
	if !evm.IsErc4337Payload(payload.Payload) {
		return nil, x402.NewVerifyError(ErrMissingUserOperation, "", "payload is not an ERC-4337 payload")
	}

	erc4337Payload, err := evm.Erc4337PayloadFromMap(payload.Payload)
	if err != nil {
		return nil, x402.NewVerifyError(ErrInvalidPayload, "", fmt.Sprintf("failed to parse ERC-4337 payload: %s", err.Error()))
	}

	payer := erc4337Payload.UserOperation.Sender

	// Resolve bundler URL: payload > requirements.extra > config
	bundlerUrl := f.resolveBundlerUrl(erc4337Payload, requirements)
	if bundlerUrl == "" {
		return nil, x402.NewVerifyError(ErrMissingBundlerUrl, payer, "no bundler URL available")
	}

	entryPoint := erc4337Payload.EntryPoint
	if entryPoint == "" {
		return nil, x402.NewVerifyError(ErrMissingEntryPoint, payer, "missing entry point")
	}

	// Verify by estimating gas through bundler
	bundler := NewBundlerClient(bundlerUrl, nil)
	_, err = bundler.EstimateUserOperationGas(ctx, erc4337Payload.UserOperation.ToMap(), entryPoint)
	if err != nil {
		return nil, x402.NewVerifyError(ErrGasEstimationFailed, payer, err.Error())
	}

	return &x402.VerifyResponse{
		IsValid: true,
		Payer:   payer,
	}, nil
}

// Settle settles a payment by sending the user operation to the bundler.
func (f *ExactEvmSchemeERC4337) Settle(
	ctx context.Context,
	payload types.PaymentPayload,
	requirements types.PaymentRequirements,
	fctx *x402.FacilitatorContext,
) (*x402.SettleResponse, error) {
	network := x402.Network(payload.Accepted.Network)

	// Re-verify before settling
	verifyResp, err := f.Verify(ctx, payload, requirements, fctx)
	if err != nil {
		return nil, x402.NewSettleError(ErrVerificationFailed, "", network, "", err.Error())
	}

	erc4337Payload, err := evm.Erc4337PayloadFromMap(payload.Payload)
	if err != nil {
		return nil, x402.NewSettleError(ErrInvalidPayload, verifyResp.Payer, network, "", err.Error())
	}

	payer := erc4337Payload.UserOperation.Sender

	bundlerUrl := f.resolveBundlerUrl(erc4337Payload, requirements)
	if bundlerUrl == "" {
		return nil, x402.NewSettleError(ErrMissingBundlerUrl, payer, network, "", "no bundler URL available")
	}

	entryPoint := erc4337Payload.EntryPoint
	if entryPoint == "" {
		return nil, x402.NewSettleError(ErrMissingEntryPoint, payer, network, "", "missing entry point")
	}

	bundler := NewBundlerClient(bundlerUrl, nil)

	// Send user operation
	userOpHash, err := bundler.SendUserOperation(ctx, erc4337Payload.UserOperation.ToMap(), entryPoint)
	if err != nil {
		return nil, x402.NewSettleError(ErrSendFailed, payer, network, "", err.Error())
	}

	// Poll for receipt
	deadline := time.Now().Add(time.Duration(f.config.ReceiptPollTimeoutMs) * time.Millisecond)
	var receipt *UserOperationReceipt

	for time.Now().Before(deadline) {
		receipt, err = bundler.GetUserOperationReceipt(ctx, userOpHash)
		if err != nil {
			// Continue polling on receipt poll errors
			time.Sleep(time.Duration(f.config.ReceiptPollIntervalMs) * time.Millisecond)
			continue
		}
		if receipt != nil {
			break
		}
		time.Sleep(time.Duration(f.config.ReceiptPollIntervalMs) * time.Millisecond)
	}

	// Extract transaction hash from receipt
	txHash := userOpHash
	if receipt != nil {
		if receipt.Receipt != nil && receipt.Receipt.TransactionHash != "" {
			txHash = receipt.Receipt.TransactionHash
		} else if receipt.TransactionHash != "" {
			txHash = receipt.TransactionHash
		}
	}

	return &x402.SettleResponse{
		Success:     true,
		Transaction: txHash,
		Network:     network,
		Payer:       payer,
	}, nil
}

// resolveBundlerUrl resolves the bundler URL from payload, requirements, or config.
func (f *ExactEvmSchemeERC4337) resolveBundlerUrl(payload *evm.Erc4337Payload, requirements types.PaymentRequirements) string {
	// 1. From payload
	if payload.BundlerRpcUrl != "" {
		return payload.BundlerRpcUrl
	}

	// 2. From requirements.extra.userOperation.bundlerUrl
	cap := evm.ExtractUserOperationCapability(requirements.Extra)
	if cap != nil && cap.BundlerUrl != "" {
		return cap.BundlerUrl
	}

	// 3. From config
	return f.config.DefaultBundlerUrl
}
