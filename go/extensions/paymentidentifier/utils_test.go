package paymentidentifier

import (
	"strings"
	"testing"
)

// ---------------------------------------------------------------------------
// GeneratePaymentID
// ---------------------------------------------------------------------------

func TestGeneratePaymentID_DefaultPrefix(t *testing.T) {
	id := GeneratePaymentID("")
	if !strings.HasPrefix(id, "pay_") {
		t.Errorf("expected default prefix 'pay_', got %q", id)
	}
}

func TestGeneratePaymentID_CustomPrefix(t *testing.T) {
	id := GeneratePaymentID("txn_")
	if !strings.HasPrefix(id, "txn_") {
		t.Errorf("expected prefix 'txn_', got %q", id)
	}
}

func TestGeneratePaymentID_UUIDSuffixLength(t *testing.T) {
	// UUID v4 without hyphens is 32 hex characters.
	prefix := "pay_"
	id := GeneratePaymentID(prefix)
	suffix := strings.TrimPrefix(id, prefix)
	if len(suffix) != 32 {
		t.Errorf("expected 32-char UUID suffix, got %d chars: %q", len(suffix), suffix)
	}
}

func TestGeneratePaymentID_UUIDSuffixIsHex(t *testing.T) {
	id := GeneratePaymentID("")
	suffix := strings.TrimPrefix(id, "pay_")
	for _, ch := range suffix {
		if !strings.ContainsRune("0123456789abcdef", ch) {
			t.Errorf("UUID suffix contains non-hex character %q in %q", ch, id)
		}
	}
}

func TestGeneratePaymentID_Unique(t *testing.T) {
	id1 := GeneratePaymentID("")
	id2 := GeneratePaymentID("")
	if id1 == id2 {
		t.Errorf("expected unique IDs, but got identical values: %q", id1)
	}
}

func TestGeneratePaymentID_LongPrefix(t *testing.T) {
	prefix := "payment_order_"
	id := GeneratePaymentID(prefix)
	if !strings.HasPrefix(id, prefix) {
		t.Errorf("expected prefix %q, got %q", prefix, id)
	}
	suffix := strings.TrimPrefix(id, prefix)
	if len(suffix) != 32 {
		t.Errorf("expected 32-char UUID suffix after custom prefix, got %d", len(suffix))
	}
}

func TestGeneratePaymentID_ResultIsValidPaymentID(t *testing.T) {
	id := GeneratePaymentID("")
	if !IsValidPaymentID(id) {
		t.Errorf("GeneratePaymentID result failed IsValidPaymentID check: %q", id)
	}
}

// ---------------------------------------------------------------------------
// IsValidPaymentID
// ---------------------------------------------------------------------------

func TestIsValidPaymentID_ValidMinLength(t *testing.T) {
	// Exactly PAYMENT_ID_MIN_LENGTH (16) alphanumeric characters.
	id := strings.Repeat("a", PAYMENT_ID_MIN_LENGTH)
	if !IsValidPaymentID(id) {
		t.Errorf("expected valid for min-length ID %q", id)
	}
}

func TestIsValidPaymentID_ValidMaxLength(t *testing.T) {
	// Exactly PAYMENT_ID_MAX_LENGTH (128) alphanumeric characters.
	id := strings.Repeat("z", PAYMENT_ID_MAX_LENGTH)
	if !IsValidPaymentID(id) {
		t.Errorf("expected valid for max-length ID %q", id)
	}
}

func TestIsValidPaymentID_ValidWithHyphensAndUnderscores(t *testing.T) {
	ids := []string{
		"pay_abc123def456ghi7",
		"order-0000-1111-2222",
		"PAY_UPPERCASE_ID1234",
		"mix_and-match-HYBRID1",
	}
	for _, id := range ids {
		if !IsValidPaymentID(id) {
			t.Errorf("expected valid for %q", id)
		}
	}
}

func TestIsValidPaymentID_TooShort(t *testing.T) {
	// One character below minimum.
	id := strings.Repeat("x", PAYMENT_ID_MIN_LENGTH-1)
	if IsValidPaymentID(id) {
		t.Errorf("expected invalid for too-short ID %q (len=%d)", id, len(id))
	}
}

func TestIsValidPaymentID_Empty(t *testing.T) {
	if IsValidPaymentID("") {
		t.Error("expected invalid for empty string")
	}
}

func TestIsValidPaymentID_TooLong(t *testing.T) {
	// One character above maximum.
	id := strings.Repeat("a", PAYMENT_ID_MAX_LENGTH+1)
	if IsValidPaymentID(id) {
		t.Errorf("expected invalid for too-long ID (len=%d)", len(id))
	}
}

func TestIsValidPaymentID_InvalidCharSpace(t *testing.T) {
	id := "pay_valid_but has space"
	if IsValidPaymentID(id) {
		t.Errorf("expected invalid for ID containing space: %q", id)
	}
}

func TestIsValidPaymentID_InvalidCharAt(t *testing.T) {
	id := "pay_invalid@char12345"
	if IsValidPaymentID(id) {
		t.Errorf("expected invalid for ID containing '@': %q", id)
	}
}

func TestIsValidPaymentID_InvalidCharDot(t *testing.T) {
	id := "pay_invalid.dot12345"
	if IsValidPaymentID(id) {
		t.Errorf("expected invalid for ID containing '.': %q", id)
	}
}

func TestIsValidPaymentID_InvalidCharSlash(t *testing.T) {
	id := "pay_invalid/slash1234"
	if IsValidPaymentID(id) {
		t.Errorf("expected invalid for ID containing '/': %q", id)
	}
}

func TestIsValidPaymentID_BoundaryAtMinLength(t *testing.T) {
	// Exactly min length with all valid chars.
	id := "abcdefghijklmnop" // 16 chars
	if len(id) != PAYMENT_ID_MIN_LENGTH {
		t.Fatalf("test data length %d != PAYMENT_ID_MIN_LENGTH %d", len(id), PAYMENT_ID_MIN_LENGTH)
	}
	if !IsValidPaymentID(id) {
		t.Errorf("expected valid for boundary min-length ID %q", id)
	}
}

func TestIsValidPaymentID_BelowBoundary(t *testing.T) {
	id := "abcdefghijklmno" // 15 chars
	if len(id) != PAYMENT_ID_MIN_LENGTH-1 {
		t.Fatalf("test data length %d", len(id))
	}
	if IsValidPaymentID(id) {
		t.Errorf("expected invalid for below-boundary ID %q", id)
	}
}

func TestIsValidPaymentID_AllUppercase(t *testing.T) {
	id := strings.Repeat("A", PAYMENT_ID_MIN_LENGTH)
	if !IsValidPaymentID(id) {
		t.Errorf("expected valid for all-uppercase ID %q", id)
	}
}

func TestIsValidPaymentID_AllDigits(t *testing.T) {
	id := strings.Repeat("9", PAYMENT_ID_MIN_LENGTH)
	if !IsValidPaymentID(id) {
		t.Errorf("expected valid for all-digit ID %q", id)
	}
}

func TestIsValidPaymentID_GeneratedIDsPassValidation(t *testing.T) {
	prefixes := []string{"", "pay_", "order_", "txn-"}
	for _, prefix := range prefixes {
		id := GeneratePaymentID(prefix)
		if !IsValidPaymentID(id) {
			t.Errorf("GeneratePaymentID(%q) = %q failed IsValidPaymentID", prefix, id)
		}
	}
}
