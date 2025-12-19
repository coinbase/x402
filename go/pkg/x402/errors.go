package x402

import "errors"

// Config validation errors
var (
	ErrMissingPrice     = errors.New("x402: price is required")
	ErrMissingToken     = errors.New("x402: token is required")
	ErrMissingChainID   = errors.New("x402: chainId is required")
	ErrMissingRecipient = errors.New("x402: recipient is required")
)

// Payment processing errors
var (
	ErrPaymentRequired      = errors.New("x402: payment required")
	ErrInvalidPayment       = errors.New("x402: invalid payment")
	ErrPaymentExpired       = errors.New("x402: payment expired")
	ErrInsufficientFunds    = errors.New("x402: insufficient funds")
	ErrVerificationFailed   = errors.New("x402: payment verification failed")
	ErrSettlementFailed     = errors.New("x402: payment settlement failed")
	ErrQuoteFailed          = errors.New("x402: quote request failed")
	ErrTokenMetadataFailed  = errors.New("x402: failed to fetch token metadata")
	ErrDiscoveryFailed      = errors.New("x402: discovery registration failed")
)
