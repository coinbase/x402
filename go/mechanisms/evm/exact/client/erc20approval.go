package client

import (
	"bytes"
	"context"
	"fmt"
	"math/big"

	ethabi "github.com/ethereum/go-ethereum/accounts/abi"
	"github.com/ethereum/go-ethereum/common"

	"github.com/coinbase/x402/go/extensions/erc20approvalgassponsor"
	"github.com/coinbase/x402/go/mechanisms/evm"
)

// Erc20ApprovalClientConfig configures ERC-20 approval transaction signing.
type Erc20ApprovalClientConfig struct {
	// ApprovalMode controls the approve amount: "infinite" (default) uses MaxUint256,
	// "exact" uses the exact required payment amount.
	ApprovalMode string // "infinite" or "exact"
}

// Erc20ApprovalClientSigner is an optional interface for signers that can sign
// raw Ethereum transactions. This is needed for ERC-20 raw approval gas sponsoring.
// Gate behind a type assertion in trySignErc20Approval.
type Erc20ApprovalClientSigner interface {
	// Address returns the signer's Ethereum address.
	Address() string
	// PendingNonceAt returns the pending nonce for the given address.
	PendingNonceAt(ctx context.Context, address string) (uint64, error)
	// SuggestGasTipCap suggests a gas tip cap (EIP-1559 priority fee).
	SuggestGasTipCap(ctx context.Context) (*big.Int, error)
	// SuggestGasPrice suggests a legacy gas price (used as fallback gas fee cap).
	SuggestGasPrice(ctx context.Context) (*big.Int, error)
	// SignRawTransaction builds a DynamicFeeTx and returns RLP-encoded signed bytes.
	SignRawTransaction(ctx context.Context, chainID *big.Int, to string, data []byte,
		nonce uint64, gasLimit uint64, gasFeeCap *big.Int, gasTipCap *big.Int) ([]byte, error)
}

// approveGasLimit is a conservative gas limit for an ERC-20 approve() call.
const approveGasLimit = uint64(60000)

// SignErc20ApprovalTransaction creates and signs an ERC-20 approve(Permit2, amount)
// transaction for use with the ERC-20 Approval Gas Sponsoring extension.
//
// The signed transaction is returned in the Info struct; the facilitator will
// include it in a batch call alongside the Permit2 settle.
//
// config may be nil (defaults to "infinite" approval).
func SignErc20ApprovalTransaction(
	ctx context.Context,
	signer Erc20ApprovalClientSigner,
	tokenAddress string,
	chainID *big.Int,
	amount *big.Int,
	config *Erc20ApprovalClientConfig,
) (*erc20approvalgassponsor.Info, error) {
	// Default approval mode
	approvalMode := "infinite"
	if config != nil && config.ApprovalMode != "" {
		approvalMode = config.ApprovalMode
	}

	// Determine approval amount
	var approvalAmount *big.Int
	if approvalMode == "exact" {
		approvalAmount = new(big.Int).Set(amount)
	} else {
		approvalAmount = evm.MaxUint256()
	}

	normalizedToken := evm.NormalizeAddress(tokenAddress)
	spender := evm.PERMIT2Address

	// ABI-encode approve(spender, amount)
	parsedABI, err := ethabi.JSON(bytes.NewReader(evm.ERC20ApproveABI))
	if err != nil {
		return nil, fmt.Errorf("failed to parse ERC20 approve ABI: %w", err)
	}

	calldata, err := parsedABI.Pack("approve", common.HexToAddress(spender), approvalAmount)
	if err != nil {
		return nil, fmt.Errorf("failed to encode approve calldata: %w", err)
	}

	// Get pending nonce
	nonce, err := signer.PendingNonceAt(ctx, signer.Address())
	if err != nil {
		return nil, fmt.Errorf("failed to get pending nonce: %w", err)
	}

	// Get gas prices
	gasTipCap, err := signer.SuggestGasTipCap(ctx)
	if err != nil {
		return nil, fmt.Errorf("failed to get gas tip cap: %w", err)
	}

	gasPrice, err := signer.SuggestGasPrice(ctx)
	if err != nil {
		return nil, fmt.Errorf("failed to get gas price: %w", err)
	}

	// Use gas price as fee cap (conservative upper bound)
	gasFeeCap := gasPrice

	// Sign the raw transaction
	rlpBytes, err := signer.SignRawTransaction(ctx, chainID, normalizedToken, calldata,
		nonce, approveGasLimit, gasFeeCap, gasTipCap)
	if err != nil {
		return nil, fmt.Errorf("failed to sign raw transaction: %w", err)
	}

	return &erc20approvalgassponsor.Info{
		From:              signer.Address(),
		Asset:             normalizedToken,
		Spender:           spender,
		Amount:            approvalAmount.String(),
		SignedTransaction: evm.BytesToHex(rlpBytes),
		Version:           "1",
	}, nil
}
