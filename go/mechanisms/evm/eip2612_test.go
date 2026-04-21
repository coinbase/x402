package evm

import (
	"fmt"
	"strings"
	"testing"
	"time"

	"github.com/coinbase/x402/go/extensions/eip2612gassponsor"
)

// ─── test helpers ────────────────────────────────────────────────────────────

const (
	testEip2612Payer = "0xa0a0a0a0a0a0a0a0a0a0a0a0a0a0a0a0a0a0a0a0"
	testEip2612Token = "0x036cbd53842c5426634e7929541ec2318f3dcf7e"
	// 65-byte dummy signature: r (32 bytes of 0xaa), s (32 bytes of 0xbb), v=27
	testEip2612Sig = "0x" +
		"aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa" +
		"bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb" +
		"1b"
)

func futureDeadlineStr() string {
	return fmt.Sprintf("%d", time.Now().Unix()+300)
}

func expiredDeadlineStr() string {
	return fmt.Sprintf("%d", time.Now().Unix()-300)
}

func makeValidEip2612Info(payer, token string) *eip2612gassponsor.Info {
	return &eip2612gassponsor.Info{
		From:      payer,
		Asset:     token,
		Spender:   PERMIT2Address,
		Amount:    "115792089237316195423570985008687907853269984665640564039457584007913129639935",
		Nonce:     "0",
		Deadline:  futureDeadlineStr(),
		Signature: testEip2612Sig,
		Version:   "2",
	}
}

// ─── ValidateEip2612PermitForPayment ─────────────────────────────────────────

func TestValidateEip2612PermitForPayment_Valid(t *testing.T) {
	info := makeValidEip2612Info(testEip2612Payer, testEip2612Token)
	if got := ValidateEip2612PermitForPayment(info, testEip2612Payer, testEip2612Token); got != "" {
		t.Errorf("expected empty string (valid), got %q", got)
	}
}

func TestValidateEip2612PermitForPayment_Valid_CaseInsensitive(t *testing.T) {
	// Payer/token in info with mixed hex case (but lowercase 0x prefix to pass
	// the format regex), call with different casing — strings.EqualFold should match.
	mixedPayer := "0xA0a0A0a0A0a0A0a0A0a0A0a0A0a0A0a0A0a0A0a0"
	mixedToken := "0x036CBD53842C5426634E7929541ec2318f3DCF7e"
	info := makeValidEip2612Info(mixedPayer, mixedToken)
	if got := ValidateEip2612PermitForPayment(info, testEip2612Payer, testEip2612Token); got != "" {
		t.Errorf("expected valid with case-insensitive match, got %q", got)
	}
}

func TestValidateEip2612PermitForPayment_InvalidFormat_EmptyFrom(t *testing.T) {
	info := makeValidEip2612Info(testEip2612Payer, testEip2612Token)
	info.From = "" // fails format validation

	got := ValidateEip2612PermitForPayment(info, testEip2612Payer, testEip2612Token)
	if got != "invalid_eip2612_extension_format" {
		t.Errorf("expected invalid_eip2612_extension_format, got %q", got)
	}
}

func TestValidateEip2612PermitForPayment_InvalidFormat_BadAddress(t *testing.T) {
	info := makeValidEip2612Info(testEip2612Payer, testEip2612Token)
	info.From = "not-an-address" // fails addressPattern

	got := ValidateEip2612PermitForPayment(info, testEip2612Payer, testEip2612Token)
	if got != "invalid_eip2612_extension_format" {
		t.Errorf("expected invalid_eip2612_extension_format, got %q", got)
	}
}

func TestValidateEip2612PermitForPayment_FromMismatch(t *testing.T) {
	info := makeValidEip2612Info(testEip2612Payer, testEip2612Token)
	differentPayer := "0xb1b1b1b1b1b1b1b1b1b1b1b1b1b1b1b1b1b1b1b1"

	got := ValidateEip2612PermitForPayment(info, differentPayer, testEip2612Token)
	if got != "eip2612_from_mismatch" {
		t.Errorf("expected eip2612_from_mismatch, got %q", got)
	}
}

func TestValidateEip2612PermitForPayment_AssetMismatch(t *testing.T) {
	info := makeValidEip2612Info(testEip2612Payer, testEip2612Token)
	differentToken := "0xc2c2c2c2c2c2c2c2c2c2c2c2c2c2c2c2c2c2c2c2"

	got := ValidateEip2612PermitForPayment(info, testEip2612Payer, differentToken)
	if got != "eip2612_asset_mismatch" {
		t.Errorf("expected eip2612_asset_mismatch, got %q", got)
	}
}

func TestValidateEip2612PermitForPayment_WrongSpender(t *testing.T) {
	info := makeValidEip2612Info(testEip2612Payer, testEip2612Token)
	info.Spender = "0x1111111111111111111111111111111111111111"

	got := ValidateEip2612PermitForPayment(info, testEip2612Payer, testEip2612Token)
	if got != "eip2612_spender_not_permit2" {
		t.Errorf("expected eip2612_spender_not_permit2, got %q", got)
	}
}

func TestValidateEip2612PermitForPayment_DeadlineExpired(t *testing.T) {
	info := makeValidEip2612Info(testEip2612Payer, testEip2612Token)
	info.Deadline = expiredDeadlineStr()

	got := ValidateEip2612PermitForPayment(info, testEip2612Payer, testEip2612Token)
	if got != "eip2612_deadline_expired" {
		t.Errorf("expected eip2612_deadline_expired, got %q", got)
	}
}

func TestValidateEip2612PermitForPayment_DeadlineNotNumeric(t *testing.T) {
	info := makeValidEip2612Info(testEip2612Payer, testEip2612Token)
	info.Deadline = "not-a-number"

	// ValidateEip2612GasSponsoringInfo uses numericPattern for Deadline, so this
	// should fail format validation before reaching the deadline check.
	got := ValidateEip2612PermitForPayment(info, testEip2612Payer, testEip2612Token)
	if got != "invalid_eip2612_extension_format" && got != "eip2612_deadline_expired" {
		t.Errorf("expected format or deadline error, got %q", got)
	}
}

func TestValidateEip2612PermitForPayment_DeadlineJustBelowBuffer(t *testing.T) {
	// Deadline is current time + (buffer - 1), so it's within the buffer window
	// and should be treated as expired.
	info := makeValidEip2612Info(testEip2612Payer, testEip2612Token)
	info.Deadline = fmt.Sprintf("%d", time.Now().Unix()+Permit2DeadlineBuffer-1)

	got := ValidateEip2612PermitForPayment(info, testEip2612Payer, testEip2612Token)
	if got != "eip2612_deadline_expired" {
		t.Errorf("expected eip2612_deadline_expired for deadline within buffer, got %q", got)
	}
}

// ─── SplitEip2612Signature ───────────────────────────────────────────────────

func TestSplitEip2612Signature_Valid_V27(t *testing.T) {
	v, r, s, err := SplitEip2612Signature(testEip2612Sig)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if v != 0x1b {
		t.Errorf("expected v=0x1b (27), got 0x%02x", v)
	}
	for i, b := range r {
		if b != 0xaa {
			t.Fatalf("r[%d] = 0x%02x, want 0xaa", i, b)
		}
	}
	for i, b := range s {
		if b != 0xbb {
			t.Fatalf("s[%d] = 0x%02x, want 0xbb", i, b)
		}
	}
}

func TestSplitEip2612Signature_Valid_V28(t *testing.T) {
	sig := "0x" +
		"cccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccc" + // r
		"dddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddd" + // s
		"1c" // v = 28

	v, r, s, err := SplitEip2612Signature(sig)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if v != 0x1c {
		t.Errorf("expected v=0x1c (28), got 0x%02x", v)
	}
	for i, b := range r {
		if b != 0xcc {
			t.Fatalf("r[%d] = 0x%02x, want 0xcc", i, b)
		}
	}
	for i, b := range s {
		if b != 0xdd {
			t.Fatalf("s[%d] = 0x%02x, want 0xdd", i, b)
		}
	}
}

func TestSplitEip2612Signature_TooShort(t *testing.T) {
	// 32 bytes only — missing s and v
	short := "0x" + strings.Repeat("aa", 32)
	if _, _, _, err := SplitEip2612Signature(short); err == nil {
		t.Error("expected error for signature shorter than 65 bytes")
	}
}

func TestSplitEip2612Signature_TooLong(t *testing.T) {
	// 66 bytes — one extra byte
	long := "0x" + strings.Repeat("aa", 66)
	if _, _, _, err := SplitEip2612Signature(long); err == nil {
		t.Error("expected error for signature longer than 65 bytes")
	}
}

func TestSplitEip2612Signature_Empty(t *testing.T) {
	if _, _, _, err := SplitEip2612Signature("0x"); err == nil {
		t.Error("expected error for empty signature")
	}
}

func TestSplitEip2612Signature_InvalidHex(t *testing.T) {
	if _, _, _, err := SplitEip2612Signature("not-hex-at-all"); err == nil {
		t.Error("expected error for non-hex input")
	}
}

func TestSplitEip2612Signature_Exactly65Bytes_RoundTrip(t *testing.T) {
	// Build a deterministic 65-byte signature and verify byte-level correctness.
	var raw [65]byte
	for i := 0; i < 32; i++ {
		raw[i] = byte(i + 1) // r: 0x01…0x20
	}
	for i := 0; i < 32; i++ {
		raw[32+i] = byte(i + 0x81) // s: 0x81…0xa0
	}
	raw[64] = 0x00 // v = 0

	hexSig := "0x" + fmt.Sprintf("%x", raw[:])
	v, r, s, err := SplitEip2612Signature(hexSig)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if v != 0x00 {
		t.Errorf("v: expected 0x00, got 0x%02x", v)
	}
	for i := 0; i < 32; i++ {
		if r[i] != byte(i+1) {
			t.Fatalf("r[%d] = 0x%02x, want 0x%02x", i, r[i], byte(i+1))
		}
	}
	for i := 0; i < 32; i++ {
		want := byte(i + 0x81)
		if s[i] != want {
			t.Fatalf("s[%d] = 0x%02x, want 0x%02x", i, s[i], want)
		}
	}
}
