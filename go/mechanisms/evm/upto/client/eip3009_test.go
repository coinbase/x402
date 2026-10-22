package client

import (
	"context"
	"math/big"
	"testing"

	x402 "github.com/x402-foundation/x402/go/v2"
	"github.com/x402-foundation/x402/go/v2/mechanisms/evm"
	"github.com/x402-foundation/x402/go/v2/types"
)

type recordingClientSigner struct {
	domain      evm.TypedDataDomain
	types       map[string][]evm.TypedDataField
	primaryType string
	message     map[string]interface{}
}

func (s *recordingClientSigner) Address() string {
	return "0x1111111111111111111111111111111111111111"
}

func (s *recordingClientSigner) SignTypedData(
	_ context.Context,
	domain evm.TypedDataDomain,
	typedDataTypes map[string][]evm.TypedDataField,
	primaryType string,
	message map[string]interface{},
) ([]byte, error) {
	s.domain = domain
	s.types = typedDataTypes
	s.primaryType = primaryType
	s.message = message
	return make([]byte, 65), nil
}

func eip3009Requirements() types.PaymentRequirements {
	return types.PaymentRequirements{
		Scheme:            evm.SchemeUpto,
		Network:           "eip155:84532",
		Amount:            "1000000",
		Asset:             "0x036CbD53842c5426634e7929541eC2318f3dCF7e",
		PayTo:             "0x2222222222222222222222222222222222222222",
		MaxTimeoutSeconds: 300,
		Extra: map[string]interface{}{
			"assetTransferMethod": string(evm.AssetTransferMethodEIP3009),
			"name":                "USDC",
			"version":             "2",
			"settlerAddress":      "0x3333333333333333333333333333333333333333",
		},
	}
}

func TestCreateUptoEIP3009Payload(t *testing.T) {
	signer := &recordingClientSigner{}
	result, err := CreateUptoEIP3009Payload(context.Background(), signer, eip3009Requirements())
	if err != nil {
		t.Fatalf("CreateUptoEIP3009Payload failed: %v", err)
	}
	if !evm.IsUptoEIP3009Payload(result.Payload) {
		t.Fatalf("expected upto EIP-3009 payload: %#v", result.Payload)
	}
	parsed, err := evm.UptoEIP3009PayloadFromMap(result.Payload)
	if err != nil {
		t.Fatal(err)
	}
	if parsed.Authorization.To != evm.X402UptoEIP3009ProxyAddress {
		t.Fatalf("receiver mismatch: %s", parsed.Authorization.To)
	}
	if parsed.Authorization.Value != "1000000" {
		t.Fatalf("maximum mismatch: %s", parsed.Authorization.Value)
	}
	expectedNonce, err := evm.CreateUptoEIP3009Nonce(
		parsed.PaymentInfo.PayTo, parsed.PaymentInfo.Settler, parsed.PaymentInfo.Salt,
	)
	if err != nil || parsed.Authorization.Nonce != expectedNonce {
		t.Fatalf("nonce mismatch: got %s, expected %s, err=%v", parsed.Authorization.Nonce, expectedNonce, err)
	}
	if signer.primaryType != "ReceiveWithAuthorization" {
		t.Fatalf("primary type mismatch: %s", signer.primaryType)
	}
	if _, ok := signer.types["ReceiveWithAuthorization"]; !ok {
		t.Fatal("missing ReceiveWithAuthorization type")
	}
	if signer.domain.ChainID.Cmp(big.NewInt(84532)) != 0 {
		t.Fatalf("chain ID mismatch: %s", signer.domain.ChainID)
	}
	if signer.message["to"] != evm.X402UptoEIP3009ProxyAddress {
		t.Fatalf("signed receiver mismatch: %v", signer.message["to"])
	}
}

func TestUptoClientDefaultsPermit2AndBranchesExplicitEIP3009(t *testing.T) {
	signer := &recordingClientSigner{}
	scheme := NewUptoEvmScheme(signer, nil)

	eipResult, err := scheme.CreatePaymentPayload(
		context.Background(), eip3009Requirements(),
		x402.PaymentPayloadContext{Extensions: map[string]interface{}{"erc20ApprovalGasSponsoring": map[string]interface{}{}}},
	)
	if err != nil {
		t.Fatalf("explicit EIP-3009 branch failed: %v", err)
	}
	if !evm.IsUptoEIP3009Payload(eipResult.Payload) || len(eipResult.Extensions) != 0 {
		t.Fatalf("EIP-3009 branch should not attach Permit2 approval extensions: %#v", eipResult)
	}

	permit2Requirements := eip3009Requirements()
	delete(permit2Requirements.Extra, "assetTransferMethod")
	delete(permit2Requirements.Extra, "settlerAddress")
	permit2Requirements.Extra["facilitatorAddress"] = "0x3333333333333333333333333333333333333333"
	permit2Result, err := scheme.CreatePaymentPayload(
		context.Background(), permit2Requirements, x402.PaymentPayloadContext{},
	)
	if err != nil {
		t.Fatalf("default Permit2 branch failed: %v", err)
	}
	if !evm.IsUptoPermit2Payload(permit2Result.Payload) {
		t.Fatalf("expected default Permit2 payload: %#v", permit2Result.Payload)
	}
}

func TestCreateUptoEIP3009PayloadRequiresDomainAndSettler(t *testing.T) {
	signer := &recordingClientSigner{}
	requirements := eip3009Requirements()
	delete(requirements.Extra, "settlerAddress")
	if _, err := CreateUptoEIP3009Payload(context.Background(), signer, requirements); err == nil {
		t.Fatal("expected missing settlerAddress error")
	}

	requirements = eip3009Requirements()
	delete(requirements.Extra, "name")
	if _, err := CreateUptoEIP3009Payload(context.Background(), signer, requirements); err == nil {
		t.Fatal("expected missing EIP-712 domain error")
	}
}
