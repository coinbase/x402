package facilitator

import (
	"context"
	"crypto/ecdsa"
	"math/big"
	"strconv"
	"strings"
	"testing"
	"time"

	"github.com/ethereum/go-ethereum/crypto"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"

	x402 "github.com/x402-foundation/x402/go/v2"
	"github.com/x402-foundation/x402/go/v2/mechanisms/evm"
	authcapture "github.com/x402-foundation/x402/go/v2/mechanisms/evm/auth-capture"
	"github.com/x402-foundation/x402/go/v2/types"
)

// ─── Mock facilitator signer ────────────────────────────────────────────────

type mockFacSigner struct {
	addresses         []string
	deployedAddresses map[string]bool // lowercased address -> has code (EIP-1271 routing)

	paymentStateHasCollected bool
	paymentStateCapturable   *big.Int
	paymentStateRefundable   *big.Int
	paymentStateErr          error

	simulateErr map[string]error // functionName ("authorize"/"capture"/"void") -> forced error

	writeTx             string
	writeErr             error
	writeContractCalls  int

	receipt    *evm.TransactionReceipt
	receiptErr error
}

func newMockFacSigner(addresses ...string) *mockFacSigner {
	return &mockFacSigner{
		addresses:         addresses,
		deployedAddresses: map[string]bool{},
		simulateErr:       map[string]error{},
		writeTx:           "0xdeadbeefdeadbeefdeadbeefdeadbeefdeadbeefdeadbeefdeadbeefdeadbeef",
		receipt:           &evm.TransactionReceipt{Status: evm.TxStatusSuccess, TxHash: "0xdeadbeefdeadbeefdeadbeefdeadbeefdeadbeefdeadbeefdeadbeefdeadbeef"},
	}
}

func (m *mockFacSigner) GetAddresses() []string { return m.addresses }

func (m *mockFacSigner) GetCode(_ context.Context, address string) ([]byte, error) {
	if m.deployedAddresses[strings.ToLower(address)] {
		return []byte{0x60, 0x80}, nil
	}
	return nil, nil
}

func (m *mockFacSigner) ReadContract(_ context.Context, _ string, _ []byte, functionName string, _ ...interface{}) (interface{}, error) {
	if functionName == "paymentState" {
		if m.paymentStateErr != nil {
			return nil, m.paymentStateErr
		}
		return []interface{}{m.paymentStateHasCollected, m.paymentStateCapturable, m.paymentStateRefundable}, nil
	}
	if err, ok := m.simulateErr[functionName]; ok && err != nil {
		return nil, err
	}
	return nil, nil
}

func (m *mockFacSigner) VerifyTypedData(_ context.Context, _ string, _ evm.TypedDataDomain, _ map[string][]evm.TypedDataField, _ string, _ map[string]interface{}, _ []byte) (bool, error) {
	return false, nil
}

func (m *mockFacSigner) WriteContract(_ context.Context, _ string, _ []byte, _ string, _ []byte, _ ...interface{}) (string, error) {
	m.writeContractCalls++
	if m.writeErr != nil {
		return "", m.writeErr
	}
	return m.writeTx, nil
}

func (m *mockFacSigner) SendTransaction(_ context.Context, _ string, _ []byte) (string, error) {
	return m.writeTx, m.writeErr
}

func (m *mockFacSigner) WaitForTransactionReceipt(_ context.Context, _ string) (*evm.TransactionReceipt, error) {
	if m.receiptErr != nil {
		return nil, m.receiptErr
	}
	return m.receipt, nil
}

func (m *mockFacSigner) GetBalance(_ context.Context, _ string, _ string) (*big.Int, error) {
	return big.NewInt(0), nil
}

func (m *mockFacSigner) GetChainID(_ context.Context) (*big.Int, error) {
	return big.NewInt(84532), nil
}

// ─── Fixtures ────────────────────────────────────────────────────────────────

var (
	facCaptureAuthorizer = "0x" + strings.Repeat("c", 40)
	facFeeRecipient      = "0x" + strings.Repeat("3", 40)
	facPayTo             = "0x" + strings.Repeat("2", 40)
	facAsset             = "0x" + strings.Repeat("a", 40)
)

const (
	facNetwork = "eip155:84532"
	facAmount  = "1000000"
)

func facBaseRequirements(captureAuthorizer string, extraOverrides map[string]interface{}) types.PaymentRequirements {
	future := time.Now().Unix() + 86400
	extra := map[string]interface{}{
		"name":              "USDC",
		"version":           "2",
		"captureAuthorizer": captureAuthorizer,
		"feeRecipient":      facFeeRecipient,
		"minFeeBps":         float64(0),
		"maxFeeBps":         float64(100),
		"captureDeadline":   float64(future),
		"refundDeadline":    float64(future + 86400),
	}
	for k, v := range extraOverrides {
		extra[k] = v
	}
	return types.PaymentRequirements{
		Scheme:            authcapture.SchemeAuthCapture,
		Network:           facNetwork,
		Amount:            facAmount,
		Asset:             facAsset,
		PayTo:             facPayTo,
		MaxTimeoutSeconds: 3600,
		Extra:             extra,
	}
}

// buildEip3009Payload builds a fully valid, real-signature EIP-3009 collect
// payload for requirements, signed by payerKey.
func buildEip3009Payload(t *testing.T, requirements types.PaymentRequirements, payerKey *ecdsa.PrivateKey) types.PaymentPayload {
	t.Helper()
	extra, deployment, err := authcapture.ParseAuthCaptureExtra(requirements)
	require.NoError(t, err)

	payerAddr := crypto.PubkeyToAddress(payerKey.PublicKey).Hex()
	validBefore := time.Now().Unix() + 3600
	salt := "0x" + strings.Repeat("0", 64)

	paymentInfo := authcapture.ReconstructPaymentInfo(payerAddr, uint64(validBefore), salt, requirements, extra, "")

	chainID, err := evm.GetEvmChainId(string(requirements.Network))
	require.NoError(t, err)

	nonceHex, err := authcapture.ComputePayerAgnosticPaymentInfoHash(chainID, paymentInfo, deployment.Escrow)
	require.NoError(t, err)

	authorization := authcapture.Eip3009Authorization{
		From:        payerAddr,
		To:          deployment.EIP3009Collector,
		Value:       requirements.Amount,
		ValidAfter:  "0",
		ValidBefore: strconv.FormatInt(validBefore, 10),
		Nonce:       nonceHex,
	}

	hash, err := authcapture.HashERC3009Authorization(authorization, extra, requirements.Asset, chainID)
	require.NoError(t, err)

	sig, err := crypto.Sign(hash[:], payerKey)
	require.NoError(t, err)
	sig[64] += 27

	return types.PaymentPayload{
		X402Version: 2,
		Accepted:    requirements,
		Payload: map[string]interface{}{
			"authorization": map[string]interface{}{
				"from":        authorization.From,
				"to":          authorization.To,
				"value":       authorization.Value,
				"validAfter":  authorization.ValidAfter,
				"validBefore": authorization.ValidBefore,
				"nonce":       authorization.Nonce,
			},
			"signature": evm.BytesToHex(sig),
			"salt":      salt,
		},
	}
}

func assertVerifyReason(t *testing.T, err error, reason string) {
	t.Helper()
	require.Error(t, err)
	ve := &x402.VerifyError{}
	require.ErrorAs(t, err, &ve)
	assert.Equal(t, reason, ve.InvalidReason)
}

// ─── Verify/Settle routing ───────────────────────────────────────────────────

func TestVerify_UnknownPayloadShape(t *testing.T) {
	signer := newMockFacSigner(facCaptureAuthorizer)
	scheme := NewAuthCaptureEvmScheme(signer, AuthCaptureEvmSchemeConfig{CaptureAuthorizer: facCaptureAuthorizer})
	requirements := facBaseRequirements(facCaptureAuthorizer, nil)

	_, err := scheme.Verify(context.Background(), types.PaymentPayload{Accepted: requirements, Payload: map[string]interface{}{"foo": "bar"}}, requirements, nil)
	assertVerifyReason(t, err, ErrPayloadFormat)
}

func TestSettle_UnknownPayloadShape(t *testing.T) {
	signer := newMockFacSigner(facCaptureAuthorizer)
	scheme := NewAuthCaptureEvmScheme(signer, AuthCaptureEvmSchemeConfig{CaptureAuthorizer: facCaptureAuthorizer})
	requirements := facBaseRequirements(facCaptureAuthorizer, nil)

	_, err := scheme.Settle(context.Background(), types.PaymentPayload{Accepted: requirements, Payload: map[string]interface{}{"foo": "bar"}}, requirements, nil)
	require.ErrorContains(t, err, ErrPayloadFormat)
}

// ─── Collect (authorize) verification ───────────────────────────────────────

func TestVerifyCollect_Eip3009HappyPath(t *testing.T) {
	signer := newMockFacSigner(facCaptureAuthorizer)
	scheme := NewAuthCaptureEvmScheme(signer, AuthCaptureEvmSchemeConfig{CaptureAuthorizer: facCaptureAuthorizer})
	requirements := facBaseRequirements(facCaptureAuthorizer, nil)

	payerKey, err := crypto.GenerateKey()
	require.NoError(t, err)
	payload := buildEip3009Payload(t, requirements, payerKey)

	resp, err := scheme.Verify(context.Background(), payload, requirements, nil)
	require.NoError(t, err)
	assert.True(t, resp.IsValid)
	assert.Equal(t, strings.ToLower(crypto.PubkeyToAddress(payerKey.PublicKey).Hex()), strings.ToLower(resp.Payer))
}

func TestVerifyCollect_SchemeMismatch(t *testing.T) {
	signer := newMockFacSigner(facCaptureAuthorizer)
	scheme := NewAuthCaptureEvmScheme(signer, AuthCaptureEvmSchemeConfig{CaptureAuthorizer: facCaptureAuthorizer})
	requirements := facBaseRequirements(facCaptureAuthorizer, nil)

	payerKey, err := crypto.GenerateKey()
	require.NoError(t, err)
	payload := buildEip3009Payload(t, requirements, payerKey)
	payload.Accepted.Scheme = "exact"

	_, err = scheme.Verify(context.Background(), payload, requirements, nil)
	assertVerifyReason(t, err, ErrInvalidScheme)
}

func TestVerifyCollect_AmountMismatch(t *testing.T) {
	signer := newMockFacSigner(facCaptureAuthorizer)
	scheme := NewAuthCaptureEvmScheme(signer, AuthCaptureEvmSchemeConfig{CaptureAuthorizer: facCaptureAuthorizer})
	requirements := facBaseRequirements(facCaptureAuthorizer, nil)

	payerKey, err := crypto.GenerateKey()
	require.NoError(t, err)
	payload := buildEip3009Payload(t, requirements, payerKey)
	payload.Payload["authorization"].(map[string]interface{})["value"] = "1"

	_, err = scheme.Verify(context.Background(), payload, requirements, nil)
	assertVerifyReason(t, err, ErrAmountMismatch)
}

func TestVerifyCollect_NonceMismatch(t *testing.T) {
	signer := newMockFacSigner(facCaptureAuthorizer)
	scheme := NewAuthCaptureEvmScheme(signer, AuthCaptureEvmSchemeConfig{CaptureAuthorizer: facCaptureAuthorizer})
	requirements := facBaseRequirements(facCaptureAuthorizer, nil)

	payerKey, err := crypto.GenerateKey()
	require.NoError(t, err)
	payload := buildEip3009Payload(t, requirements, payerKey)
	payload.Payload["authorization"].(map[string]interface{})["nonce"] = "0x" + strings.Repeat("1", 64)

	_, err = scheme.Verify(context.Background(), payload, requirements, nil)
	assertVerifyReason(t, err, ErrNonceMismatch)
}

func TestVerifyCollect_OperatorNotAdmitted(t *testing.T) {
	// Facilitator's own signer does not control the captureAuthorizer the
	// client declared in requirements.Extra.
	signer := newMockFacSigner("0x" + strings.Repeat("9", 40))
	scheme := NewAuthCaptureEvmScheme(signer, AuthCaptureEvmSchemeConfig{CaptureAuthorizer: facCaptureAuthorizer})
	requirements := facBaseRequirements(facCaptureAuthorizer, nil)

	payerKey, err := crypto.GenerateKey()
	require.NoError(t, err)
	payload := buildEip3009Payload(t, requirements, payerKey)

	_, err = scheme.Verify(context.Background(), payload, requirements, nil)
	assertVerifyReason(t, err, ErrOperatorNotAdmitted)
}

// ─── Collect (authorize) settlement ──────────────────────────────────────────

func TestSettleCollect_Eip3009HappyPath(t *testing.T) {
	signer := newMockFacSigner(facCaptureAuthorizer)
	scheme := NewAuthCaptureEvmScheme(signer, AuthCaptureEvmSchemeConfig{CaptureAuthorizer: facCaptureAuthorizer})
	requirements := facBaseRequirements(facCaptureAuthorizer, nil)

	payerKey, err := crypto.GenerateKey()
	require.NoError(t, err)
	payload := buildEip3009Payload(t, requirements, payerKey)

	resp, err := scheme.Settle(context.Background(), payload, requirements, nil)
	require.NoError(t, err)
	assert.True(t, resp.Success)
	assert.Equal(t, signer.writeTx, resp.Transaction)
	assert.Equal(t, 1, signer.writeContractCalls)
}

func TestSettleCollect_PendingReconciliationSkipsRebroadcast(t *testing.T) {
	signer := newMockFacSigner(facCaptureAuthorizer)
	scheme := NewAuthCaptureEvmScheme(signer, AuthCaptureEvmSchemeConfig{CaptureAuthorizer: facCaptureAuthorizer})
	requirements := facBaseRequirements(facCaptureAuthorizer, nil)

	payerKey, err := crypto.GenerateKey()
	require.NoError(t, err)
	payload := buildEip3009Payload(t, requirements, payerKey)

	sigHex := payload.Payload["signature"].(string)
	require.NoError(t, scheme.pendingStore.Set(context.Background(), sigHex, "0x"+strings.Repeat("a", 64)))

	resp, err := scheme.Settle(context.Background(), payload, requirements, nil)
	require.NoError(t, err)
	assert.True(t, resp.Success)
	assert.Equal(t, 0, signer.writeContractCalls, "pending-settlement fast path must not re-broadcast")
}

// ─── Lifecycle (capture/void) fixtures ───────────────────────────────────────

// lifecycleFixture is the shared state a capture/void test needs: a requirements
// object with a real receiverAuthorizer, a matching real-signed PaymentInfo the
// mock's paymentState reports as collected, and the keys to sign lifecycle messages.
type lifecycleFixture struct {
	requirements types.PaymentRequirements
	extra        authcapture.AuthCaptureExtra
	deployment   authcapture.AuthCaptureDeployment
	chainID      *big.Int
	paymentInfo  authcapture.PaymentInfoStruct
	receiverKey  *ecdsa.PrivateKey
	saltNonce    string
}

func newLifecycleFixture(t *testing.T) lifecycleFixture {
	t.Helper()
	receiverKey, err := crypto.GenerateKey()
	require.NoError(t, err)
	receiverAddr := crypto.PubkeyToAddress(receiverKey.PublicKey).Hex()

	requirements := facBaseRequirements(facCaptureAuthorizer, map[string]interface{}{
		"receiverAuthorizer": receiverAddr,
	})
	extra, deployment, err := authcapture.ParseAuthCaptureExtra(requirements)
	require.NoError(t, err)

	saltNonce := "0x01"
	salt, err := authcapture.DeriveBoundSalt(receiverAddr, authcapture.ExtraAddress(""), saltNonce)
	require.NoError(t, err)

	payerKey, err := crypto.GenerateKey()
	require.NoError(t, err)

	paymentInfo := authcapture.PaymentInfoStruct{
		Operator:            extra.CaptureAuthorizer,
		Payer:               crypto.PubkeyToAddress(payerKey.PublicKey).Hex(),
		Receiver:            requirements.PayTo,
		Token:               requirements.Asset,
		MaxAmount:           requirements.Amount,
		PreApprovalExpiry:   extra.CaptureDeadline - 1,
		AuthorizationExpiry: extra.CaptureDeadline,
		RefundExpiry:        extra.RefundDeadline,
		MinFeeBps:           extra.MinFeeBps,
		MaxFeeBps:           extra.MaxFeeBps,
		FeeReceiver:         extra.FeeRecipient,
		Salt:                salt,
	}

	chainID, err := evm.GetEvmChainId(string(requirements.Network))
	require.NoError(t, err)

	return lifecycleFixture{
		requirements: requirements,
		extra:        extra,
		deployment:   deployment,
		chainID:      chainID,
		paymentInfo:  paymentInfo,
		receiverKey:  receiverKey,
		saltNonce:    saltNonce,
	}
}

func paymentInfoMap(p authcapture.PaymentInfoStruct) map[string]interface{} {
	return map[string]interface{}{
		"operator":            p.Operator,
		"payer":               p.Payer,
		"receiver":            p.Receiver,
		"token":               p.Token,
		"maxAmount":           p.MaxAmount,
		"preApprovalExpiry":   float64(p.PreApprovalExpiry),
		"authorizationExpiry": float64(p.AuthorizationExpiry),
		"refundExpiry":        float64(p.RefundExpiry),
		"minFeeBps":           float64(p.MinFeeBps),
		"maxFeeBps":           float64(p.MaxFeeBps),
		"feeReceiver":         p.FeeReceiver,
		"salt":                p.Salt,
	}
}

// buildCapturePayload builds a real-signed capture lifecycle wire payload for
// fx's v1.1 (default) deployment.
func buildCapturePayload(t *testing.T, fx lifecycleFixture, amount, expectedCapturable, expectedRefundable string) map[string]interface{} {
	t.Helper()
	paymentInfoHash, err := authcapture.ComputePaymentInfoHash(fx.chainID, fx.paymentInfo, fx.paymentInfo.Payer, fx.deployment.Escrow)
	require.NoError(t, err)

	amountBig, ok := new(big.Int).SetString(amount, 10)
	require.True(t, ok)
	expCapBig, ok := new(big.Int).SetString(expectedCapturable, 10)
	require.True(t, ok)
	expRefBig, ok := new(big.Int).SetString(expectedRefundable, 10)
	require.True(t, ok)

	message := map[string]interface{}{
		"paymentInfoHash":          paymentInfoHash,
		"amount":                   amountBig,
		"feeAmount":                big.NewInt(0),
		"feeReceiver":              evm.NormalizeAddress(fx.extra.FeeRecipient),
		"expectedCapturableAmount": expCapBig,
		"expectedRefundableAmount": expRefBig,
	}

	domain := lifecycleDomain(fx.extra, fx.chainID)
	hash, err := evm.HashEIP712TypedData(domain, authcapture.CaptureTypesForDeployment(&fx.deployment), "Capture", message)
	require.NoError(t, err)

	sig, err := crypto.Sign(hash[:], fx.receiverKey)
	require.NoError(t, err)
	sig[64] += 27

	return map[string]interface{}{
		"type":                     "capture",
		"paymentInfo":              paymentInfoMap(fx.paymentInfo),
		"saltNonce":                fx.saltNonce,
		"amount":                   amount,
		"feeAmount":                "0",
		"feeReceiver":              fx.extra.FeeRecipient,
		"expectedCapturableAmount": expectedCapturable,
		"expectedRefundableAmount": expectedRefundable,
		"authorizerSignature":      evm.BytesToHex(sig),
	}
}

// buildVoidPayload builds a real-signed void lifecycle wire payload.
func buildVoidPayload(t *testing.T, fx lifecycleFixture) map[string]interface{} {
	t.Helper()
	paymentInfoHash, err := authcapture.ComputePaymentInfoHash(fx.chainID, fx.paymentInfo, fx.paymentInfo.Payer, fx.deployment.Escrow)
	require.NoError(t, err)

	domain := lifecycleDomain(fx.extra, fx.chainID)
	message := map[string]interface{}{"paymentInfoHash": paymentInfoHash}
	hash, err := evm.HashEIP712TypedData(domain, authcapture.VoidTypes, "Void", message)
	require.NoError(t, err)

	sig, err := crypto.Sign(hash[:], fx.receiverKey)
	require.NoError(t, err)
	sig[64] += 27

	return map[string]interface{}{
		"type":                "void",
		"paymentInfo":         paymentInfoMap(fx.paymentInfo),
		"saltNonce":           fx.saltNonce,
		"authorizerSignature": evm.BytesToHex(sig),
	}
}

func facSignerForFixture(fx lifecycleFixture) *mockFacSigner {
	signer := newMockFacSigner(fx.extra.CaptureAuthorizer)
	signer.paymentStateHasCollected = true
	maxAmount, _ := new(big.Int).SetString(fx.paymentInfo.MaxAmount, 10)
	signer.paymentStateCapturable = maxAmount
	signer.paymentStateRefundable = big.NewInt(0)
	return signer
}

// ─── Capture verification/settlement ────────────────────────────────────────

func TestVerifyCapture_HappyPath(t *testing.T) {
	fx := newLifecycleFixture(t)
	signer := facSignerForFixture(fx)
	scheme := NewAuthCaptureEvmScheme(signer, AuthCaptureEvmSchemeConfig{CaptureAuthorizer: facCaptureAuthorizer})

	capturePayload := buildCapturePayload(t, fx, fx.paymentInfo.MaxAmount, fx.paymentInfo.MaxAmount, "0")
	payload := types.PaymentPayload{X402Version: 2, Accepted: fx.requirements, Payload: capturePayload}

	resp, err := scheme.Verify(context.Background(), payload, fx.requirements, nil)
	require.NoError(t, err)
	assert.True(t, resp.IsValid)
	assert.Equal(t, strings.ToLower(fx.paymentInfo.Payer), strings.ToLower(resp.Payer))
}

func TestVerifyCapture_StaleExpectedAmounts(t *testing.T) {
	fx := newLifecycleFixture(t)
	signer := facSignerForFixture(fx)
	scheme := NewAuthCaptureEvmScheme(signer, AuthCaptureEvmSchemeConfig{CaptureAuthorizer: facCaptureAuthorizer})

	// Signed expectedCapturableAmount ("1") no longer matches the mock's
	// on-chain capturable balance (the full maxAmount) — must be rejected as stale.
	capturePayload := buildCapturePayload(t, fx, "1", "1", "0")
	payload := types.PaymentPayload{X402Version: 2, Accepted: fx.requirements, Payload: capturePayload}

	_, err := scheme.Verify(context.Background(), payload, fx.requirements, nil)
	assertVerifyReason(t, err, ErrUnexpectedPaymentState)
}

func TestVerifyCapture_MissingReceiverAuthorizer(t *testing.T) {
	fx := newLifecycleFixture(t)
	signer := facSignerForFixture(fx)
	scheme := NewAuthCaptureEvmScheme(signer, AuthCaptureEvmSchemeConfig{CaptureAuthorizer: facCaptureAuthorizer})

	requirements := facBaseRequirements(facCaptureAuthorizer, nil) // no receiverAuthorizer
	capturePayload := buildCapturePayload(t, fx, fx.paymentInfo.MaxAmount, fx.paymentInfo.MaxAmount, "0")
	payload := types.PaymentPayload{X402Version: 2, Accepted: requirements, Payload: capturePayload}

	_, err := scheme.Verify(context.Background(), payload, requirements, nil)
	assertVerifyReason(t, err, ErrLifecycleNotRelayed)
}

func TestSettleCapture_HappyPath(t *testing.T) {
	fx := newLifecycleFixture(t)
	signer := facSignerForFixture(fx)
	scheme := NewAuthCaptureEvmScheme(signer, AuthCaptureEvmSchemeConfig{CaptureAuthorizer: facCaptureAuthorizer})

	capturePayload := buildCapturePayload(t, fx, fx.paymentInfo.MaxAmount, fx.paymentInfo.MaxAmount, "0")
	payload := types.PaymentPayload{X402Version: 2, Accepted: fx.requirements, Payload: capturePayload}

	resp, err := scheme.Settle(context.Background(), payload, fx.requirements, nil)
	require.NoError(t, err)
	assert.True(t, resp.Success)
	assert.Equal(t, signer.writeTx, resp.Transaction)
	assert.Equal(t, 1, signer.writeContractCalls)
}

// ─── Void verification/settlement ───────────────────────────────────────────

func TestVerifyVoid_HappyPath(t *testing.T) {
	fx := newLifecycleFixture(t)
	signer := facSignerForFixture(fx)
	scheme := NewAuthCaptureEvmScheme(signer, AuthCaptureEvmSchemeConfig{CaptureAuthorizer: facCaptureAuthorizer})

	voidPayload := buildVoidPayload(t, fx)
	payload := types.PaymentPayload{X402Version: 2, Accepted: fx.requirements, Payload: voidPayload}

	resp, err := scheme.Verify(context.Background(), payload, fx.requirements, nil)
	require.NoError(t, err)
	assert.True(t, resp.IsValid)
}

func TestVerifyVoid_NoCapturableBalance(t *testing.T) {
	fx := newLifecycleFixture(t)
	signer := facSignerForFixture(fx)
	signer.paymentStateCapturable = big.NewInt(0)
	scheme := NewAuthCaptureEvmScheme(signer, AuthCaptureEvmSchemeConfig{CaptureAuthorizer: facCaptureAuthorizer})

	voidPayload := buildVoidPayload(t, fx)
	payload := types.PaymentPayload{X402Version: 2, Accepted: fx.requirements, Payload: voidPayload}

	_, err := scheme.Verify(context.Background(), payload, fx.requirements, nil)
	assertVerifyReason(t, err, ErrUnexpectedPaymentState)
}

func TestSettleVoid_HappyPath(t *testing.T) {
	fx := newLifecycleFixture(t)
	signer := facSignerForFixture(fx)
	scheme := NewAuthCaptureEvmScheme(signer, AuthCaptureEvmSchemeConfig{CaptureAuthorizer: facCaptureAuthorizer})

	voidPayload := buildVoidPayload(t, fx)
	payload := types.PaymentPayload{X402Version: 2, Accepted: fx.requirements, Payload: voidPayload}

	resp, err := scheme.Settle(context.Background(), payload, fx.requirements, nil)
	require.NoError(t, err)
	assert.True(t, resp.Success)
	assert.Equal(t, signer.writeTx, resp.Transaction)
	assert.Equal(t, 1, signer.writeContractCalls)
}
