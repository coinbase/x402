package facilitator

import (
	"math/big"
	"strings"
	"testing"

	"github.com/coinbase/x402/go/mechanisms/evm"
)

// validPermit2Payload returns a fully-populated ExactPermit2Payload that should
// parse without error in BuildPermit2SettleArgs.
func validPermit2Payload() *evm.ExactPermit2Payload {
	return &evm.ExactPermit2Payload{
		Signature: "0x" + strings.Repeat("ab", 65),
		Permit2Authorization: evm.Permit2Authorization{
			From: "0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266",
			Permitted: evm.Permit2TokenPermissions{
				Token:  "0x036CbD53842c5426634e7929541eC2318f3dCF7e",
				Amount: "1000000",
			},
			Spender:  "0x0000000000000000000000000000000000000001",
			Nonce:    "42",
			Deadline: "9999999999",
			Witness: evm.Permit2Witness{
				To:         "0x70997970C51812dc3A010C7d01b50e0d17dc79C8",
				ValidAfter: "1700000000",
			},
		},
	}
}

func TestBuildPermit2SettleArgs(t *testing.T) {
	t.Run("parses all fields correctly on valid input", func(t *testing.T) {
		payload := validPermit2Payload()
		args, err := BuildPermit2SettleArgs(payload)
		if err != nil {
			t.Fatalf("unexpected error: %v", err)
		}

		// Permitted token address
		wantToken := "0x036CbD53842c5426634e7929541eC2318f3dCF7e"
		if !strings.EqualFold(args.Permit.Permitted.Token.Hex(), wantToken) {
			t.Errorf("Permit.Permitted.Token = %s, want %s", args.Permit.Permitted.Token.Hex(), wantToken)
		}

		// Permitted amount
		wantAmount := big.NewInt(1_000_000)
		if args.Permit.Permitted.Amount.Cmp(wantAmount) != 0 {
			t.Errorf("Permit.Permitted.Amount = %s, want %s", args.Permit.Permitted.Amount, wantAmount)
		}

		// Nonce
		wantNonce := big.NewInt(42)
		if args.Permit.Nonce.Cmp(wantNonce) != 0 {
			t.Errorf("Permit.Nonce = %s, want %s", args.Permit.Nonce, wantNonce)
		}

		// Deadline
		wantDeadline := big.NewInt(9_999_999_999)
		if args.Permit.Deadline.Cmp(wantDeadline) != 0 {
			t.Errorf("Permit.Deadline = %s, want %s", args.Permit.Deadline, wantDeadline)
		}

		// Owner
		wantOwner := "0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266"
		if !strings.EqualFold(args.Owner.Hex(), wantOwner) {
			t.Errorf("Owner = %s, want %s", args.Owner.Hex(), wantOwner)
		}

		// Witness.To
		wantTo := "0x70997970C51812dc3A010C7d01b50e0d17dc79C8"
		if !strings.EqualFold(args.Witness.To.Hex(), wantTo) {
			t.Errorf("Witness.To = %s, want %s", args.Witness.To.Hex(), wantTo)
		}

		// Witness.ValidAfter
		wantValidAfter := big.NewInt(1_700_000_000)
		if args.Witness.ValidAfter.Cmp(wantValidAfter) != 0 {
			t.Errorf("Witness.ValidAfter = %s, want %s", args.Witness.ValidAfter, wantValidAfter)
		}

		// Signature bytes
		wantSigLen := 65
		if len(args.Signature) != wantSigLen {
			t.Errorf("Signature length = %d, want %d", len(args.Signature), wantSigLen)
		}
	})

	t.Run("returns error on invalid permitted amount", func(t *testing.T) {
		payload := validPermit2Payload()
		payload.Permit2Authorization.Permitted.Amount = "not-a-number"
		_, err := BuildPermit2SettleArgs(payload)
		if err == nil {
			t.Fatal("expected error, got nil")
		}
		if !strings.Contains(err.Error(), "permitted amount") {
			t.Errorf("error message should mention 'permitted amount', got: %s", err.Error())
		}
	})

	t.Run("returns error on empty permitted amount", func(t *testing.T) {
		payload := validPermit2Payload()
		payload.Permit2Authorization.Permitted.Amount = ""
		_, err := BuildPermit2SettleArgs(payload)
		if err == nil {
			t.Fatal("expected error, got nil")
		}
	})

	t.Run("returns error on invalid nonce", func(t *testing.T) {
		payload := validPermit2Payload()
		payload.Permit2Authorization.Nonce = "abc"
		_, err := BuildPermit2SettleArgs(payload)
		if err == nil {
			t.Fatal("expected error, got nil")
		}
		if !strings.Contains(err.Error(), "nonce") {
			t.Errorf("error message should mention 'nonce', got: %s", err.Error())
		}
	})

	t.Run("returns error on invalid deadline", func(t *testing.T) {
		payload := validPermit2Payload()
		payload.Permit2Authorization.Deadline = "not-a-timestamp"
		_, err := BuildPermit2SettleArgs(payload)
		if err == nil {
			t.Fatal("expected error, got nil")
		}
		if !strings.Contains(err.Error(), "deadline") {
			t.Errorf("error message should mention 'deadline', got: %s", err.Error())
		}
	})

	t.Run("returns error on invalid validAfter", func(t *testing.T) {
		payload := validPermit2Payload()
		payload.Permit2Authorization.Witness.ValidAfter = "???"
		_, err := BuildPermit2SettleArgs(payload)
		if err == nil {
			t.Fatal("expected error, got nil")
		}
		if !strings.Contains(err.Error(), "validAfter") {
			t.Errorf("error message should mention 'validAfter', got: %s", err.Error())
		}
	})

	t.Run("returns error on invalid signature hex", func(t *testing.T) {
		payload := validPermit2Payload()
		payload.Signature = "0xZZZZ" // not valid hex
		_, err := BuildPermit2SettleArgs(payload)
		if err == nil {
			t.Fatal("expected error on invalid signature hex, got nil")
		}
	})

	t.Run("accepts zero values for numeric fields", func(t *testing.T) {
		payload := validPermit2Payload()
		payload.Permit2Authorization.Permitted.Amount = "0"
		payload.Permit2Authorization.Nonce = "0"
		payload.Permit2Authorization.Witness.ValidAfter = "0"
		args, err := BuildPermit2SettleArgs(payload)
		if err != nil {
			t.Fatalf("unexpected error: %v", err)
		}
		if args.Permit.Permitted.Amount.Sign() != 0 {
			t.Errorf("expected Amount=0, got %s", args.Permit.Permitted.Amount)
		}
		if args.Permit.Nonce.Sign() != 0 {
			t.Errorf("expected Nonce=0, got %s", args.Permit.Nonce)
		}
	})

	t.Run("handles large uint256 amount", func(t *testing.T) {
		maxUint256 := "115792089237316195423570985008687907853269984665640564039457584007913129639935"
		payload := validPermit2Payload()
		payload.Permit2Authorization.Permitted.Amount = maxUint256
		args, err := BuildPermit2SettleArgs(payload)
		if err != nil {
			t.Fatalf("unexpected error on MaxUint256 amount: %v", err)
		}
		want, _ := new(big.Int).SetString(maxUint256, 10)
		if args.Permit.Permitted.Amount.Cmp(want) != 0 {
			t.Errorf("Amount = %s, want %s", args.Permit.Permitted.Amount, want)
		}
	})
}

func TestParseError(t *testing.T) {
	t.Run("Error() returns 'invalid <field>'", func(t *testing.T) {
		pe := errParse("nonce")
		if pe.Error() != "invalid nonce" {
			t.Errorf("expected 'invalid nonce', got %q", pe.Error())
		}
	})

	t.Run("wraps field name correctly for different fields", func(t *testing.T) {
		cases := []struct {
			field string
			want  string
		}{
			{"permitted amount", "invalid permitted amount"},
			{"deadline", "invalid deadline"},
			{"validAfter", "invalid validAfter"},
			{"eip2612 amount", "invalid eip2612 amount"},
		}
		for _, tc := range cases {
			pe := errParse(tc.field)
			if pe.Error() != tc.want {
				t.Errorf("errParse(%q).Error() = %q, want %q", tc.field, pe.Error(), tc.want)
			}
		}
	})
}
