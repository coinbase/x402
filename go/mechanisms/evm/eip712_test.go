package evm

import (
	"math/big"
	"testing"
)

// ─── helpers ──────────────────────────────────────────────────────────────────

const (
	testFrom     = "0xa0a0a0a0a0a0a0a0a0a0a0a0a0a0a0a0a0a0a0a0"
	testTo       = "0xb1b1b1b1b1b1b1b1b1b1b1b1b1b1b1b1b1b1b1b1"
	testFacil    = "0xc2c2c2c2c2c2c2c2c2c2c2c2c2c2c2c2c2c2c2c2"
	testToken    = "0x036cBD53842c5426634e7929541eC2318f3dCF7e" // Base Sepolia USDC
	testAmount   = "1000000"                                   // 1 USDC (6 decimals)
	testNonce32  = "0x" + "0102030405060708090a0b0c0d0e0f101112131415161718191a1b1c1d1e1f20" // 32 bytes
	testValidAfter  = "0"
	testValidBefore = "9999999999"
	testDeadline    = "9999999999"
)

func testChainID() *big.Int { return big.NewInt(84532) } // Base Sepolia

// ─── BuildPermit2WitnessMap ──────────────────────────────────────────────────

func TestBuildPermit2WitnessMap_Keys(t *testing.T) {
	va := big.NewInt(12345)
	m := BuildPermit2WitnessMap(testTo, va)

	if _, ok := m["to"]; !ok {
		t.Error("missing key 'to'")
	}
	if _, ok := m["validAfter"]; !ok {
		t.Error("missing key 'validAfter'")
	}
	if len(m) != 2 {
		t.Errorf("expected 2 keys, got %d", len(m))
	}
}

func TestBuildPermit2WitnessMap_Values(t *testing.T) {
	va := big.NewInt(99999)
	m := BuildPermit2WitnessMap(testTo, va)

	if m["to"] != testTo {
		t.Errorf("to: got %v, want %s", m["to"], testTo)
	}
	if m["validAfter"] != va {
		t.Errorf("validAfter: got %v, want %v", m["validAfter"], va)
	}
}

func TestBuildPermit2WitnessMap_ZeroValidAfter(t *testing.T) {
	m := BuildPermit2WitnessMap(testTo, big.NewInt(0))
	if va, ok := m["validAfter"].(*big.Int); !ok || va.Sign() != 0 {
		t.Errorf("expected zero validAfter, got %v", m["validAfter"])
	}
}

// ─── BuildUptoPermit2WitnessMap ──────────────────────────────────────────────

func TestBuildUptoPermit2WitnessMap_Keys(t *testing.T) {
	va := big.NewInt(500)
	m := BuildUptoPermit2WitnessMap(testTo, testFacil, va)

	for _, key := range []string{"to", "facilitator", "validAfter"} {
		if _, ok := m[key]; !ok {
			t.Errorf("missing key %q", key)
		}
	}
	if len(m) != 3 {
		t.Errorf("expected 3 keys, got %d", len(m))
	}
}

func TestBuildUptoPermit2WitnessMap_Values(t *testing.T) {
	va := big.NewInt(42)
	m := BuildUptoPermit2WitnessMap(testTo, testFacil, va)

	if m["to"] != testTo {
		t.Errorf("to: got %v, want %s", m["to"], testTo)
	}
	if m["facilitator"] != testFacil {
		t.Errorf("facilitator: got %v, want %s", m["facilitator"], testFacil)
	}
	if m["validAfter"] != va {
		t.Errorf("validAfter: got %v, want %v", m["validAfter"], va)
	}
}

// ─── HashTypedData ────────────────────────────────────────────────────────────

func TestHashTypedData_Returns32Bytes(t *testing.T) {
	domain := TypedDataDomain{
		Name:              "Test",
		Version:           "1",
		ChainID:           testChainID(),
		VerifyingContract: testToken,
	}
	types := map[string][]TypedDataField{
		"TestMsg": {{Name: "value", Type: "uint256"}},
	}
	message := map[string]interface{}{"value": big.NewInt(1)}

	hash, err := HashTypedData(domain, types, "TestMsg", message)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if len(hash) != 32 {
		t.Errorf("expected 32 bytes, got %d", len(hash))
	}
}

func TestHashTypedData_Deterministic(t *testing.T) {
	domain := TypedDataDomain{
		Name:              "Determinism",
		Version:           "1",
		ChainID:           testChainID(),
		VerifyingContract: testToken,
	}
	types := map[string][]TypedDataField{
		"Msg": {{Name: "v", Type: "uint256"}},
	}
	msg := map[string]interface{}{"v": big.NewInt(7)}

	h1, err1 := HashTypedData(domain, types, "Msg", msg)
	h2, err2 := HashTypedData(domain, types, "Msg", msg)
	if err1 != nil || err2 != nil {
		t.Fatalf("errors: %v / %v", err1, err2)
	}

	for i := range h1 {
		if h1[i] != h2[i] {
			t.Fatal("hash not deterministic")
		}
	}
}

func TestHashTypedData_DifferentInputsDifferentHash(t *testing.T) {
	domain := TypedDataDomain{
		Name:              "Test",
		Version:           "1",
		ChainID:           testChainID(),
		VerifyingContract: testToken,
	}
	types := map[string][]TypedDataField{
		"Msg": {{Name: "v", Type: "uint256"}},
	}

	h1, _ := HashTypedData(domain, types, "Msg", map[string]interface{}{"v": big.NewInt(1)})
	h2, _ := HashTypedData(domain, types, "Msg", map[string]interface{}{"v": big.NewInt(2)})

	if len(h1) == 0 || len(h2) == 0 {
		t.Fatal("empty hashes")
	}
	same := true
	for i := range h1 {
		if h1[i] != h2[i] {
			same = false
			break
		}
	}
	if same {
		t.Error("different inputs produced same hash")
	}
}

// ─── HashEIP3009Authorization ─────────────────────────────────────────────────

func makeEIP3009Auth() ExactEIP3009Authorization {
	return ExactEIP3009Authorization{
		From:        testFrom,
		To:          testTo,
		Value:       testAmount,
		ValidAfter:  testValidAfter,
		ValidBefore: testValidBefore,
		Nonce:       testNonce32,
	}
}

func TestHashEIP3009Authorization_Returns32Bytes(t *testing.T) {
	auth := makeEIP3009Auth()
	hash, err := HashEIP3009Authorization(auth, testChainID(), testToken, "USD Coin", "2")
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if len(hash) != 32 {
		t.Errorf("expected 32 bytes, got %d", len(hash))
	}
}

func TestHashEIP3009Authorization_Deterministic(t *testing.T) {
	auth := makeEIP3009Auth()
	h1, err := HashEIP3009Authorization(auth, testChainID(), testToken, "USD Coin", "2")
	if err != nil {
		t.Fatalf("hash error: %v", err)
	}
	h2, err := HashEIP3009Authorization(auth, testChainID(), testToken, "USD Coin", "2")
	if err != nil {
		t.Fatalf("hash error: %v", err)
	}
	for i := range h1 {
		if h1[i] != h2[i] {
			t.Fatal("hash not deterministic")
		}
	}
}

func TestHashEIP3009Authorization_InvalidValue(t *testing.T) {
	auth := makeEIP3009Auth()
	auth.Value = "not-a-number"
	_, err := HashEIP3009Authorization(auth, testChainID(), testToken, "USD Coin", "2")
	if err == nil {
		t.Error("expected error for invalid Value, got nil")
	}
}

func TestHashEIP3009Authorization_InvalidValidAfter(t *testing.T) {
	auth := makeEIP3009Auth()
	auth.ValidAfter = "abc"
	_, err := HashEIP3009Authorization(auth, testChainID(), testToken, "USD Coin", "2")
	if err == nil {
		t.Error("expected error for invalid ValidAfter, got nil")
	}
}

func TestHashEIP3009Authorization_InvalidValidBefore(t *testing.T) {
	auth := makeEIP3009Auth()
	auth.ValidBefore = "xyz"
	_, err := HashEIP3009Authorization(auth, testChainID(), testToken, "USD Coin", "2")
	if err == nil {
		t.Error("expected error for invalid ValidBefore, got nil")
	}
}

func TestHashEIP3009Authorization_InvalidNonce(t *testing.T) {
	auth := makeEIP3009Auth()
	auth.Nonce = "0xGGGG" // invalid hex
	_, err := HashEIP3009Authorization(auth, testChainID(), testToken, "USD Coin", "2")
	if err == nil {
		t.Error("expected error for invalid Nonce, got nil")
	}
}

func TestHashEIP3009Authorization_DifferentToAddressDifferentHash(t *testing.T) {
	a1 := makeEIP3009Auth()
	a2 := makeEIP3009Auth()
	a2.To = testFacil // different recipient

	h1, _ := HashEIP3009Authorization(a1, testChainID(), testToken, "USD Coin", "2")
	h2, _ := HashEIP3009Authorization(a2, testChainID(), testToken, "USD Coin", "2")

	if len(h1) == 0 || len(h2) == 0 {
		t.Fatal("empty hashes")
	}
	same := true
	for i := range h1 {
		if h1[i] != h2[i] {
			same = false
			break
		}
	}
	if same {
		t.Error("different to addresses produced same hash")
	}
}

// ─── HashPermit2Authorization ──────────────────────────────────────────────────

func makePermit2Auth() Permit2Authorization {
	return Permit2Authorization{
		From: testFrom,
		Permitted: Permit2TokenPermissions{
			Token:  testToken,
			Amount: testAmount,
		},
		Spender:  X402ExactPermit2ProxyAddress,
		Nonce:    "12345678",
		Deadline: testDeadline,
		Witness: Permit2Witness{
			To:         testTo,
			ValidAfter: testValidAfter,
		},
	}
}

func TestHashPermit2Authorization_Returns32Bytes(t *testing.T) {
	auth := makePermit2Auth()
	hash, err := HashPermit2Authorization(auth, testChainID())
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if len(hash) != 32 {
		t.Errorf("expected 32 bytes, got %d", len(hash))
	}
}

func TestHashPermit2Authorization_Deterministic(t *testing.T) {
	auth := makePermit2Auth()
	h1, err := HashPermit2Authorization(auth, testChainID())
	if err != nil {
		t.Fatalf("hash error: %v", err)
	}
	h2, err := HashPermit2Authorization(auth, testChainID())
	if err != nil {
		t.Fatalf("hash error: %v", err)
	}
	for i := range h1 {
		if h1[i] != h2[i] {
			t.Fatal("hash not deterministic")
		}
	}
}

func TestHashPermit2Authorization_InvalidAmount(t *testing.T) {
	auth := makePermit2Auth()
	auth.Permitted.Amount = "not-a-number"
	_, err := HashPermit2Authorization(auth, testChainID())
	if err == nil {
		t.Error("expected error for invalid Amount")
	}
}

func TestHashPermit2Authorization_InvalidNonce(t *testing.T) {
	auth := makePermit2Auth()
	auth.Nonce = "not-a-number"
	_, err := HashPermit2Authorization(auth, testChainID())
	if err == nil {
		t.Error("expected error for invalid Nonce")
	}
}

func TestHashPermit2Authorization_InvalidDeadline(t *testing.T) {
	auth := makePermit2Auth()
	auth.Deadline = "bad"
	_, err := HashPermit2Authorization(auth, testChainID())
	if err == nil {
		t.Error("expected error for invalid Deadline")
	}
}

func TestHashPermit2Authorization_InvalidValidAfter(t *testing.T) {
	auth := makePermit2Auth()
	auth.Witness.ValidAfter = "bad"
	_, err := HashPermit2Authorization(auth, testChainID())
	if err == nil {
		t.Error("expected error for invalid Witness.ValidAfter")
	}
}

func TestHashPermit2Authorization_DifferentNonceDifferentHash(t *testing.T) {
	a1 := makePermit2Auth()
	a2 := makePermit2Auth()
	a2.Nonce = "99999999"

	h1, _ := HashPermit2Authorization(a1, testChainID())
	h2, _ := HashPermit2Authorization(a2, testChainID())

	if len(h1) == 0 || len(h2) == 0 {
		t.Fatal("empty hashes")
	}
	same := true
	for i := range h1 {
		if h1[i] != h2[i] {
			same = false
			break
		}
	}
	if same {
		t.Error("different nonces produced same hash")
	}
}

// ─── HashUptoPermit2Authorization ─────────────────────────────────────────────

func makeUptoPermit2Auth() UptoPermit2Authorization {
	return UptoPermit2Authorization{
		From: testFrom,
		Permitted: Permit2TokenPermissions{
			Token:  testToken,
			Amount: testAmount,
		},
		Spender:  X402UptoPermit2ProxyAddress,
		Nonce:    "11111111",
		Deadline: testDeadline,
		Witness: UptoPermit2Witness{
			To:          testTo,
			Facilitator: testFacil,
			ValidAfter:  testValidAfter,
		},
	}
}

func TestHashUptoPermit2Authorization_Returns32Bytes(t *testing.T) {
	auth := makeUptoPermit2Auth()
	hash, err := HashUptoPermit2Authorization(auth, testChainID())
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if len(hash) != 32 {
		t.Errorf("expected 32 bytes, got %d", len(hash))
	}
}

func TestHashUptoPermit2Authorization_Deterministic(t *testing.T) {
	auth := makeUptoPermit2Auth()
	h1, err := HashUptoPermit2Authorization(auth, testChainID())
	if err != nil {
		t.Fatalf("hash error: %v", err)
	}
	h2, err := HashUptoPermit2Authorization(auth, testChainID())
	if err != nil {
		t.Fatalf("hash error: %v", err)
	}
	for i := range h1 {
		if h1[i] != h2[i] {
			t.Fatal("hash not deterministic")
		}
	}
}

func TestHashUptoPermit2Authorization_InvalidAmount(t *testing.T) {
	auth := makeUptoPermit2Auth()
	auth.Permitted.Amount = "bad"
	_, err := HashUptoPermit2Authorization(auth, testChainID())
	if err == nil {
		t.Error("expected error for invalid Amount")
	}
}

func TestHashUptoPermit2Authorization_InvalidNonce(t *testing.T) {
	auth := makeUptoPermit2Auth()
	auth.Nonce = "bad"
	_, err := HashUptoPermit2Authorization(auth, testChainID())
	if err == nil {
		t.Error("expected error for invalid Nonce")
	}
}

func TestHashUptoPermit2Authorization_InvalidDeadline(t *testing.T) {
	auth := makeUptoPermit2Auth()
	auth.Deadline = "bad"
	_, err := HashUptoPermit2Authorization(auth, testChainID())
	if err == nil {
		t.Error("expected error for invalid Deadline")
	}
}

func TestHashUptoPermit2Authorization_InvalidValidAfter(t *testing.T) {
	auth := makeUptoPermit2Auth()
	auth.Witness.ValidAfter = "bad"
	_, err := HashUptoPermit2Authorization(auth, testChainID())
	if err == nil {
		t.Error("expected error for invalid Witness.ValidAfter")
	}
}

func TestHashUptoPermit2Authorization_DifferentFacilitatorDifferentHash(t *testing.T) {
	a1 := makeUptoPermit2Auth()
	a2 := makeUptoPermit2Auth()
	a2.Witness.Facilitator = testTo // different facilitator

	h1, _ := HashUptoPermit2Authorization(a1, testChainID())
	h2, _ := HashUptoPermit2Authorization(a2, testChainID())

	if len(h1) == 0 || len(h2) == 0 {
		t.Fatal("empty hashes")
	}
	same := true
	for i := range h1 {
		if h1[i] != h2[i] {
			same = false
			break
		}
	}
	if same {
		t.Error("different facilitator addresses produced same hash")
	}
}

func TestHashUptoPermit2VsExactPermit2_DifferentHashes(t *testing.T) {
	// The upto hash should differ from exact because the witness type includes facilitator.
	// Use equivalent parameters to isolate the witness structure difference.
	uptoAuth := makeUptoPermit2Auth()
	exactAuth := makePermit2Auth()
	exactAuth.Nonce = uptoAuth.Nonce // same nonce

	hUpto, err1 := HashUptoPermit2Authorization(uptoAuth, testChainID())
	hExact, err2 := HashPermit2Authorization(exactAuth, testChainID())
	if err1 != nil || err2 != nil {
		t.Fatalf("hash errors: %v / %v", err1, err2)
	}

	same := true
	for i := range hUpto {
		if hUpto[i] != hExact[i] {
			same = false
			break
		}
	}
	if same {
		t.Error("upto and exact hashes should differ (different witness types)")
	}
}
