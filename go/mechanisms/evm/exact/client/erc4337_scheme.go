package client

import (
	"context"
	"fmt"
	"math/big"

	"github.com/coinbase/x402/go/mechanisms/evm"
	"github.com/coinbase/x402/go/types"
)

// ExactEvmSchemeERC4337Config holds configuration for the ERC-4337 client scheme.
type ExactEvmSchemeERC4337Config struct {
	// BundlerClient is an optional pre-configured bundler client.
	BundlerClient ERC4337BundlerClient
	// Signer signs user operations.
	Signer ERC4337UserOperationSigner
	// Entrypoint is the EntryPoint v0.7 address (optional, can come from requirements).
	Entrypoint string
	// BundlerUrl is the bundler URL (optional, can come from requirements).
	BundlerUrl string
}

// ExactEvmSchemeERC4337 implements SchemeNetworkClient for ERC-4337 UserOperation payments.
type ExactEvmSchemeERC4337 struct {
	bundlerClient ERC4337BundlerClient
	signer        ERC4337UserOperationSigner
	entrypoint    string
	bundlerUrl    string
}

// NewExactEvmSchemeERC4337 creates a new ERC-4337 client scheme.
func NewExactEvmSchemeERC4337(config ExactEvmSchemeERC4337Config) (*ExactEvmSchemeERC4337, error) {
	if config.Signer == nil {
		return nil, fmt.Errorf("signer is required for ERC-4337 client scheme")
	}
	return &ExactEvmSchemeERC4337{
		bundlerClient: config.BundlerClient,
		signer:        config.Signer,
		entrypoint:    config.Entrypoint,
		bundlerUrl:    config.BundlerUrl,
	}, nil
}

// Scheme returns the scheme identifier.
func (c *ExactEvmSchemeERC4337) Scheme() string {
	return evm.SchemeExact
}

// CreatePaymentPayload creates a payment payload using ERC-4337 UserOperations.
func (c *ExactEvmSchemeERC4337) CreatePaymentPayload(
	ctx context.Context,
	requirements types.PaymentRequirements,
) (types.PaymentPayload, error) {
	// Extract capability from requirements
	capability := evm.ExtractUserOperationCapability(requirements.Extra)

	// Resolve entrypoint (config > requirements)
	entryPoint := c.entrypoint
	if entryPoint == "" && capability != nil {
		entryPoint = capability.Entrypoint
	}
	if entryPoint == "" {
		return types.PaymentPayload{}, &PaymentCreationError{
			Phase:   PhaseValidation,
			Reason:  "entry point not provided",
			Network: string(requirements.Network),
			Message: "set entrypoint in config or in payment requirements extra.userOperation.entrypoint",
		}
	}

	// Resolve bundler URL (config > requirements)
	bundlerUrl := c.bundlerUrl
	if bundlerUrl == "" && capability != nil {
		bundlerUrl = capability.BundlerUrl
	}
	if bundlerUrl == "" {
		return types.PaymentPayload{}, &PaymentCreationError{
			Phase:   PhaseValidation,
			Reason:  "bundler URL not provided",
			Network: string(requirements.Network),
			Message: "set bundlerUrl in config or in payment requirements extra.userOperation.bundlerUrl",
		}
	}

	// Validate bundler client
	if c.bundlerClient == nil {
		return types.PaymentPayload{}, &PaymentCreationError{
			Phase:   PhaseValidation,
			Reason:  "bundler client not provided",
			Network: string(requirements.Network),
			Message: "bundler client is required for ERC-4337 payment creation",
		}
	}

	// Parse amount
	amountStr := requirements.Amount
	if amountStr == "" {
		return types.PaymentPayload{}, &PaymentCreationError{
			Phase:   PhaseValidation,
			Reason:  "missing amount",
			Network: string(requirements.Network),
			Message: "payment requirements missing amount",
		}
	}
	amount, ok := new(big.Int).SetString(amountStr, 10)
	if !ok {
		return types.PaymentPayload{}, &PaymentCreationError{
			Phase:   PhaseValidation,
			Reason:  fmt.Sprintf("invalid amount: %s", amountStr),
			Network: string(requirements.Network),
			Message: fmt.Sprintf("invalid amount: %s", amountStr),
		}
	}

	// Build ERC20 transfer calldata
	callData, err := BuildERC20TransferCallData(requirements.PayTo, amount)
	if err != nil {
		return types.PaymentPayload{}, NewPaymentCreationError(PhasePreparation, "failed to build calldata", string(requirements.Network), err)
	}

	// Prepare user operation
	calls := []UserOperationCall{{
		To:    requirements.Asset,
		Value: "0x0",
		Data:  callData,
	}}

	unsignedUserOp, err := c.bundlerClient.PrepareUserOperation(ctx, calls, entryPoint)
	if err != nil {
		aaErr := ParseAAError(err)
		reason := err.Error()
		if aaErr != nil {
			reason = aaErr.Reason
		}
		return types.PaymentPayload{}, NewPaymentCreationError(PhasePreparation, reason, string(requirements.Network), err)
	}

	// Sign user operation
	signature, err := c.signer.SignUserOperation(ctx, *unsignedUserOp)
	if err != nil {
		aaErr := ParseAAError(err)
		reason := err.Error()
		if aaErr != nil {
			reason = aaErr.Reason
		}
		return types.PaymentPayload{}, NewPaymentCreationError(PhaseSigning, reason, string(requirements.Network), err)
	}

	// Create signed user operation
	signedUserOp := *unsignedUserOp
	signedUserOp.Signature = signature

	// Build ERC-4337 payload
	erc4337Payload := &evm.Erc4337Payload{
		Type:          "erc4337",
		EntryPoint:    entryPoint,
		BundlerRpcUrl: bundlerUrl,
		UserOperation: signedUserOp,
	}

	return types.PaymentPayload{
		X402Version: 2,
		Payload:     erc4337Payload.ToMap(),
	}, nil
}
