package server

import (
	"context"
	"math/big"
	"testing"
	"time"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"

	x402 "github.com/x402-foundation/x402/go/v2"
	"github.com/x402-foundation/x402/go/v2/mechanisms/evm"
	authcapture "github.com/x402-foundation/x402/go/v2/mechanisms/evm/auth-capture"
	"github.com/x402-foundation/x402/go/v2/types"
)

type mockSigner struct {
	address string
	sig     []byte
	err     error

	lastDomain      evm.TypedDataDomain
	lastTypes       map[string][]evm.TypedDataField
	lastPrimaryType string
	lastMessage     map[string]interface{}
}

func (m *mockSigner) Address() string { return m.address }
func (m *mockSigner) SignTypedData(_ context.Context, domain evm.TypedDataDomain, types map[string][]evm.TypedDataField, primaryType string, message map[string]interface{}) ([]byte, error) {
	m.lastDomain = domain
	m.lastTypes = types
	m.lastPrimaryType = primaryType
	m.lastMessage = message
	if m.err != nil {
		return nil, m.err
	}
	if m.sig != nil {
		return m.sig, nil
	}
	return []byte{0xde, 0xad, 0xbe, 0xef}, nil
}

const (
	testNetwork           = "eip155:84532"
	testCaptureAuthorizer = "0xcccccccccccccccccccccccccccccccccccccccc"
	testFeeRecipient      = "0x4444444444444444444444444444444444444444"
	testPayTo             = "0x1234567890123456789012345678901234567890"
	testAsset             = "0x036CbD53842c5426634e7929541eC2318f3dCF7e"
	testPayer             = "0x9999999999999999999999999999999999999999"
)

func mockRequirements(extra map[string]interface{}) types.PaymentRequirements {
	future := time.Now().Unix() + 86400
	baseExtra := map[string]interface{}{
		"captureAuthorizer": testCaptureAuthorizer,
		"captureDeadline":   float64(future),
		"refundDeadline":    float64(future + 86400),
		"feeRecipient":      testFeeRecipient,
		"minFeeBps":         float64(0),
		"maxFeeBps":         float64(100),
		"name":              "USDC",
		"version":           "2",
	}
	for k, v := range extra {
		baseExtra[k] = v
	}
	return types.PaymentRequirements{
		Scheme:            authcapture.SchemeAuthCapture,
		Network:           testNetwork,
		Amount:            "1000000",
		Asset:             testAsset,
		PayTo:             testPayTo,
		MaxTimeoutSeconds: 3600,
		Extra:             baseExtra,
	}
}

func eip3009CollectPayload(extra map[string]interface{}) types.PaymentPayload {
	requirements := mockRequirements(extra)
	return types.PaymentPayload{
		X402Version: 2,
		Accepted:    requirements,
		Payload: map[string]interface{}{
			"authorization": map[string]interface{}{
				"from":        testPayer,
				"to":          authcapture.EIP3009TokenCollectorAddress,
				"value":       requirements.Amount,
				"validAfter":  "0",
				"validBefore": "1700003600",
				"nonce":       "0x1111111111111111111111111111111111111111111111111111111111111111",
			},
			"signature": "0xdeadbeef",
			"salt":      "0x2222222222222222222222222222222222222222222222222222222222222222",
		},
	}
}

func TestAuthCaptureEvmScheme_Scheme(t *testing.T) {
	scheme := NewAuthCaptureEvmScheme(&Config{ReceiverAuthorizerSigner: &mockSigner{address: "0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"}})
	assert.Equal(t, authcapture.SchemeAuthCapture, scheme.Scheme())
}

func TestPaymentFlowsDeclareEscrowOnly(t *testing.T) {
	scheme := NewAuthCaptureEvmScheme(&Config{ReceiverAuthorizerSigner: &mockSigner{address: "0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"}})

	flows := scheme.PaymentFlows()

	require.Contains(t, flows, string(evm.AssetTransferMethodEIP3009))
	require.Contains(t, flows, string(evm.AssetTransferMethodPermit2))
	for _, flow := range flows {
		assert.Equal(t, []x402.PaymentFlowName{x402.PaymentFlowEscrow}, flow.Supported)
		assert.Equal(t, x402.PaymentFlowEscrow, flow.Default)
	}
	assert.Equal(t, string(evm.AssetTransferMethodEIP3009), scheme.DefaultAssetTransferMethod())
}

func TestNewAuthCaptureEvmSchemeAllowsNilConfig(t *testing.T) {
	assert.NotPanics(t, func() { NewAuthCaptureEvmScheme(nil) })
}

func TestValidateFacilitatorSupport(t *testing.T) {
	tests := []struct {
		name          string
		config        *Config
		supportedKind types.SupportedKind
		wantErr       string
	}{
		{
			name:    "missing signer",
			config:  &Config{},
			wantErr: ErrMissingReceiverAuthorizerSigner,
		},
		{
			name:   "local captureAuthorizer configured",
			config: &Config{ReceiverAuthorizerSigner: &mockSigner{}, CaptureAuthorizer: testCaptureAuthorizer},
		},
		{
			name:          "facilitator-advertised captureAuthorizer",
			config:        &Config{ReceiverAuthorizerSigner: &mockSigner{}},
			supportedKind: types.SupportedKind{Extra: map[string]interface{}{"captureAuthorizer": testCaptureAuthorizer}},
		},
		{
			name:    "neither side supplies a captureAuthorizer",
			config:  &Config{ReceiverAuthorizerSigner: &mockSigner{}},
			wantErr: "no captureAuthorizer is configured",
		},
	}

	for _, test := range tests {
		t.Run(test.name, func(t *testing.T) {
			scheme := NewAuthCaptureEvmScheme(test.config)
			err := scheme.ValidateFacilitatorSupport(testNetwork, test.supportedKind, nil)
			if test.wantErr != "" {
				require.ErrorContains(t, err, test.wantErr)
				return
			}
			require.NoError(t, err)
		})
	}
}

func newTestScheme(signer *mockSigner) *AuthCaptureEvmScheme {
	return NewAuthCaptureEvmScheme(&Config{ReceiverAuthorizerSigner: signer})
}

func TestEnhancePaymentRequirements_MissingSigner(t *testing.T) {
	scheme := NewAuthCaptureEvmScheme(&Config{})
	_, err := scheme.EnhancePaymentRequirements(context.Background(), mockRequirements(nil), types.SupportedKind{}, nil)
	require.ErrorContains(t, err, ErrMissingReceiverAuthorizerSigner)
}

func TestEnhancePaymentRequirements_ResolvesLocalConfigFirst(t *testing.T) {
	signer := &mockSigner{address: "0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb"}
	minFee := uint16(5)
	maxFee := uint16(50)
	scheme := NewAuthCaptureEvmScheme(&Config{
		ReceiverAuthorizerSigner: signer,
		CaptureAuthorizer:        testCaptureAuthorizer,
		FeeRecipient:             testFeeRecipient,
		MinFeeBps:                &minFee,
		MaxFeeBps:                &maxFee,
	})

	requirements := mockRequirements(nil)
	requirements.Extra = map[string]interface{}{}
	supportedKind := types.SupportedKind{Extra: map[string]interface{}{
		"captureAuthorizer": "0xffffffffffffffffffffffffffffffffffffffff",
		"feeRecipient":      "0xffffffffffffffffffffffffffffffffffffffff",
		"minFeeBps":         float64(1),
		"maxFeeBps":         float64(1),
	}}

	enhanced, err := scheme.EnhancePaymentRequirements(context.Background(), requirements, supportedKind, nil)
	require.NoError(t, err)

	assert.Equal(t, evm.NormalizeAddress(testCaptureAuthorizer), enhanced.Extra["captureAuthorizer"])
	assert.Equal(t, evm.NormalizeAddress(testFeeRecipient), enhanced.Extra["feeRecipient"])
	assert.Equal(t, uint16(5), enhanced.Extra["minFeeBps"])
	assert.Equal(t, uint16(50), enhanced.Extra["maxFeeBps"])
	assert.Equal(t, evm.NormalizeAddress(signer.address), enhanced.Extra["receiverAuthorizer"])
	assert.Equal(t, "escrow", enhanced.Extra["paymentFlow"])
	assert.Equal(t, "sync", enhanced.Extra["captureMode"])
	assert.Equal(t, "delegated", enhanced.Extra["operatorType"])
	assert.Equal(t, "USDC", enhanced.Extra["name"])
	assert.Equal(t, "2", enhanced.Extra["version"])
	assert.NotEmpty(t, enhanced.Extra["authCaptureEscrow"])
	assert.NotZero(t, enhanced.Extra["captureDeadline"])
	assert.NotZero(t, enhanced.Extra["refundDeadline"])
}

func TestEnhancePaymentRequirements_FallsBackToFacilitatorAdvertisement(t *testing.T) {
	signer := &mockSigner{address: "0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb"}
	scheme := NewAuthCaptureEvmScheme(&Config{ReceiverAuthorizerSigner: signer})

	requirements := mockRequirements(nil)
	requirements.Extra = map[string]interface{}{}
	supportedKind := types.SupportedKind{Extra: map[string]interface{}{
		"captureAuthorizer": testCaptureAuthorizer,
		"feeRecipient":      testFeeRecipient,
		"minFeeBps":         float64(2),
		"maxFeeBps":         float64(20),
	}}

	enhanced, err := scheme.EnhancePaymentRequirements(context.Background(), requirements, supportedKind, nil)
	require.NoError(t, err)

	assert.Equal(t, evm.NormalizeAddress(testCaptureAuthorizer), enhanced.Extra["captureAuthorizer"])
	assert.Equal(t, evm.NormalizeAddress(testFeeRecipient), enhanced.Extra["feeRecipient"])
	assert.Equal(t, uint16(2), enhanced.Extra["minFeeBps"])
	assert.Equal(t, uint16(20), enhanced.Extra["maxFeeBps"])
}

func TestEnhancePaymentRequirements_MissingCaptureAuthorizer(t *testing.T) {
	signer := &mockSigner{address: "0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb"}
	scheme := NewAuthCaptureEvmScheme(&Config{ReceiverAuthorizerSigner: signer})

	requirements := mockRequirements(nil)
	requirements.Extra = map[string]interface{}{}

	_, err := scheme.EnhancePaymentRequirements(context.Background(), requirements, types.SupportedKind{}, nil)
	require.ErrorContains(t, err, ErrMissingCaptureAuthorizer)
}

func TestEnhancePaymentRequirements_MissingFeeRecipient(t *testing.T) {
	signer := &mockSigner{address: "0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb"}
	scheme := NewAuthCaptureEvmScheme(&Config{ReceiverAuthorizerSigner: signer, CaptureAuthorizer: testCaptureAuthorizer})

	requirements := mockRequirements(nil)
	requirements.Extra = map[string]interface{}{}

	_, err := scheme.EnhancePaymentRequirements(context.Background(), requirements, types.SupportedKind{}, nil)
	require.ErrorContains(t, err, ErrMissingFeeRecipient)
}

func TestEnhancePaymentRequirements_DefaultFeeBounds(t *testing.T) {
	signer := &mockSigner{address: "0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb"}
	scheme := NewAuthCaptureEvmScheme(&Config{
		ReceiverAuthorizerSigner: signer,
		CaptureAuthorizer:        testCaptureAuthorizer,
		FeeRecipient:             testFeeRecipient,
	})

	requirements := mockRequirements(nil)
	requirements.Extra = map[string]interface{}{}

	enhanced, err := scheme.EnhancePaymentRequirements(context.Background(), requirements, types.SupportedKind{}, nil)
	require.NoError(t, err)

	assert.Equal(t, uint16(0), enhanced.Extra["minFeeBps"])
	assert.Equal(t, DefaultMaxFeeBps, enhanced.Extra["maxFeeBps"])
}

func TestEnhancePaymentRequirements_CopiesThroughExtensionKeys(t *testing.T) {
	signer := &mockSigner{address: "0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb"}
	scheme := NewAuthCaptureEvmScheme(&Config{
		ReceiverAuthorizerSigner: signer,
		CaptureAuthorizer:        testCaptureAuthorizer,
		FeeRecipient:             testFeeRecipient,
	})

	requirements := mockRequirements(nil)
	requirements.Extra = map[string]interface{}{}
	supportedKind := types.SupportedKind{Extra: map[string]interface{}{"someExtensionField": "value"}}

	enhanced, err := scheme.EnhancePaymentRequirements(context.Background(), requirements, supportedKind, []string{"someExtensionField"})
	require.NoError(t, err)

	assert.Equal(t, "value", enhanced.Extra["someExtensionField"])
}

func TestEnhancePaymentRequirements_ParsesDollarAmount(t *testing.T) {
	signer := &mockSigner{address: "0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb"}
	scheme := NewAuthCaptureEvmScheme(&Config{
		ReceiverAuthorizerSigner: signer,
		CaptureAuthorizer:        testCaptureAuthorizer,
		FeeRecipient:             testFeeRecipient,
	})

	requirements := mockRequirements(nil)
	requirements.Extra = map[string]interface{}{}
	requirements.Amount = "1.5"

	enhanced, err := scheme.EnhancePaymentRequirements(context.Background(), requirements, types.SupportedKind{}, nil)
	require.NoError(t, err)
	assert.Equal(t, "1500000", enhanced.Amount)
}

func TestEnrichSettlementPayload_BeforeHandlerNoOp(t *testing.T) {
	signer := &mockSigner{address: "0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb"}
	scheme := newTestScheme(signer)

	fields, err := scheme.EnrichSettlementPayload(x402.SettleContext{
		Ctx:          context.Background(),
		Payload:      eip3009CollectPayload(nil),
		Requirements: mockRequirements(nil),
		Phase:        x402.SettlePhaseBeforeHandler,
	})
	require.NoError(t, err)
	assert.Nil(t, fields)
}

func TestEnrichSettlementPayload_AfterHandlerSignsCapture(t *testing.T) {
	signer := &mockSigner{address: "0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb"}
	scheme := newTestScheme(signer)
	requirements := mockRequirements(nil)

	fields, err := scheme.EnrichSettlementPayload(x402.SettleContext{
		Ctx:          context.Background(),
		Payload:      eip3009CollectPayload(nil),
		Requirements: requirements,
		Phase:        x402.SettlePhaseAfterHandler,
	})
	require.NoError(t, err)

	assert.Equal(t, "capture", fields["type"])
	assert.Equal(t, requirements.Amount, fields["amount"])
	assert.Equal(t, requirements.Amount, fields["expectedCapturableAmount"])
	assert.Equal(t, "0", fields["expectedRefundableAmount"])
	assert.Equal(t, "0xdeadbeef", fields["authorizerSignature"])

	// v1.1 is the default deployment: feeAmount (absolute), not feeBps.
	assert.Contains(t, fields, "feeAmount")
	assert.NotContains(t, fields, "feeBps")

	assert.Equal(t, "Capture", signer.lastPrimaryType)
	assert.Equal(t, authcapture.OperatorEIP712Domain.Name, signer.lastDomain.Name)
	assert.Equal(t, authcapture.OperatorEIP712Domain.Version, signer.lastDomain.Version)
	assert.Equal(t, evm.NormalizeAddress(testCaptureAuthorizer), signer.lastDomain.VerifyingContract)
	assert.Equal(t, requirements.Amount, signer.lastMessage["amount"].(*big.Int).String())
	assert.Equal(t, evm.NormalizeAddress(testFeeRecipient), signer.lastMessage["feeReceiver"])
}

func TestEnrichSettlementPayload_AfterHandlerV1_0UsesFeeBps(t *testing.T) {
	signer := &mockSigner{address: "0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb"}
	scheme := newTestScheme(signer)
	requirements := mockRequirements(map[string]interface{}{
		"authCaptureEscrow": authcapture.AuthCaptureEscrowV1_0Address,
		"minFeeBps":         float64(25),
	})

	fields, err := scheme.EnrichSettlementPayload(x402.SettleContext{
		Ctx:          context.Background(),
		Payload:      eip3009CollectPayload(map[string]interface{}{"authCaptureEscrow": authcapture.AuthCaptureEscrowV1_0Address}),
		Requirements: requirements,
		Phase:        x402.SettlePhaseAfterHandler,
	})
	require.NoError(t, err)

	assert.Contains(t, fields, "feeBps")
	assert.NotContains(t, fields, "feeAmount")
	assert.Equal(t, uint16(25), fields["feeBps"])
	assert.Equal(t, "Capture", signer.lastPrimaryType)
	assert.Contains(t, signer.lastMessage, "feeBps")
}

func TestEnrichSettlementPayload_CancelSignsVoid(t *testing.T) {
	signer := &mockSigner{address: "0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb"}
	scheme := newTestScheme(signer)
	requirements := mockRequirements(nil)

	fields, err := scheme.EnrichSettlementPayload(x402.SettleContext{
		Ctx:          context.Background(),
		Payload:      eip3009CollectPayload(nil),
		Requirements: requirements,
		Phase:        x402.SettlePhaseCancel,
	})
	require.NoError(t, err)

	assert.Equal(t, "void", fields["type"])
	assert.NotEmpty(t, fields["authorizerSignature"])
	assert.Equal(t, "Void", signer.lastPrimaryType)
	assert.Equal(t, evm.NormalizeAddress(testCaptureAuthorizer), signer.lastDomain.VerifyingContract)
	assert.Len(t, signer.lastMessage, 1)
	assert.Contains(t, signer.lastMessage, "paymentInfoHash")
}

func TestEnrichSettlementPayload_InvalidCollectPayload(t *testing.T) {
	signer := &mockSigner{address: "0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb"}
	scheme := newTestScheme(signer)

	badPayload := types.PaymentPayload{
		X402Version: 2,
		Accepted:    mockRequirements(nil),
		Payload:     map[string]interface{}{"foo": "bar"},
	}

	_, err := scheme.EnrichSettlementPayload(x402.SettleContext{
		Ctx:          context.Background(),
		Payload:      badPayload,
		Requirements: mockRequirements(nil),
		Phase:        x402.SettlePhaseAfterHandler,
	})
	require.ErrorContains(t, err, ErrInvalidCollectPayload)
}

func TestEnrichSettlementPayload_SignerError(t *testing.T) {
	signer := &mockSigner{address: "0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb", err: assert.AnError}
	scheme := newTestScheme(signer)

	_, err := scheme.EnrichSettlementPayload(x402.SettleContext{
		Ctx:          context.Background(),
		Payload:      eip3009CollectPayload(nil),
		Requirements: mockRequirements(nil),
		Phase:        x402.SettlePhaseAfterHandler,
	})
	require.ErrorContains(t, err, ErrFailedToSignCapture)
}

func TestSettleOnCancel(t *testing.T) {
	signer := &mockSigner{address: "0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb"}
	scheme := newTestScheme(signer)
	requirements := mockRequirements(nil)

	tests := []struct {
		name       string
		reason     x402.VerifiedPaymentCancellationReason
		wantResult bool
	}{
		{name: "handler failed", reason: x402.CancellationReasonHandlerFailed, wantResult: true},
		{name: "handler threw", reason: x402.CancellationReasonHandlerThrew, wantResult: true},
		{name: "after verify aborted", reason: x402.CancellationReasonAfterVerifyAborted, wantResult: true},
		{name: "unknown reason", reason: "something_else", wantResult: false},
	}

	for _, test := range tests {
		t.Run(test.name, func(t *testing.T) {
			result, err := scheme.SettleOnCancel(x402.VerifiedPaymentCanceledContext{
				SettleContext: x402.SettleContext{Requirements: requirements},
				Reason:        test.reason,
			})
			require.NoError(t, err)
			if !test.wantResult {
				assert.Nil(t, result)
				return
			}
			require.NotNil(t, result)
			assert.Equal(t, requirements.Amount, result.Amount)
			assert.Equal(t, requirements.PayTo, result.PayTo)
		})
	}
}
