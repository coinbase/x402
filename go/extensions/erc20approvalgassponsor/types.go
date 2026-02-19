// Package erc20approvalgassponsor provides types and helpers for the ERC-20 Approval Gas Sponsoring extension.
//
// This extension enables gasless approval of the Permit2 contract for tokens
// that do not implement EIP-2612. The client pre-signs a raw ERC-20 approve(Permit2, amount)
// transaction; the facilitator uses its smart wallet to batch-execute the approval and
// settle atomically.
package erc20approvalgassponsor

import (
	"context"
	"math/big"

	"github.com/coinbase/x402/go/mechanisms/evm"
)

// ERC20ApprovalGasSponsoring is the extension identifier string.
const ERC20ApprovalGasSponsoring = "erc20ApprovalGasSponsoring"

// Info contains the ERC-20 approval data populated by the client.
// The facilitator uses this to batch [approve] + [settle] atomically.
type Info struct {
	// From is the address of the sender (token owner).
	From string `json:"from"`
	// Asset is the address of the ERC-20 token contract.
	Asset string `json:"asset"`
	// Spender is the address of the spender (Canonical Permit2).
	Spender string `json:"spender"`
	// Amount is the approval amount (uint256 as decimal string). Typically MaxUint256.
	Amount string `json:"amount"`
	// SignedTransaction is the RLP-encoded signed approve transaction as a hex string (0x-prefixed).
	SignedTransaction string `json:"signedTransaction"`
	// Version is the schema version identifier.
	Version string `json:"version"`
}

// ServerInfo is the server-side info included in PaymentRequired.
// Contains a description and version; the client populates the rest.
type ServerInfo struct {
	Description string `json:"description"`
	Version     string `json:"version"`
}

// Extension represents the full extension object as it appears in
// PaymentRequired.extensions and PaymentPayload.extensions.
type Extension struct {
	Info   interface{}            `json:"info"`
	Schema map[string]interface{} `json:"schema"`
}

// BatchCall represents a single call in a batch transaction.
type BatchCall struct {
	To    string
	Value *big.Int
	Data  []byte
}

// SmartWalletBatchSigner can sign and submit atomic batch transactions.
type SmartWalletBatchSigner interface {
	// SendBatchTransaction submits an atomic batch of calls and returns the tx hash.
	SendBatchTransaction(ctx context.Context, calls []BatchCall) (string, error)
	// WaitForTransactionReceipt waits for a batch transaction to be mined.
	WaitForTransactionReceipt(ctx context.Context, txHash string) (*evm.TransactionReceipt, error)
}

// FacilitatorExt is the facilitator-side extension that holds the batch signer.
// It implements x402.FacilitatorExtension via its Key() method.
type FacilitatorExt struct {
	SmartWalletSigner SmartWalletBatchSigner
}

// Key returns the extension identifier. Implements x402.FacilitatorExtension.
func (e *FacilitatorExt) Key() string { return ERC20ApprovalGasSponsoring }

// NewFacilitatorExtension creates a FacilitatorExt with the given batch signer.
// Pass nil for signer to register the extension key without enabling batch settlement
// (e.g. for e2e tests where the server advertises the capability but settlement
// via this path is not exercised).
func NewFacilitatorExtension(signer SmartWalletBatchSigner) *FacilitatorExt {
	return &FacilitatorExt{SmartWalletSigner: signer}
}
