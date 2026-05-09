package evm_test

import (
	"testing"

	"github.com/coinbase/x402/go/mechanisms/evm"
)

// ─── ExactPermit2Payload ─────────────────────────────────────────────────────

func TestExactPermit2Payload_ToMap_Shape(t *testing.T) {
	p := &evm.ExactPermit2Payload{
		Signature: "0xdeadbeef",
		Permit2Authorization: evm.Permit2Authorization{
			From:    "0x1111111111111111111111111111111111111111",
			Spender: "0x2222222222222222222222222222222222222222",
			Nonce:   "42",
			Deadline: "9999999999",
			Permitted: evm.Permit2TokenPermissions{
				Token:  "0x3333333333333333333333333333333333333333",
				Amount: "1000000",
			},
			Witness: evm.Permit2Witness{
				To:         "0x4444444444444444444444444444444444444444",
				ValidAfter: "1000",
			},
		},
	}

	m := p.ToMap()

	if m["signature"] != "0xdeadbeef" {
		t.Errorf("signature mismatch: got %v", m["signature"])
	}
	auth, ok := m["permit2Authorization"].(map[string]interface{})
	if !ok {
		t.Fatal("permit2Authorization missing or wrong type")
	}
	if auth["from"] != "0x1111111111111111111111111111111111111111" {
		t.Errorf("from mismatch: %v", auth["from"])
	}
	if auth["spender"] != "0x2222222222222222222222222222222222222222" {
		t.Errorf("spender mismatch: %v", auth["spender"])
	}
	if auth["nonce"] != "42" {
		t.Errorf("nonce mismatch: %v", auth["nonce"])
	}
	if auth["deadline"] != "9999999999" {
		t.Errorf("deadline mismatch: %v", auth["deadline"])
	}

	permitted, ok := auth["permitted"].(map[string]interface{})
	if !ok {
		t.Fatal("permitted missing or wrong type")
	}
	if permitted["token"] != "0x3333333333333333333333333333333333333333" {
		t.Errorf("token mismatch: %v", permitted["token"])
	}
	if permitted["amount"] != "1000000" {
		t.Errorf("amount mismatch: %v", permitted["amount"])
	}

	witness, ok := auth["witness"].(map[string]interface{})
	if !ok {
		t.Fatal("witness missing or wrong type")
	}
	if witness["to"] != "0x4444444444444444444444444444444444444444" {
		t.Errorf("witness.to mismatch: %v", witness["to"])
	}
	if witness["validAfter"] != "1000" {
		t.Errorf("witness.validAfter mismatch: %v", witness["validAfter"])
	}
}

func TestExactPermit2Payload_RoundTrip(t *testing.T) {
	original := &evm.ExactPermit2Payload{
		Signature: "0xaabbccdd",
		Permit2Authorization: evm.Permit2Authorization{
			From:    "0xAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA",
			Spender: "0xBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBB",
			Nonce:   "99",
			Deadline: "1234567890",
			Permitted: evm.Permit2TokenPermissions{
				Token:  "0xCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCC",
				Amount: "500000",
			},
			Witness: evm.Permit2Witness{
				To:         "0xDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDD",
				ValidAfter: "2000",
			},
		},
	}

	m := original.ToMap()
	got, err := evm.Permit2PayloadFromMap(m)
	if err != nil {
		t.Fatalf("Permit2PayloadFromMap returned error: %v", err)
	}
	if got.Signature != original.Signature {
		t.Errorf("signature: want %s, got %s", original.Signature, got.Signature)
	}
	if got.Permit2Authorization.From != original.Permit2Authorization.From {
		t.Errorf("from: want %s, got %s", original.Permit2Authorization.From, got.Permit2Authorization.From)
	}
	if got.Permit2Authorization.Nonce != original.Permit2Authorization.Nonce {
		t.Errorf("nonce: want %s, got %s", original.Permit2Authorization.Nonce, got.Permit2Authorization.Nonce)
	}
	if got.Permit2Authorization.Permitted.Amount != original.Permit2Authorization.Permitted.Amount {
		t.Errorf("permitted.amount: want %s, got %s", original.Permit2Authorization.Permitted.Amount, got.Permit2Authorization.Permitted.Amount)
	}
	if got.Permit2Authorization.Witness.ValidAfter != original.Permit2Authorization.Witness.ValidAfter {
		t.Errorf("witness.validAfter: want %s, got %s", original.Permit2Authorization.Witness.ValidAfter, got.Permit2Authorization.Witness.ValidAfter)
	}
}

func TestPermit2PayloadFromMap_MissingAuth(t *testing.T) {
	_, err := evm.Permit2PayloadFromMap(map[string]interface{}{
		"signature": "0xsig",
	})
	if err == nil {
		t.Error("expected error for missing permit2Authorization, got nil")
	}
}

func TestPermit2PayloadFromMap_MissingFrom(t *testing.T) {
	_, err := evm.Permit2PayloadFromMap(map[string]interface{}{
		"permit2Authorization": map[string]interface{}{
			"spender":  "0xSPENDER",
			"nonce":    "1",
			"deadline": "99",
			"permitted": map[string]interface{}{
				"token": "0xTOKEN", "amount": "100",
			},
			"witness": map[string]interface{}{
				"to": "0xTO", "validAfter": "0",
			},
		},
	})
	if err == nil {
		t.Error("expected error for missing from field, got nil")
	}
}

func TestPermit2PayloadFromMap_MissingPermitted(t *testing.T) {
	_, err := evm.Permit2PayloadFromMap(map[string]interface{}{
		"permit2Authorization": map[string]interface{}{
			"from":    "0xFROM",
			"spender": "0xSPENDER",
			"nonce":   "1",
			"deadline": "99",
			// missing "permitted"
			"witness": map[string]interface{}{
				"to": "0xTO", "validAfter": "0",
			},
		},
	})
	if err == nil {
		t.Error("expected error for missing permitted, got nil")
	}
}

func TestPermit2PayloadFromMap_MissingWitness(t *testing.T) {
	_, err := evm.Permit2PayloadFromMap(map[string]interface{}{
		"permit2Authorization": map[string]interface{}{
			"from":    "0xFROM",
			"spender": "0xSPENDER",
			"nonce":   "1",
			"deadline": "99",
			"permitted": map[string]interface{}{
				"token": "0xTOKEN", "amount": "100",
			},
			// missing "witness"
		},
	})
	if err == nil {
		t.Error("expected error for missing witness, got nil")
	}
}

// ─── UptoPermit2Payload ──────────────────────────────────────────────────────

func makeValidUptoMap() map[string]interface{} {
	return map[string]interface{}{
		"signature": "0xdeadcafe",
		"permit2Authorization": map[string]interface{}{
			"from":    "0x1111111111111111111111111111111111111111",
			"spender": "0x2222222222222222222222222222222222222222",
			"nonce":   "7",
			"deadline": "8888888888",
			"permitted": map[string]interface{}{
				"token":  "0x3333333333333333333333333333333333333333",
				"amount": "2000000",
			},
			"witness": map[string]interface{}{
				"to":          "0x4444444444444444444444444444444444444444",
				"facilitator": "0x5555555555555555555555555555555555555555",
				"validAfter":  "500",
			},
		},
	}
}

func TestUptoPermit2Payload_ToMap_Shape(t *testing.T) {
	p := &evm.UptoPermit2Payload{
		Signature: "0xdeadcafe",
		Permit2Authorization: evm.UptoPermit2Authorization{
			From:    "0x1111111111111111111111111111111111111111",
			Spender: "0x2222222222222222222222222222222222222222",
			Nonce:   "7",
			Deadline: "8888888888",
			Permitted: evm.Permit2TokenPermissions{
				Token:  "0x3333333333333333333333333333333333333333",
				Amount: "2000000",
			},
			Witness: evm.UptoPermit2Witness{
				To:          "0x4444444444444444444444444444444444444444",
				Facilitator: "0x5555555555555555555555555555555555555555",
				ValidAfter:  "500",
			},
		},
	}

	m := p.ToMap()

	if m["signature"] != "0xdeadcafe" {
		t.Errorf("signature mismatch: %v", m["signature"])
	}
	auth, ok := m["permit2Authorization"].(map[string]interface{})
	if !ok {
		t.Fatal("permit2Authorization missing or wrong type")
	}
	witness, ok := auth["witness"].(map[string]interface{})
	if !ok {
		t.Fatal("witness missing or wrong type")
	}
	// Upto witness must include facilitator field
	if witness["facilitator"] != "0x5555555555555555555555555555555555555555" {
		t.Errorf("facilitator mismatch: %v", witness["facilitator"])
	}
	if witness["to"] != "0x4444444444444444444444444444444444444444" {
		t.Errorf("witness.to mismatch: %v", witness["to"])
	}
	if witness["validAfter"] != "500" {
		t.Errorf("validAfter mismatch: %v", witness["validAfter"])
	}
}

func TestUptoPermit2Payload_RoundTrip(t *testing.T) {
	original := makeValidUptoMap()
	payload, err := evm.UptoPermit2PayloadFromMap(original)
	if err != nil {
		t.Fatalf("UptoPermit2PayloadFromMap error: %v", err)
	}

	back := payload.ToMap()
	restored, err := evm.UptoPermit2PayloadFromMap(back)
	if err != nil {
		t.Fatalf("round-trip UptoPermit2PayloadFromMap error: %v", err)
	}

	if restored.Signature != payload.Signature {
		t.Errorf("signature: want %s, got %s", payload.Signature, restored.Signature)
	}
	if restored.Permit2Authorization.From != payload.Permit2Authorization.From {
		t.Errorf("from: want %s, got %s", payload.Permit2Authorization.From, restored.Permit2Authorization.From)
	}
	if restored.Permit2Authorization.Witness.Facilitator != payload.Permit2Authorization.Witness.Facilitator {
		t.Errorf("facilitator: want %s, got %s",
			payload.Permit2Authorization.Witness.Facilitator,
			restored.Permit2Authorization.Witness.Facilitator)
	}
	if restored.Permit2Authorization.Permitted.Amount != payload.Permit2Authorization.Permitted.Amount {
		t.Errorf("amount: want %s, got %s",
			payload.Permit2Authorization.Permitted.Amount,
			restored.Permit2Authorization.Permitted.Amount)
	}
}

func TestUptoPermit2PayloadFromMap_MissingAuth(t *testing.T) {
	_, err := evm.UptoPermit2PayloadFromMap(map[string]interface{}{
		"signature": "0xsig",
	})
	if err == nil {
		t.Error("expected error for missing permit2Authorization")
	}
}

func TestUptoPermit2PayloadFromMap_MissingFrom(t *testing.T) {
	m := makeValidUptoMap()
	auth := m["permit2Authorization"].(map[string]interface{})
	delete(auth, "from")
	_, err := evm.UptoPermit2PayloadFromMap(m)
	if err == nil {
		t.Error("expected error for missing from")
	}
}

func TestUptoPermit2PayloadFromMap_MissingFacilitator(t *testing.T) {
	m := makeValidUptoMap()
	auth := m["permit2Authorization"].(map[string]interface{})
	witness := auth["witness"].(map[string]interface{})
	delete(witness, "facilitator")
	_, err := evm.UptoPermit2PayloadFromMap(m)
	if err == nil {
		t.Error("expected error for missing witness.facilitator")
	}
}

func TestUptoPermit2PayloadFromMap_MissingWitness(t *testing.T) {
	m := makeValidUptoMap()
	auth := m["permit2Authorization"].(map[string]interface{})
	delete(auth, "witness")
	_, err := evm.UptoPermit2PayloadFromMap(m)
	if err == nil {
		t.Error("expected error for missing witness")
	}
}

func TestUptoPermit2PayloadFromMap_MissingPermitted(t *testing.T) {
	m := makeValidUptoMap()
	auth := m["permit2Authorization"].(map[string]interface{})
	delete(auth, "permitted")
	_, err := evm.UptoPermit2PayloadFromMap(m)
	if err == nil {
		t.Error("expected error for missing permitted")
	}
}

// ─── IsUptoPermit2Payload ────────────────────────────────────────────────────

func TestIsUptoPermit2Payload_Valid(t *testing.T) {
	m := makeValidUptoMap()
	if !evm.IsUptoPermit2Payload(m) {
		t.Error("expected IsUptoPermit2Payload=true for valid upto map")
	}
}

func TestIsUptoPermit2Payload_MissingSignature(t *testing.T) {
	m := makeValidUptoMap()
	delete(m, "signature")
	if evm.IsUptoPermit2Payload(m) {
		t.Error("expected false when signature is missing")
	}
}

func TestIsUptoPermit2Payload_MissingAuth(t *testing.T) {
	m := makeValidUptoMap()
	delete(m, "permit2Authorization")
	if evm.IsUptoPermit2Payload(m) {
		t.Error("expected false when permit2Authorization is missing")
	}
}

func TestIsUptoPermit2Payload_MissingFacilitator(t *testing.T) {
	m := makeValidUptoMap()
	auth := m["permit2Authorization"].(map[string]interface{})
	witness := auth["witness"].(map[string]interface{})
	delete(witness, "facilitator")
	if evm.IsUptoPermit2Payload(m) {
		t.Error("expected false when witness.facilitator is missing")
	}
}

func TestIsUptoPermit2Payload_ExactPayloadReturnsFalse(t *testing.T) {
	// An exact Permit2 payload lacks witness.facilitator
	m := map[string]interface{}{
		"signature": "0xsig",
		"permit2Authorization": map[string]interface{}{
			"from":    "0xFROM",
			"spender": "0xSPENDER",
			"nonce":   "1",
			"deadline": "99",
			"permitted": map[string]interface{}{
				"token": "0xTOKEN", "amount": "100",
			},
			"witness": map[string]interface{}{
				"to":         "0xTO",
				"validAfter": "0",
				// no "facilitator"
			},
		},
	}
	if evm.IsUptoPermit2Payload(m) {
		t.Error("expected false for exact Permit2 map (missing facilitator in witness)")
	}
}

func TestIsUptoPermit2Payload_EmptyMap(t *testing.T) {
	if evm.IsUptoPermit2Payload(map[string]interface{}{}) {
		t.Error("expected false for empty map")
	}
}
