package facilitator

import (
	"math/big"
	"strings"
	"testing"

	"github.com/coinbase/x402/go/mechanisms/evm"
)

// ─── ParseEIP3009Authorization ────────────────────────────────────────────────

func TestParseEIP3009Authorization_Success(t *testing.T) {
	auth := evm.ExactEIP3009Authorization{
		From:        "0xabcdef1234567890abcdef1234567890abcdef12",
		To:          "0x1234567890abcdef1234567890abcdef12345678",
		Value:       "1000000",
		ValidAfter:  "0",
		ValidBefore: "9999999999",
		Nonce:       "0x" + strings.Repeat("aa", 32),
	}

	parsed, err := ParseEIP3009Authorization(auth)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}

	if parsed.Value.Cmp(big.NewInt(1000000)) != 0 {
		t.Errorf("Value: got %s, want 1000000", parsed.Value)
	}
	if parsed.ValidAfter.Cmp(big.NewInt(0)) != 0 {
		t.Errorf("ValidAfter: got %s, want 0", parsed.ValidAfter)
	}
	if parsed.ValidBefore.Cmp(big.NewInt(9999999999)) != 0 {
		t.Errorf("ValidBefore: got %s, want 9999999999", parsed.ValidBefore)
	}
	expectedNonce := [32]byte{}
	for i := range expectedNonce {
		expectedNonce[i] = 0xaa
	}
	if parsed.Nonce != expectedNonce {
		t.Errorf("Nonce mismatch")
	}
	if strings.ToLower(parsed.From.Hex()) != "0xabcdef1234567890abcdef1234567890abcdef12" {
		t.Errorf("From mismatch: %s", parsed.From.Hex())
	}
	if strings.ToLower(parsed.To.Hex()) != "0x1234567890abcdef1234567890abcdef12345678" {
		t.Errorf("To mismatch: %s", parsed.To.Hex())
	}
}

func TestParseEIP3009Authorization_ZeroNonce(t *testing.T) {
	auth := evm.ExactEIP3009Authorization{
		From:        "0x0000000000000000000000000000000000000001",
		To:          "0x0000000000000000000000000000000000000002",
		Value:       "1",
		ValidAfter:  "1000",
		ValidBefore: "2000",
		Nonce:       "0x" + strings.Repeat("00", 32),
	}

	parsed, err := ParseEIP3009Authorization(auth)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}

	var zeroNonce [32]byte
	if parsed.Nonce != zeroNonce {
		t.Errorf("expected zero nonce, got %v", parsed.Nonce)
	}
}

func TestParseEIP3009Authorization_InvalidValue(t *testing.T) {
	auth := evm.ExactEIP3009Authorization{
		From:        "0x0000000000000000000000000000000000000001",
		To:          "0x0000000000000000000000000000000000000002",
		Value:       "not-a-number",
		ValidAfter:  "0",
		ValidBefore: "9999999999",
		Nonce:       "0x" + strings.Repeat("aa", 32),
	}

	_, err := ParseEIP3009Authorization(auth)
	if err == nil {
		t.Fatal("expected error for invalid value, got nil")
	}
	if !strings.Contains(err.Error(), "invalid authorization value") {
		t.Errorf("unexpected error message: %v", err)
	}
}

func TestParseEIP3009Authorization_InvalidValidAfter(t *testing.T) {
	auth := evm.ExactEIP3009Authorization{
		From:        "0x0000000000000000000000000000000000000001",
		To:          "0x0000000000000000000000000000000000000002",
		Value:       "1000000",
		ValidAfter:  "bad-timestamp",
		ValidBefore: "9999999999",
		Nonce:       "0x" + strings.Repeat("ab", 32),
	}

	_, err := ParseEIP3009Authorization(auth)
	if err == nil {
		t.Fatal("expected error for invalid validAfter, got nil")
	}
	if !strings.Contains(err.Error(), "invalid validAfter") {
		t.Errorf("unexpected error message: %v", err)
	}
}

func TestParseEIP3009Authorization_InvalidValidBefore(t *testing.T) {
	auth := evm.ExactEIP3009Authorization{
		From:        "0x0000000000000000000000000000000000000001",
		To:          "0x0000000000000000000000000000000000000002",
		Value:       "1000000",
		ValidAfter:  "0",
		ValidBefore: "not-a-timestamp",
		Nonce:       "0x" + strings.Repeat("cd", 32),
	}

	_, err := ParseEIP3009Authorization(auth)
	if err == nil {
		t.Fatal("expected error for invalid validBefore, got nil")
	}
	if !strings.Contains(err.Error(), "invalid validBefore") {
		t.Errorf("unexpected error message: %v", err)
	}
}

func TestParseEIP3009Authorization_InvalidNonceHex(t *testing.T) {
	auth := evm.ExactEIP3009Authorization{
		From:        "0x0000000000000000000000000000000000000001",
		To:          "0x0000000000000000000000000000000000000002",
		Value:       "1000000",
		ValidAfter:  "0",
		ValidBefore: "9999999999",
		Nonce:       "not-a-hex-nonce",
	}

	_, err := ParseEIP3009Authorization(auth)
	if err == nil {
		t.Fatal("expected error for invalid nonce hex, got nil")
	}
}

func TestParseEIP3009Authorization_WrongNonceLength(t *testing.T) {
	auth := evm.ExactEIP3009Authorization{
		From:        "0x0000000000000000000000000000000000000001",
		To:          "0x0000000000000000000000000000000000000002",
		Value:       "1000000",
		ValidAfter:  "0",
		ValidBefore: "9999999999",
		Nonce:       "0xdeadbeef", // only 4 bytes, not 32
	}

	_, err := ParseEIP3009Authorization(auth)
	if err == nil {
		t.Fatal("expected error for wrong nonce length, got nil")
	}
	if !strings.Contains(err.Error(), "nonce length") {
		t.Errorf("unexpected error message: %v", err)
	}
}

func TestParseEIP3009Authorization_LargeValue(t *testing.T) {
	// MaxUint256 as string
	maxUint256 := "115792089237316195423570985008687907853269984665640564039457584007913129639935"
	auth := evm.ExactEIP3009Authorization{
		From:        "0x0000000000000000000000000000000000000001",
		To:          "0x0000000000000000000000000000000000000002",
		Value:       maxUint256,
		ValidAfter:  "0",
		ValidBefore: "9999999999",
		Nonce:       "0x" + strings.Repeat("ff", 32),
	}

	parsed, err := ParseEIP3009Authorization(auth)
	if err != nil {
		t.Fatalf("unexpected error for max uint256 value: %v", err)
	}

	expected, _ := new(big.Int).SetString(maxUint256, 10)
	if parsed.Value.Cmp(expected) != 0 {
		t.Errorf("Value mismatch for max uint256: got %s", parsed.Value)
	}
}

// ─── HasEIP6492Deployment ─────────────────────────────────────────────────────

func TestHasEIP6492Deployment_Nil(t *testing.T) {
	if HasEIP6492Deployment(nil) {
		t.Error("expected false for nil sigData")
	}
}

func TestHasEIP6492Deployment_ZeroFactory(t *testing.T) {
	sigData := &evm.ERC6492SignatureData{
		Factory:         [20]byte{}, // zero address
		FactoryCalldata: []byte{0x01, 0x02},
		InnerSignature:  []byte("sig"),
	}
	if HasEIP6492Deployment(sigData) {
		t.Error("expected false for zero factory address")
	}
}

func TestHasEIP6492Deployment_EmptyCalldata(t *testing.T) {
	var factory [20]byte
	factory[0] = 0xab
	sigData := &evm.ERC6492SignatureData{
		Factory:         factory,
		FactoryCalldata: []byte{}, // empty calldata
		InnerSignature:  []byte("sig"),
	}
	if HasEIP6492Deployment(sigData) {
		t.Error("expected false for empty calldata")
	}
}

func TestHasEIP6492Deployment_Valid(t *testing.T) {
	var factory [20]byte
	for i := range factory {
		factory[i] = 0xde
	}
	sigData := &evm.ERC6492SignatureData{
		Factory:         factory,
		FactoryCalldata: []byte{0x60, 0x60, 0x60, 0x40},
		InnerSignature:  []byte("inner-sig"),
	}
	if !HasEIP6492Deployment(sigData) {
		t.Error("expected true for valid factory + calldata")
	}
}

func TestHasEIP6492Deployment_NilCalldata(t *testing.T) {
	var factory [20]byte
	factory[0] = 0x01
	sigData := &evm.ERC6492SignatureData{
		Factory:         factory,
		FactoryCalldata: nil, // nil counts as empty
		InnerSignature:  []byte("sig"),
	}
	if HasEIP6492Deployment(sigData) {
		t.Error("expected false for nil calldata")
	}
}

// ─── splitSignatureParts ──────────────────────────────────────────────────────

func TestSplitSignatureParts_Standard(t *testing.T) {
	// Construct a 65-byte signature: r (32) + s (32) + v (1)
	sig := make([]byte, 65)
	for i := 0; i < 32; i++ {
		sig[i] = byte(i + 1) // r bytes: 1..32
	}
	for i := 0; i < 32; i++ {
		sig[32+i] = byte(i + 33) // s bytes: 33..64
	}
	sig[64] = 28 // v already in {27, 28}

	v, r, s := splitSignatureParts(sig)

	if v != 28 {
		t.Errorf("v: got %d, want 28", v)
	}
	for i := 0; i < 32; i++ {
		if r[i] != byte(i+1) {
			t.Errorf("r[%d]: got %d, want %d", i, r[i], i+1)
		}
		if s[i] != byte(i+33) {
			t.Errorf("s[%d]: got %d, want %d", i, s[i], i+33)
		}
	}
}

func TestSplitSignatureParts_VNormalization0(t *testing.T) {
	sig := make([]byte, 65)
	sig[64] = 0 // raw v=0 should become 27

	v, _, _ := splitSignatureParts(sig)
	if v != 27 {
		t.Errorf("v: got %d, want 27 (normalized from 0)", v)
	}
}

func TestSplitSignatureParts_VNormalization1(t *testing.T) {
	sig := make([]byte, 65)
	sig[64] = 1 // raw v=1 should become 28

	v, _, _ := splitSignatureParts(sig)
	if v != 28 {
		t.Errorf("v: got %d, want 28 (normalized from 1)", v)
	}
}

func TestSplitSignatureParts_VUnchanged27(t *testing.T) {
	sig := make([]byte, 65)
	sig[64] = 27 // already 27, unchanged

	v, _, _ := splitSignatureParts(sig)
	if v != 27 {
		t.Errorf("v: got %d, want 27", v)
	}
}
