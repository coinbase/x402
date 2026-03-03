package evm

import (
	"strings"
	"testing"
)

func TestAddressConstants_ValidHex(t *testing.T) {
	addresses := map[string]string{
		"EntryPoint07Address":      EntryPoint07Address,
		"Safe4337ModuleAddress":    Safe4337ModuleAddress,
		"SafeWebAuthnSharedSigner": SafeWebAuthnSharedSigner,
		"FCLP256Verifier":          FCLP256Verifier,
		"P256OwnerFactory":         P256OwnerFactory,
		"WebAuthnSignerFactory":    WebAuthnSignerFactory,
	}

	for name, addr := range addresses {
		t.Run(name, func(t *testing.T) {
			// Must start with 0x
			if !strings.HasPrefix(addr, "0x") {
				t.Errorf("%s should start with 0x, got: %s", name, addr)
			}

			// Must be 42 characters (0x + 40 hex chars)
			if len(addr) != 42 {
				t.Errorf("%s length = %d, want 42", name, len(addr))
			}

			// All characters after 0x must be valid hex
			hexPart := addr[2:]
			for _, c := range hexPart {
				if !((c >= '0' && c <= '9') || (c >= 'a' && c <= 'f') || (c >= 'A' && c <= 'F')) {
					t.Errorf("%s contains invalid hex character: %c", name, c)
				}
			}
		})
	}
}

func TestAAErrorMessages_ContainsExpectedCodes(t *testing.T) {
	expectedCodes := []string{
		"AA10", "AA13", "AA14", "AA15",
		"AA20", "AA21", "AA22", "AA23", "AA24", "AA25", "AA26",
		"AA30", "AA31", "AA32", "AA33", "AA34",
		"AA40", "AA41",
		"AA50", "AA51",
	}

	for _, code := range expectedCodes {
		t.Run(code, func(t *testing.T) {
			msg, ok := AAErrorMessages[code]
			if !ok {
				t.Errorf("AAErrorMessages missing code %s", code)
				return
			}
			if msg == "" {
				t.Errorf("AAErrorMessages[%s] is empty", code)
			}
		})
	}
}

func TestAAErrorMessages_AllNonEmpty(t *testing.T) {
	for code, msg := range AAErrorMessages {
		if msg == "" {
			t.Errorf("AAErrorMessages[%s] has empty message", code)
		}
		if code == "" {
			t.Error("AAErrorMessages has empty key")
		}
	}
}

func TestAAErrorMessages_Count(t *testing.T) {
	// Should have exactly 20 entries based on the source
	expectedCount := 20
	if len(AAErrorMessages) != expectedCount {
		t.Errorf("AAErrorMessages count = %d, want %d", len(AAErrorMessages), expectedCount)
	}
}

func TestAddressConstants_NotEmpty(t *testing.T) {
	if EntryPoint07Address == "" {
		t.Error("EntryPoint07Address should not be empty")
	}
	if Safe4337ModuleAddress == "" {
		t.Error("Safe4337ModuleAddress should not be empty")
	}
	if SafeWebAuthnSharedSigner == "" {
		t.Error("SafeWebAuthnSharedSigner should not be empty")
	}
	if FCLP256Verifier == "" {
		t.Error("FCLP256Verifier should not be empty")
	}
	if P256OwnerFactory == "" {
		t.Error("P256OwnerFactory should not be empty")
	}
	if WebAuthnSignerFactory == "" {
		t.Error("WebAuthnSignerFactory should not be empty")
	}
}
