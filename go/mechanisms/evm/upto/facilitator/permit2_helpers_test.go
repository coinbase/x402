package facilitator

import (
	"math/big"
	"strings"
	"testing"
)

// ─── asBigInt ────────────────────────────────────────────────────────────────

func TestAsBigInt_Pointer(t *testing.T) {
	in := big.NewInt(12345)
	out := asBigInt(in)
	if out == nil || out.Int64() != 12345 {
		t.Errorf("expected 12345, got %v", out)
	}
}

func TestAsBigInt_Value(t *testing.T) {
	in := *big.NewInt(99)
	out := asBigInt(in)
	if out == nil || out.Int64() != 99 {
		t.Errorf("expected 99, got %v", out)
	}
}

func TestAsBigInt_NonNumericType(t *testing.T) {
	out := asBigInt("not-a-number")
	if out != nil {
		t.Errorf("expected nil for string input, got %v", out)
	}
}

func TestAsBigInt_Nil(t *testing.T) {
	out := asBigInt(nil)
	if out != nil {
		t.Errorf("expected nil for nil input, got %v", out)
	}
}

func TestAsBigInt_Int64Type(t *testing.T) {
	out := asBigInt(int64(42))
	if out != nil {
		t.Errorf("expected nil for int64 input (not big.Int), got %v", out)
	}
}

// ─── errParse / parseError ───────────────────────────────────────────────────

func TestErrParse_ErrorFormat(t *testing.T) {
	err := errParse("my field")
	if err.Error() != "invalid my field" {
		t.Errorf("unexpected error message: %q", err.Error())
	}
}

func TestErrParse_AllKnownCallSites(t *testing.T) {
	// Verify errParse is usable with each field name that appears in permit2_helpers.go.
	callSites := []string{
		"permitted amount",
		"nonce",
		"deadline",
		"validAfter",
		"eip2612 amount",
		"eip2612 deadline",
	}
	for _, field := range callSites {
		err := errParse(field)
		if !strings.Contains(err.Error(), field) {
			t.Errorf("errParse(%q) = %q, want to contain field name", field, err.Error())
		}
	}
}

// ─── BuildUptoPermit2SettleArgs — additional cases ───────────────────────────

// TestBuildUptoPermit2SettleArgs_ZeroValues verifies that all-zero decimal strings
// are accepted (they are valid big.Int values).
func TestBuildUptoPermit2SettleArgs_ZeroValues(t *testing.T) {
	p := buildValidUptoPayload(testFacilitatorAddr)
	p.Permit2Authorization.Permitted.Amount = "0"
	p.Permit2Authorization.Nonce = "0"
	p.Permit2Authorization.Deadline = "0"
	p.Permit2Authorization.Witness.ValidAfter = "0"

	args, err := BuildUptoPermit2SettleArgs(p, big.NewInt(0))
	if err != nil {
		t.Fatalf("unexpected error for zero values: %v", err)
	}
	if args.Permit.Permitted.Amount.Sign() != 0 {
		t.Error("expected permitted amount == 0")
	}
	if args.SettlementAmount.Sign() != 0 {
		t.Error("expected settlementAmount == 0")
	}
}

// TestBuildUptoPermit2SettleArgs_MaxUint256 verifies that MaxUint256 is parsed without
// overflow. This is important because Permit2 uses uint256 nonces.
func TestBuildUptoPermit2SettleArgs_MaxUint256Amount(t *testing.T) {
	maxUint256 := new(big.Int).Sub(new(big.Int).Lsh(big.NewInt(1), 256), big.NewInt(1))
	p := buildValidUptoPayload(testFacilitatorAddr)
	p.Permit2Authorization.Permitted.Amount = maxUint256.String()

	args, err := BuildUptoPermit2SettleArgs(p, maxUint256)
	if err != nil {
		t.Fatalf("unexpected error for MaxUint256: %v", err)
	}
	if args.Permit.Permitted.Amount.Cmp(maxUint256) != 0 {
		t.Errorf("permitted amount: got %s, want %s", args.Permit.Permitted.Amount, maxUint256)
	}
	if args.SettlementAmount.Cmp(maxUint256) != 0 {
		t.Errorf("settlementAmount: got %s, want %s", args.SettlementAmount, maxUint256)
	}
}

// TestBuildUptoPermit2SettleArgs_FacilitatorAddressForwarded verifies that the
// Facilitator field from the upto witness is correctly forwarded into args.Witness.Facilitator.
// This field does not exist in the exact scheme — it is unique to upto.
func TestBuildUptoPermit2SettleArgs_FacilitatorAddressForwarded(t *testing.T) {
	p := buildValidUptoPayload(testFacilitatorAddr)

	args, err := BuildUptoPermit2SettleArgs(p, big.NewInt(1))
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	// The facilitator address must be non-zero.
	zeroAddr := "0x0000000000000000000000000000000000000000"
	if strings.EqualFold(args.Witness.Facilitator.Hex(), zeroAddr) {
		t.Errorf("facilitator should not be zero address, got %s", args.Witness.Facilitator.Hex())
	}
}
