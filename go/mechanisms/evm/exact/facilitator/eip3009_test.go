package facilitator

import (
	"errors"
	"testing"
)

// TestParseEIP3009TransferError verifies that parseEIP3009TransferError maps known
// EIP-3009 / ERC-20 revert messages to the correct specific error codes, and falls
// back to ErrFailedToExecuteTransfer for unrecognised messages.
func TestParseEIP3009TransferError(t *testing.T) {
	tests := []struct {
		name     string
		errMsg   string
		expected string
	}{
		// nil input
		{
			name:     "nil error returns empty string",
			errMsg:   "",
			expected: "",
		},
		// AuthorizationExpired — custom error name (newer contracts)
		{
			name:     "AuthorizationExpired custom error",
			errMsg:   "execution reverted: AuthorizationExpired",
			expected: ErrValidBeforeExpired,
		},
		// Circle FiatToken human-readable string
		{
			name:     "FiatToken authorization is expired",
			errMsg:   "FiatTokenV2_2: authorization is expired",
			expected: ErrValidBeforeExpired,
		},
		{
			name:     "authorization expired lowercase",
			errMsg:   "contract call error: authorization expired",
			expected: ErrValidBeforeExpired,
		},
		// AuthorizationNotYetValid
		{
			name:     "AuthorizationNotYetValid custom error",
			errMsg:   "execution reverted: AuthorizationNotYetValid",
			expected: ErrValidAfterInFuture,
		},
		{
			name:     "FiatToken authorization is not yet valid",
			errMsg:   "FiatTokenV2: authorization is not yet valid",
			expected: ErrValidAfterInFuture,
		},
		{
			name:     "authorization not yet valid lowercase",
			errMsg:   "rpc error: authorization not yet valid",
			expected: ErrValidAfterInFuture,
		},
		// AuthorizationUsed / already used
		{
			name:     "AuthorizationUsed custom error",
			errMsg:   "execution reverted: AuthorizationUsed",
			expected: ErrNonceAlreadyUsed,
		},
		{
			name:     "AuthorizationAlreadyUsed custom error",
			errMsg:   "execution reverted: AuthorizationAlreadyUsed",
			expected: ErrNonceAlreadyUsed,
		},
		{
			name:     "FiatToken authorization is used",
			errMsg:   "FiatTokenV2_2: authorization is used or canceled",
			expected: ErrNonceAlreadyUsed,
		},
		{
			name:     "authorization is already used",
			errMsg:   "contract call: authorization is already used",
			expected: ErrNonceAlreadyUsed,
		},
		// Insufficient balance
		{
			name:     "ERC20InsufficientBalance custom error",
			errMsg:   "execution reverted: ERC20InsufficientBalance",
			expected: ErrInsufficientBalance,
		},
		{
			name:     "transfer amount exceeds balance",
			errMsg:   "ERC20: transfer amount exceeds balance",
			expected: ErrInsufficientBalance,
		},
		{
			name:     "insufficient balance lowercase",
			errMsg:   "rpc error: insufficient balance for transfer",
			expected: ErrInsufficientBalance,
		},
		// Invalid signature
		{
			name:     "InvalidSignature custom error",
			errMsg:   "execution reverted: InvalidSignature",
			expected: ErrInvalidSignature,
		},
		{
			name:     "FiatToken invalid signature v",
			errMsg:   "FiatTokenV2_2: ECRecover: invalid signature 'v' value",
			expected: ErrInvalidSignature,
		},
		{
			name:     "ecrecover lowercase",
			errMsg:   "contract error: ecrecover failed",
			expected: ErrInvalidSignature,
		},
		// Fallback for unrecognised errors
		{
			name:     "unknown revert falls back to ErrFailedToExecuteTransfer",
			errMsg:   "execution reverted: SomeOtherRevertReason",
			expected: ErrFailedToExecuteTransfer,
		},
		{
			name:     "RPC network error falls back to ErrFailedToExecuteTransfer",
			errMsg:   "Post https://rpc.base.org: connection refused",
			expected: ErrFailedToExecuteTransfer,
		},
	}

	for _, tc := range tests {
		t.Run(tc.name, func(t *testing.T) {
			var err error
			if tc.errMsg != "" {
				err = errors.New(tc.errMsg)
			}
			got := parseEIP3009TransferError(err)
			if got != tc.expected {
				t.Errorf("parseEIP3009TransferError(%q) = %q, want %q", tc.errMsg, got, tc.expected)
			}
		})
	}
}
