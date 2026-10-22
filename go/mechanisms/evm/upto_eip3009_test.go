package evm

import (
	"testing"
)

func TestUptoEIP3009ProxyAddressMatchesCanonicalDeployment(t *testing.T) {
	const expected = "0x40203Fa50150e6ec970DE91F3330e82cDF640006"
	if X402UptoEIP3009ProxyAddress != expected {
		t.Fatalf("proxy address mismatch: got %s, want %s", X402UptoEIP3009ProxyAddress, expected)
	}
}

func TestCreateUptoEIP3009NonceGoldenVector(t *testing.T) {
	nonce, err := CreateUptoEIP3009Nonce(
		"0x1111111111111111111111111111111111111111",
		"0x2222222222222222222222222222222222222222",
		"0x3333333333333333333333333333333333333333333333333333333333333333",
	)
	if err != nil {
		t.Fatalf("CreateUptoEIP3009Nonce failed: %v", err)
	}
	const expected = "0xbb2cf01051588e1c1c809cf1357c11cf9132a08bb4cff35b57dc1a38f28ca0fa"
	if nonce != expected {
		t.Fatalf("nonce mismatch: got %s, want %s", nonce, expected)
	}
}

func TestUptoEIP3009PayloadMapRoundTripAndGuards(t *testing.T) {
	payload := &UptoEIP3009Payload{
		Signature: "0x1234",
		Authorization: UptoEIP3009Authorization{
			From:        "0x1111111111111111111111111111111111111111",
			To:          X402UptoEIP3009ProxyAddress,
			Value:       "100",
			ValidAfter:  "0",
			ValidBefore: "2000000000",
			Nonce:       "0x4444444444444444444444444444444444444444444444444444444444444444",
		},
		PaymentInfo: UptoEIP3009PaymentInfo{
			PayTo:   "0x1111111111111111111111111111111111111111",
			Settler: "0x2222222222222222222222222222222222222222",
			Salt:    "0x3333333333333333333333333333333333333333333333333333333333333333",
		},
	}

	wire := payload.ToMap()
	if !IsUptoEIP3009Payload(wire) {
		t.Fatal("expected complete ERC-3009 payload to pass guard")
	}
	parsed, err := UptoEIP3009PayloadFromMap(wire)
	if err != nil {
		t.Fatalf("UptoEIP3009PayloadFromMap failed: %v", err)
	}
	if parsed.PaymentInfo.Settler != payload.PaymentInfo.Settler ||
		parsed.Authorization.Nonce != payload.Authorization.Nonce {
		t.Fatalf("round trip mismatch: %#v", parsed)
	}

	delete(wire["paymentInfo"].(map[string]interface{}), "salt")
	if IsUptoEIP3009Payload(wire) {
		t.Fatal("expected incomplete paymentInfo to fail guard")
	}
}

func TestUptoPayloadGuardsRejectMixedShapes(t *testing.T) {
	eip3009 := (&UptoEIP3009Payload{
		Signature: "0x12",
		Authorization: UptoEIP3009Authorization{
			From: "from", To: "to", Value: "1", ValidAfter: "0", ValidBefore: "2", Nonce: "nonce",
		},
		PaymentInfo: UptoEIP3009PaymentInfo{PayTo: "payTo", Settler: "settler", Salt: "salt"},
	}).ToMap()
	eip3009["permit2Authorization"] = map[string]interface{}{}
	if IsUptoEIP3009Payload(eip3009) || IsUptoPermit2Payload(eip3009) {
		t.Fatal("mixed payload must not match either upto payload guard")
	}
}
