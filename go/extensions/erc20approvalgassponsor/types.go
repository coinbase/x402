// Package erc20approvalgassponsor provides types and helpers for the ERC-20 Approval Gas Sponsoring extension.
//
// This extension enables gasless approval of the Permit2 contract for ERC-20 tokens
// that do NOT implement EIP-2612. Instead of an off-chain signature, the client
// creates a signed (but unbroadcast) approve(Permit2, MaxUint256) transaction.
// The facilitator broadcasts it before calling settle().
package erc20approvalgassponsor

import (
	"context"

	x402 "github.com/coinbase/x402/go"
	evm "github.com/coinbase/x402/go/mechanisms/evm"
)

// ERC20ApprovalGasSponsoring is the extension identifier for the ERC-20 approval gas sponsoring extension.
var ERC20ApprovalGasSponsoring = x402.NewFacilitatorExtension("erc20ApprovalGasSponsoring")

// ERC20ApprovalGasSponsoringVersion is the current schema version for the extension info.
const ERC20ApprovalGasSponsoringVersion = "1"

// Info contains the signed approve transaction data populated by the client.
// The facilitator broadcasts this transaction before calling settle().
type Info struct {
	// From is the address of the sender (token owner).
	From string `json:"from"`
	// Asset is the address of the ERC-20 token contract.
	Asset string `json:"asset"`
	// Spender is the address being approved (Canonical Permit2).
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

// Erc20ApprovalGasSponsoringSigner extends FacilitatorEvmSigner with raw transaction broadcasting.
type Erc20ApprovalGasSponsoringSigner interface {
	evm.FacilitatorEvmSigner
	SendRawTransaction(ctx context.Context, signedTx string) (string, error)
}

// Erc20ApprovalFacilitatorExtension carries the signer; registered with the facilitator.
// It implements x402.FacilitatorExtension so it can be registered and retrieved via FacilitatorContext.
type Erc20ApprovalFacilitatorExtension struct {
	Signer Erc20ApprovalGasSponsoringSigner
}

// Key returns the extension identifier.
func (e *Erc20ApprovalFacilitatorExtension) Key() string {
	return ERC20ApprovalGasSponsoring.Key()
}
