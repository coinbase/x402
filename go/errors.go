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
