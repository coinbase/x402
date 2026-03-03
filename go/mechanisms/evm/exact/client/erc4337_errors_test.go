package client

import (
	"fmt"
	"testing"
)

func TestNewPaymentCreationError_WithCause(t *testing.T) {
	cause := fmt.Errorf("underlying error")
	err := NewPaymentCreationError(PhasePreparation, "failed to prepare", "eip155:84532", cause)

	if err == nil {
		t.Fatal("expected error, got nil")
	}
	if err.Phase != PhasePreparation {
		t.Errorf("Phase = %q, want %q", err.Phase, PhasePreparation)
	}
	if err.Reason != "failed to prepare" {
		t.Errorf("Reason = %q, want %q", err.Reason, "failed to prepare")
	}
	if err.Network != "eip155:84532" {
		t.Errorf("Network = %q, want %q", err.Network, "eip155:84532")
	}
	if err.Message != "failed to prepare: underlying error" {
		t.Errorf("Message = %q, want %q", err.Message, "failed to prepare: underlying error")
	}
}

func TestNewPaymentCreationError_WithoutCause(t *testing.T) {
	err := NewPaymentCreationError(PhaseValidation, "missing field", "eip155:8453", nil)

	if err == nil {
		t.Fatal("expected error, got nil")
	}
	if err.Phase != PhaseValidation {
		t.Errorf("Phase = %q, want %q", err.Phase, PhaseValidation)
	}
	if err.Reason != "missing field" {
		t.Errorf("Reason = %q, want %q", err.Reason, "missing field")
	}
	if err.Message != "missing field" {
		t.Errorf("Message = %q, want %q (should equal reason when no cause)", err.Message, "missing field")
	}
}

func TestPaymentCreationError_Error(t *testing.T) {
	err := NewPaymentCreationError(PhaseSigning, "signing failed", "eip155:84532", fmt.Errorf("key not found"))

	errorStr := err.Error()
	if errorStr != "signing failed: key not found" {
		t.Errorf("Error() = %q, want %q", errorStr, "signing failed: key not found")
	}
}

func TestPaymentCreationError_ImplementsError(t *testing.T) {
	var err error = NewPaymentCreationError(PhaseValidation, "test", "eip155:84532", nil)
	if err == nil {
		t.Fatal("expected non-nil error interface")
	}
	if err.Error() != "test" {
		t.Errorf("Error() = %q, want %q", err.Error(), "test")
	}
}

func TestParseAAError_KnownCode(t *testing.T) {
	err := fmt.Errorf("UserOperation reverted: AA21 didn't pay prefund")
	result := ParseAAError(err)

	if result == nil {
		t.Fatal("expected result, got nil")
	}
	if result.Code != "AA21" {
		t.Errorf("Code = %q, want %q", result.Code, "AA21")
	}
	if result.Reason != "Insufficient funds for gas prefund" {
		t.Errorf("Reason = %q, want %q", result.Reason, "Insufficient funds for gas prefund")
	}
}

func TestParseAAError_NilError(t *testing.T) {
	result := ParseAAError(nil)
	if result != nil {
		t.Errorf("expected nil, got %v", result)
	}
}

func TestParseAAError_NoAACode(t *testing.T) {
	err := fmt.Errorf("some generic error without AA codes")
	result := ParseAAError(err)
	if result != nil {
		t.Errorf("expected nil, got %v", result)
	}
}

func TestParseAAError_StringContainingAACode(t *testing.T) {
	err := fmt.Errorf("error during gas estimation: AA24 signature error occurred")
	result := ParseAAError(err)

	if result == nil {
		t.Fatal("expected result, got nil")
	}
	if result.Code != "AA24" {
		t.Errorf("Code = %q, want %q", result.Code, "AA24")
	}
	if result.Reason != "Signature validation failed" {
		t.Errorf("Reason = %q, want %q", result.Reason, "Signature validation failed")
	}
}

func TestParseAAErrorString_UnknownCode(t *testing.T) {
	result := ParseAAErrorString("error with AA99 unknown code")

	if result == nil {
		t.Fatal("expected result, got nil")
	}
	if result.Code != "AA99" {
		t.Errorf("Code = %q, want %q", result.Code, "AA99")
	}
	if result.Reason != "Unknown AA error" {
		t.Errorf("Reason = %q, want %q", result.Reason, "Unknown AA error")
	}
}

func TestParseAAErrorString_NoMatch(t *testing.T) {
	result := ParseAAErrorString("no error codes here")
	if result != nil {
		t.Errorf("expected nil, got %v", result)
	}
}

func TestParseAAErrorString_EmptyString(t *testing.T) {
	result := ParseAAErrorString("")
	if result != nil {
		t.Errorf("expected nil, got %v", result)
	}
}

func TestParseAAErrorString_MultipleAACodes(t *testing.T) {
	// Should match the first AA code found
	result := ParseAAErrorString("AA21 and AA24 both present")
	if result == nil {
		t.Fatal("expected result, got nil")
	}
	if result.Code != "AA21" {
		t.Errorf("Code = %q, want %q (first match)", result.Code, "AA21")
	}
}

func TestErrorConstants_NonEmpty(t *testing.T) {
	constants := map[string]string{
		"ErrERC4337MissingBundler":    ErrERC4337MissingBundler,
		"ErrERC4337MissingEntrypoint": ErrERC4337MissingEntrypoint,
		"ErrERC4337MissingSigner":     ErrERC4337MissingSigner,
		"ErrERC4337PreparationFailed": ErrERC4337PreparationFailed,
		"ErrERC4337SigningFailed":     ErrERC4337SigningFailed,
		"ErrERC4337MissingAmount":     ErrERC4337MissingAmount,
	}

	for name, value := range constants {
		if value == "" {
			t.Errorf("%s should not be empty", name)
		}
	}
}

func TestPaymentCreationPhaseConstants(t *testing.T) {
	if PhaseValidation != "validation" {
		t.Errorf("PhaseValidation = %q, want %q", PhaseValidation, "validation")
	}
	if PhasePreparation != "preparation" {
		t.Errorf("PhasePreparation = %q, want %q", PhasePreparation, "preparation")
	}
	if PhaseSigning != "signing" {
		t.Errorf("PhaseSigning = %q, want %q", PhaseSigning, "signing")
	}
}
