package facilitator

import (
	"testing"
)

func TestFacilitatorErrorConstants(t *testing.T) {
	tests := []struct {
		name  string
		value string
		want  string
	}{
		{"ErrMissingUserOperation", ErrMissingUserOperation, "erc4337_missing_user_operation"},
		{"ErrMissingBundlerUrl", ErrMissingBundlerUrl, "erc4337_missing_bundler_url"},
		{"ErrMissingEntryPoint", ErrMissingEntryPoint, "erc4337_missing_entry_point"},
		{"ErrGasEstimationFailed", ErrGasEstimationFailed, "erc4337_gas_estimation_failed"},
		{"ErrSendFailed", ErrSendFailed, "erc4337_send_failed"},
		{"ErrReceiptTimeout", ErrReceiptTimeout, "erc4337_receipt_timeout"},
		{"ErrReceiptPollFailed", ErrReceiptPollFailed, "erc4337_receipt_poll_failed"},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			if tt.value != tt.want {
				t.Errorf("%s = %q, want %q", tt.name, tt.value, tt.want)
			}
			if tt.value == "" {
				t.Errorf("%s should not be empty", tt.name)
			}
		})
	}
}

func TestFacilitatorErrorConstants_AllUnique(t *testing.T) {
	constants := []string{
		ErrMissingUserOperation,
		ErrMissingBundlerUrl,
		ErrMissingEntryPoint,
		ErrGasEstimationFailed,
		ErrSendFailed,
		ErrReceiptTimeout,
		ErrReceiptPollFailed,
	}

	seen := make(map[string]bool)
	for _, c := range constants {
		if seen[c] {
			t.Errorf("duplicate error constant value: %q", c)
		}
		seen[c] = true
	}
}
