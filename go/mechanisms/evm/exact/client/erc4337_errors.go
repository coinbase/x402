package client

import (
	"fmt"
	"regexp"

	"github.com/coinbase/x402/go/mechanisms/evm"
)

// ERC-4337 client error constants
const (
	ErrERC4337MissingBundler    = "erc4337_client_missing_bundler"
	ErrERC4337MissingEntrypoint = "erc4337_client_missing_entrypoint"
	ErrERC4337MissingSigner     = "erc4337_client_missing_signer"
	ErrERC4337PreparationFailed = "erc4337_client_preparation_failed"
	ErrERC4337SigningFailed     = "erc4337_client_signing_failed"
	ErrERC4337MissingAmount     = "erc4337_client_missing_amount"
)

// PaymentCreationPhase describes the phase where a payment creation error occurred.
type PaymentCreationPhase string

const (
	PhaseValidation  PaymentCreationPhase = "validation"
	PhasePreparation PaymentCreationPhase = "preparation"
	PhaseSigning     PaymentCreationPhase = "signing"
)

// PaymentCreationError is an error during ERC-4337 payment creation.
type PaymentCreationError struct {
	Phase   PaymentCreationPhase
	Reason  string
	Code    string
	Network string
	Message string
}

func (e *PaymentCreationError) Error() string {
	return e.Message
}

var aaErrorRegex = regexp.MustCompile(`\b(AA[0-9]{2})\b`)

// ParseAAError extracts an AA error code from an error message and returns
// a human-readable reason. Returns nil if no AA code is found.
func ParseAAError(err error) *struct {
	Code   string
	Reason string
} {
	if err == nil {
		return nil
	}
	return ParseAAErrorString(err.Error())
}

// ParseAAErrorString extracts an AA error code from a string.
func ParseAAErrorString(message string) *struct {
	Code   string
	Reason string
} {
	match := aaErrorRegex.FindStringSubmatch(message)
	if len(match) < 2 {
		return nil
	}
	code := match[1]
	reason, ok := evm.AAErrorMessages[code]
	if !ok {
		reason = "Unknown AA error"
	}
	return &struct {
		Code   string
		Reason string
	}{Code: code, Reason: reason}
}

// NewPaymentCreationError creates a new PaymentCreationError.
func NewPaymentCreationError(phase PaymentCreationPhase, reason, network string, cause error) *PaymentCreationError {
	msg := reason
	if cause != nil {
		msg = fmt.Sprintf("%s: %s", reason, cause.Error())
	}
	return &PaymentCreationError{
		Phase:   phase,
		Reason:  reason,
		Network: network,
		Message: msg,
	}
}
