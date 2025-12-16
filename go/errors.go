package x402

import "fmt"

// PaymentError represents a payment-specific error
type PaymentError struct {
	Code    string                 `json:"code"`
	Message string                 `json:"message"`
	Details map[string]interface{} `json:"details,omitempty"`
}

func (e *PaymentError) Error() string {
	return fmt.Sprintf("%s: %s", e.Code, e.Message)
}

// Common error codes
const (
	ErrCodeInvalidPayment     = "invalid_payment"
	ErrCodePaymentRequired    = "payment_required"
	ErrCodeInsufficientFunds  = "insufficient_funds"
	ErrCodeNetworkMismatch    = "network_mismatch"
	ErrCodeSchemeMismatch     = "scheme_mismatch"
	ErrCodeSignatureInvalid   = "signature_invalid"
	ErrCodePaymentExpired     = "payment_expired"
	ErrCodeSettlementFailed   = "settlement_failed"
	ErrCodeUnsupportedScheme  = "unsupported_scheme"
	ErrCodeUnsupportedNetwork = "unsupported_network"
)

// NewPaymentError creates a new payment error
func NewPaymentError(code, message string, details map[string]interface{}) *PaymentError {
	return &PaymentError{
		Code:    code,
		Message: message,
		Details: details,
	}
}

// VerifyError represents a payment verification failure
// All verification failures (business logic and system errors) are returned as errors
type VerifyError struct {
	Reason  string  // Error reason/code (e.g., "insufficient_balance", "invalid_signature")
	Payer   string  // Payer address (if known)
	Network Network // Network identifier (if known)
	Err     error   // Optional underlying error (for wrapping system errors)
}

// Error implements the error interface
func (e *VerifyError) Error() string {
	if e.Err != nil {
		return fmt.Sprintf("verification failed: %s (reason: %s)", e.Err.Error(), e.Reason)
	}
	return fmt.Sprintf("verification failed: %s", e.Reason)
}

// Unwrap returns the underlying error (for errors.Is/As)
func (e *VerifyError) Unwrap() error {
	return e.Err
}

// NewVerifyError creates a new verification error
//
// Args:
//
//	reason: Error reason/code
//	payer: Payer address (empty string if unknown)
//	network: Network identifier (empty string if unknown)
//	err: Optional underlying error
//
// Returns:
//
//	*VerifyError
func NewVerifyError(reason string, payer string, network Network, err error) *VerifyError {
	return &VerifyError{
		Reason:  reason,
		Payer:   payer,
		Network: network,
		Err:     err,
	}
}

// SettleError represents a payment settlement failure
// All settlement failures (business logic and system errors) are returned as errors
type SettleError struct {
	Reason      string  // Error reason/code (e.g., "transaction_failed", "insufficient_balance")
	Payer       string  // Payer address (if known)
	Network     Network // Network identifier
	Transaction string  // Transaction hash (if settlement was attempted)
	Err         error   // Optional underlying error (for wrapping system errors)
}

// Error implements the error interface
func (e *SettleError) Error() string {
	if e.Err != nil {
		return fmt.Sprintf("settlement failed: %s (reason: %s)", e.Err.Error(), e.Reason)
	}
	return fmt.Sprintf("settlement failed: %s", e.Reason)
}

// Unwrap returns the underlying error (for errors.Is/As)
func (e *SettleError) Unwrap() error {
	return e.Err
}

// NewSettleError creates a new settlement error
//
// Args:
//
//	reason: Error reason/code
//	payer: Payer address (empty string if unknown)
//	network: Network identifier
//	transaction: Transaction hash (empty string if not submitted)
//	err: Optional underlying error
//
// Returns:
//
//	*SettleError
func NewSettleError(reason string, payer string, network Network, transaction string, err error) *SettleError {
	return &SettleError{
		Reason:      reason,
		Payer:       payer,
		Network:     network,
		Transaction: transaction,
		Err:         err,
	}
}
