package facilitator

import (
	"context"
	"errors"
	"fmt"
	"math/big"
	"strings"
	"time"

	x402 "github.com/x402-foundation/x402/go/v2"
	"github.com/x402-foundation/x402/go/v2/mechanisms/evm"
	authcapture "github.com/x402-foundation/x402/go/v2/mechanisms/evm/auth-capture"
	"github.com/x402-foundation/x402/go/v2/types"
)

// lifecyclePreconditions is the state common to capture and void verification,
// derived once by checkLifecycleCommon: the resolved extra/deployment, the
// escrow's real-payer paymentInfoHash, and the on-chain paymentState balances.
type lifecyclePreconditions struct {
	deployment       authcapture.AuthCaptureDeployment
	extra            authcapture.AuthCaptureExtra
	chainID          *big.Int
	paymentInfo      authcapture.PaymentInfoStruct
	paymentInfoHash  string
	capturableAmount *big.Int
	refundableAmount *big.Int
}

// lifecycleDomain returns the operator EIP-712 domain for a Capture/Void
// signature, scoped to this request's chain and captureAuthorizer.
func lifecycleDomain(extra authcapture.AuthCaptureExtra, chainID *big.Int) evm.TypedDataDomain {
	return evm.TypedDataDomain{
		Name:              authcapture.OperatorEIP712Domain.Name,
		Version:           authcapture.OperatorEIP712Domain.Version,
		ChainID:           chainID,
		VerifyingContract: evm.NormalizeAddress(extra.CaptureAuthorizer),
	}
}

// checkLifecycleCommon validates everything shared by capture and void payloads:
// scheme/network, the lifecycle-not-relayed gate, operator/requirements matching,
// salt binding, and the on-chain paymentState single-use balance read.
func (f *AuthCaptureEvmScheme) checkLifecycleCommon(
	ctx context.Context,
	payload types.PaymentPayload,
	requirements types.PaymentRequirements,
	paymentInfo authcapture.PaymentInfoStruct,
	saltNonce string,
) (*lifecyclePreconditions, error) {
	payer := paymentInfo.Payer

	if payload.Accepted.Scheme != authcapture.SchemeAuthCapture {
		return nil, x402.NewVerifyError(ErrInvalidScheme, payer, fmt.Sprintf("invalid scheme: %s", payload.Accepted.Scheme))
	}
	if payload.Accepted.Network != requirements.Network {
		return nil, x402.NewVerifyError(ErrNetworkMismatch, payer, fmt.Sprintf("network mismatch: %s != %s", payload.Accepted.Network, requirements.Network))
	}

	extra, deployment, err := authcapture.ParseAuthCaptureExtra(requirements)
	if err != nil {
		return nil, x402.NewVerifyError(ErrExtra, payer, err.Error())
	}

	// Lifecycle-not-relayed gate: capture/void only apply to a delegated
	// operator with a non-zero receiverAuthorizer (spec line 489).
	if extra.OperatorType != "" && extra.OperatorType != "delegated" {
		return nil, x402.NewVerifyError(ErrLifecycleNotRelayed, payer, "lifecycle payloads require operatorType delegated")
	}
	if !authcapture.IsNonZeroAddress(extra.ReceiverAuthorizer) {
		return nil, x402.NewVerifyError(ErrLifecycleNotRelayed, payer, "lifecycle payloads require a non-zero receiverAuthorizer")
	}
	if extra.PaymentFlow != "" && extra.PaymentFlow != "escrow" {
		return nil, x402.NewVerifyError(ErrPayloadType, payer, fmt.Sprintf("capture/void require paymentFlow escrow, got %s", extra.PaymentFlow))
	}
	if !f.controlsAddress(extra.CaptureAuthorizer) {
		return nil, x402.NewVerifyError(ErrOperatorNotAdmitted, payer, fmt.Sprintf("captureAuthorizer %s is not controlled by this facilitator", extra.CaptureAuthorizer))
	}
	if !strings.EqualFold(paymentInfo.Operator, extra.CaptureAuthorizer) {
		return nil, x402.NewVerifyError(ErrOperatorMismatch, payer, "paymentInfo.operator does not match captureAuthorizer")
	}
	if !strings.EqualFold(paymentInfo.Receiver, requirements.PayTo) {
		return nil, x402.NewVerifyError(ErrPaymentInfoMismatch, payer, "paymentInfo.receiver does not match requirements.payTo")
	}
	if !strings.EqualFold(paymentInfo.Token, requirements.Asset) {
		return nil, x402.NewVerifyError(ErrPaymentInfoMismatch, payer, "paymentInfo.token does not match requirements.asset")
	}
	if !strings.EqualFold(paymentInfo.FeeReceiver, extra.FeeRecipient) {
		return nil, x402.NewVerifyError(ErrPaymentInfoMismatch, payer, "paymentInfo.feeReceiver does not match extra.feeRecipient")
	}
	if paymentInfo.MinFeeBps != extra.MinFeeBps || paymentInfo.MaxFeeBps != extra.MaxFeeBps {
		return nil, x402.NewVerifyError(ErrPaymentInfoMismatch, payer, "paymentInfo fee bounds do not match extra")
	}
	if paymentInfo.AuthorizationExpiry != extra.CaptureDeadline || paymentInfo.RefundExpiry != extra.RefundDeadline {
		return nil, x402.NewVerifyError(ErrPaymentInfoMismatch, payer, "paymentInfo deadlines do not match extra")
	}

	expectedSalt, err := authcapture.DeriveBoundSalt(
		authcapture.ExtraAddress(extra.ReceiverAuthorizer),
		authcapture.ExtraAddress(extra.Policy),
		saltNonce,
	)
	if err != nil {
		return nil, x402.NewVerifyError(ErrSaltBindingMismatch, payer, err.Error())
	}
	if !strings.EqualFold(expectedSalt, paymentInfo.Salt) {
		return nil, x402.NewVerifyError(ErrSaltBindingMismatch, payer, "salt does not match derived bound salt")
	}

	chainID, err := evm.GetEvmChainId(string(requirements.Network))
	if err != nil {
		return nil, x402.NewVerifyError(ErrNetworkMismatch, payer, err.Error())
	}

	paymentInfoHash, err := authcapture.ComputePaymentInfoHash(chainID, paymentInfo, payer, deployment.Escrow)
	if err != nil {
		return nil, x402.NewVerifyError(ErrPayloadFormat, payer, err.Error())
	}

	hasCollected, capturable, refundable, err := readPaymentState(ctx, f.signer, &deployment, paymentInfoHash)
	if err != nil {
		return nil, x402.NewVerifyError(ErrUnexpectedPaymentState, payer, err.Error())
	}
	if !hasCollected {
		return nil, x402.NewVerifyError(ErrUnexpectedPaymentState, payer, "payment has not been collected on-chain")
	}

	return &lifecyclePreconditions{
		deployment:       deployment,
		extra:            extra,
		chainID:          chainID,
		paymentInfo:      paymentInfo,
		paymentInfoHash:  paymentInfoHash,
		capturableAmount: capturable,
		refundableAmount: refundable,
	}, nil
}

// capturePreconditions is the parsed, verified state verifyCapture derives and
// settleCapture reuses.
type capturePreconditions struct {
	lifecycle               *lifecyclePreconditions
	amount                  *big.Int
	feeBps                  *uint16
	feeAmount               *big.Int
	feeReceiver             string
	authorizerSignature     []byte
	voidAuthorizerSignature []byte
}

// checkCapturePreconditions validates a capture lifecycle payload per the spec's
// 7-step Lifecycle Verification checklist (scheme_auth_capture_evm.md lines 493-512).
func (f *AuthCaptureEvmScheme) checkCapturePreconditions(
	ctx context.Context,
	payload types.PaymentPayload,
	requirements types.PaymentRequirements,
) (*capturePreconditions, error) {
	p, err := authcapture.CapturePayloadFromMap(payload.Payload)
	if err != nil {
		return nil, x402.NewVerifyError(ErrPayloadFormat, "", err.Error())
	}
	payer := p.PaymentInfo.Payer

	lc, err := f.checkLifecycleCommon(ctx, payload, requirements, p.PaymentInfo, p.SaltNonce)
	if err != nil {
		return nil, err
	}

	isV1_0 := lc.deployment.Version == authcapture.AuthCaptureDeploymentV1_0
	if isV1_0 && p.FeeBps == nil {
		return nil, x402.NewVerifyError(ErrFeeBps, payer, "v1.0 deployment requires feeBps")
	}
	if !isV1_0 && p.FeeAmount == "" {
		return nil, x402.NewVerifyError(ErrFeeBps, payer, "v1.1 deployment requires feeAmount")
	}

	amountBig, ok := new(big.Int).SetString(p.Amount, 10)
	if !ok {
		return nil, x402.NewVerifyError(ErrPayloadFormat, payer, "invalid amount")
	}
	expectedCapturable, ok := new(big.Int).SetString(p.ExpectedCapturableAmount, 10)
	if !ok {
		return nil, x402.NewVerifyError(ErrPayloadFormat, payer, "invalid expectedCapturableAmount")
	}
	expectedRefundable, ok := new(big.Int).SetString(p.ExpectedRefundableAmount, 10)
	if !ok {
		return nil, x402.NewVerifyError(ErrPayloadFormat, payer, "invalid expectedRefundableAmount")
	}
	if expectedCapturable.Cmp(lc.capturableAmount) != 0 || expectedRefundable.Cmp(lc.refundableAmount) != 0 {
		return nil, x402.NewVerifyError(ErrUnexpectedPaymentState, payer, "expected capturable/refundable amount is stale")
	}

	now := uint64(time.Now().Unix())
	if now >= p.PaymentInfo.AuthorizationExpiry {
		return nil, x402.NewVerifyError(ErrAuthorizationExpired, payer, "authorizationExpiry has passed")
	}
	if amountBig.Sign() <= 0 || amountBig.Cmp(lc.capturableAmount) > 0 {
		return nil, x402.NewVerifyError(ErrInsufficientAuthorization, payer, "amount must be > 0 and <= capturableAmount")
	}
	if !strings.EqualFold(p.FeeReceiver, lc.extra.FeeRecipient) {
		return nil, x402.NewVerifyError(ErrFeeReceiver, payer, "feeReceiver does not match extra.feeRecipient")
	}

	message := map[string]interface{}{
		"paymentInfoHash":          lc.paymentInfoHash,
		"amount":                   amountBig,
		"feeReceiver":              evm.NormalizeAddress(p.FeeReceiver),
		"expectedCapturableAmount": expectedCapturable,
		"expectedRefundableAmount": expectedRefundable,
	}

	var feeBpsOut *uint16
	var feeAmountOut *big.Int
	if isV1_0 {
		if *p.FeeBps < lc.extra.MinFeeBps || *p.FeeBps > lc.extra.MaxFeeBps {
			return nil, x402.NewVerifyError(ErrFeeBpsOutOfRange, payer, "feeBps outside extra bounds")
		}
		message["feeBps"] = big.NewInt(int64(*p.FeeBps))
		feeBpsOut = p.FeeBps
	} else {
		feeAmountBig, ok := new(big.Int).SetString(p.FeeAmount, 10)
		if !ok {
			return nil, x402.NewVerifyError(ErrPayloadFormat, payer, "invalid feeAmount")
		}
		message["feeAmount"] = feeAmountBig
		feeAmountOut = feeAmountBig
	}

	domain := lifecycleDomain(lc.extra, lc.chainID)

	sigBytes, err := evm.HexToBytes(p.AuthorizerSignature)
	if err != nil {
		return nil, x402.NewVerifyError(ErrSignature, payer, err.Error())
	}
	valid, err := evm.VerifyTypedDataStrict(ctx, f.signer, lc.extra.ReceiverAuthorizer, domain, authcapture.CaptureTypesForDeployment(&lc.deployment), "Capture", message, sigBytes)
	if err != nil {
		return nil, x402.NewVerifyError(ErrAuthorizerSignature, payer, err.Error())
	}
	if !valid {
		return nil, x402.NewVerifyError(ErrAuthorizerSignature, payer, "authorizer signature invalid")
	}

	var voidSigBytes []byte
	if p.VoidAuthorizerSignature != "" {
		if amountBig.Cmp(lc.capturableAmount) >= 0 {
			return nil, x402.NewVerifyError(ErrVoidRemainderFullCapture, payer, "voidAuthorizerSignature present but amount leaves no remainder to void")
		}
		voidSigBytes, err = evm.HexToBytes(p.VoidAuthorizerSignature)
		if err != nil {
			return nil, x402.NewVerifyError(ErrSignature, payer, err.Error())
		}
		voidMessage := map[string]interface{}{"paymentInfoHash": lc.paymentInfoHash}
		voidValid, err := evm.VerifyTypedDataStrict(ctx, f.signer, lc.extra.ReceiverAuthorizer, domain, authcapture.VoidTypes, "Void", voidMessage, voidSigBytes)
		if err != nil {
			return nil, x402.NewVerifyError(ErrVoidAuthorizerSignature, payer, err.Error())
		}
		if !voidValid {
			return nil, x402.NewVerifyError(ErrVoidAuthorizerSignature, payer, "void authorizer signature invalid")
		}
	}

	return &capturePreconditions{
		lifecycle:               lc,
		amount:                  amountBig,
		feeBps:                  feeBpsOut,
		feeAmount:               feeAmountOut,
		feeReceiver:             p.FeeReceiver,
		authorizerSignature:     sigBytes,
		voidAuthorizerSignature: voidSigBytes,
	}, nil
}

// simulateCapture runs AuthCaptureEscrow.capture via eth_call.
func simulateCapture(ctx context.Context, signer evm.FacilitatorEvmSigner, pre *capturePreconditions) error {
	abiTuple, err := pre.lifecycle.paymentInfo.ToAbiTuple()
	if err != nil {
		return x402.NewVerifyError(ErrPayloadFormat, pre.lifecycle.paymentInfo.Payer, err.Error())
	}
	var feeArg interface{}
	if pre.feeBps != nil {
		feeArg = *pre.feeBps
	} else {
		feeArg = pre.feeAmount
	}
	ok, err := simulateEscrowCall(ctx, signer, &pre.lifecycle.deployment, nil, "capture", abiTuple, pre.amount, feeArg, evm.NormalizeAddress(pre.feeReceiver))
	if err != nil {
		return x402.NewVerifyError(ErrSimulationFailed, pre.lifecycle.paymentInfo.Payer, err.Error())
	}
	if !ok {
		return x402.NewVerifyError(ErrSimulationFailed, pre.lifecycle.paymentInfo.Payer, "capture simulation reverted")
	}
	return nil
}

// verifyCapture validates a capture lifecycle payload against requirements.
func (f *AuthCaptureEvmScheme) verifyCapture(
	ctx context.Context,
	payload types.PaymentPayload,
	requirements types.PaymentRequirements,
) (*x402.VerifyResponse, error) {
	pre, err := f.checkCapturePreconditions(ctx, payload, requirements)
	if err != nil {
		return nil, err
	}
	if err := simulateCapture(ctx, f.signer, pre); err != nil {
		return nil, err
	}
	return &x402.VerifyResponse{IsValid: true, Payer: pre.lifecycle.paymentInfo.Payer}, nil
}

// settleCapture settles a capture lifecycle payload on-chain. When
// voidAuthorizerSignature is present, it also drives a best-effort void of any
// remaining hold after the capture confirms (spec's capture-and-void combo).
func (f *AuthCaptureEvmScheme) settleCapture(
	ctx context.Context,
	payload types.PaymentPayload,
	requirements types.PaymentRequirements,
	fctx *x402.FacilitatorContext,
) (*x402.SettleResponse, error) {
	network := x402.Network(payload.Accepted.Network)

	sigHex := lifecycleSignature(payload.Payload)
	if sigHex != "" {
		if txHash, ok, _ := f.pendingStore.Get(ctx, sigHex); ok {
			_ = f.pendingStore.Delete(ctx, sigHex)
			return f.awaitLifecycleSettlement(ctx, sigHex, network, lifecyclePayer(payload.Payload), txHash)
		}
	}

	pre, err := f.checkCapturePreconditions(ctx, payload, requirements)
	if err != nil {
		ve := &x402.VerifyError{}
		if errors.As(err, &ve) {
			return nil, x402.NewSettleError(ve.InvalidReason, ve.Payer, network, "", ve.InvalidMessage)
		}
		return nil, x402.NewSettleError(ErrVerificationFailed, "", network, "", err.Error())
	}
	payer := pre.lifecycle.paymentInfo.Payer

	if f.config.SimulateInSettle {
		if err := simulateCapture(ctx, f.signer, pre); err != nil {
			ve := &x402.VerifyError{}
			if errors.As(err, &ve) {
				return nil, x402.NewSettleError(ve.InvalidReason, ve.Payer, network, "", ve.InvalidMessage)
			}
			return nil, x402.NewSettleError(ErrVerificationFailed, payer, network, "", err.Error())
		}
	}

	abiTuple, err := pre.lifecycle.paymentInfo.ToAbiTuple()
	if err != nil {
		return nil, x402.NewSettleError(ErrPayloadFormat, payer, network, "", err.Error())
	}
	var feeArg interface{}
	if pre.feeBps != nil {
		feeArg = *pre.feeBps
	} else {
		feeArg = pre.feeAmount
	}

	dataSuffix, err := evm.ResolveDataSuffix(fctx, evm.DataSuffixContext{Payload: payload, Requirements: requirements})
	if err != nil {
		return nil, x402.NewSettleError(ErrPayloadFormat, payer, network, "", err.Error())
	}

	txHash, err := f.signer.WriteContract(
		ctx,
		pre.lifecycle.deployment.Escrow,
		authcapture.EscrowABIForDeployment(&pre.lifecycle.deployment),
		"capture",
		dataSuffix,
		abiTuple,
		pre.amount,
		feeArg,
		evm.NormalizeAddress(pre.feeReceiver),
	)
	if err != nil {
		return nil, x402.NewSettleError(parseAuthCaptureRevert(err), payer, network, "", err.Error())
	}

	resp, err := f.awaitLifecycleSettlement(ctx, sigHex, network, payer, txHash)
	if err != nil {
		return nil, err
	}

	if len(pre.voidAuthorizerSignature) > 0 {
		f.tryVoidRemainder(ctx, pre.lifecycle, dataSuffix)
	}

	return resp, nil
}

// tryVoidRemainder best-effort voids any capturable balance left after a
// capture-and-void combo's capture leg. Failures (including a race that
// already emptied the hold) are swallowed: the capture already succeeded and
// is the settlement's outcome of record.
func (f *AuthCaptureEvmScheme) tryVoidRemainder(ctx context.Context, lc *lifecyclePreconditions, dataSuffix []byte) {
	_, capturable, _, err := readPaymentState(ctx, f.signer, &lc.deployment, lc.paymentInfoHash)
	if err != nil || capturable == nil || capturable.Sign() <= 0 {
		return
	}
	abiTuple, err := lc.paymentInfo.ToAbiTuple()
	if err != nil {
		return
	}
	txHash, err := f.signer.WriteContract(ctx, lc.deployment.Escrow, authcapture.EscrowABIForDeployment(&lc.deployment), "void", dataSuffix, abiTuple)
	if err != nil {
		return
	}
	_, _ = f.signer.WaitForTransactionReceipt(ctx, txHash)
}

// voidPreconditions is the parsed, verified state verifyVoid derives and
// settleVoid reuses.
type voidPreconditions struct {
	lifecycle           *lifecyclePreconditions
	authorizerSignature []byte
}

// checkVoidPreconditions validates a void lifecycle payload per the spec's
// Lifecycle Verification checklist.
func (f *AuthCaptureEvmScheme) checkVoidPreconditions(
	ctx context.Context,
	payload types.PaymentPayload,
	requirements types.PaymentRequirements,
) (*voidPreconditions, error) {
	p, err := authcapture.VoidPayloadFromMap(payload.Payload)
	if err != nil {
		return nil, x402.NewVerifyError(ErrPayloadFormat, "", err.Error())
	}
	payer := p.PaymentInfo.Payer

	lc, err := f.checkLifecycleCommon(ctx, payload, requirements, p.PaymentInfo, p.SaltNonce)
	if err != nil {
		return nil, err
	}
	if lc.capturableAmount == nil || lc.capturableAmount.Sign() <= 0 {
		return nil, x402.NewVerifyError(ErrUnexpectedPaymentState, payer, "no capturable balance to void")
	}

	domain := lifecycleDomain(lc.extra, lc.chainID)
	message := map[string]interface{}{"paymentInfoHash": lc.paymentInfoHash}
	sigBytes, err := evm.HexToBytes(p.AuthorizerSignature)
	if err != nil {
		return nil, x402.NewVerifyError(ErrSignature, payer, err.Error())
	}
	valid, err := evm.VerifyTypedDataStrict(ctx, f.signer, lc.extra.ReceiverAuthorizer, domain, authcapture.VoidTypes, "Void", message, sigBytes)
	if err != nil {
		return nil, x402.NewVerifyError(ErrAuthorizerSignature, payer, err.Error())
	}
	if !valid {
		return nil, x402.NewVerifyError(ErrAuthorizerSignature, payer, "authorizer signature invalid")
	}

	return &voidPreconditions{lifecycle: lc, authorizerSignature: sigBytes}, nil
}

// simulateVoid runs AuthCaptureEscrow.void via eth_call.
func simulateVoid(ctx context.Context, signer evm.FacilitatorEvmSigner, pre *voidPreconditions) error {
	abiTuple, err := pre.lifecycle.paymentInfo.ToAbiTuple()
	if err != nil {
		return x402.NewVerifyError(ErrPayloadFormat, pre.lifecycle.paymentInfo.Payer, err.Error())
	}
	ok, err := simulateEscrowCall(ctx, signer, &pre.lifecycle.deployment, nil, "void", abiTuple)
	if err != nil {
		return x402.NewVerifyError(ErrSimulationFailed, pre.lifecycle.paymentInfo.Payer, err.Error())
	}
	if !ok {
		return x402.NewVerifyError(ErrSimulationFailed, pre.lifecycle.paymentInfo.Payer, "void simulation reverted")
	}
	return nil
}

// verifyVoid validates a void lifecycle payload against requirements.
func (f *AuthCaptureEvmScheme) verifyVoid(
	ctx context.Context,
	payload types.PaymentPayload,
	requirements types.PaymentRequirements,
) (*x402.VerifyResponse, error) {
	pre, err := f.checkVoidPreconditions(ctx, payload, requirements)
	if err != nil {
		return nil, err
	}
	if err := simulateVoid(ctx, f.signer, pre); err != nil {
		return nil, err
	}
	return &x402.VerifyResponse{IsValid: true, Payer: pre.lifecycle.paymentInfo.Payer}, nil
}

// settleVoid settles a void lifecycle payload on-chain.
func (f *AuthCaptureEvmScheme) settleVoid(
	ctx context.Context,
	payload types.PaymentPayload,
	requirements types.PaymentRequirements,
	fctx *x402.FacilitatorContext,
) (*x402.SettleResponse, error) {
	network := x402.Network(payload.Accepted.Network)

	sigHex := lifecycleSignature(payload.Payload)
	if sigHex != "" {
		if txHash, ok, _ := f.pendingStore.Get(ctx, sigHex); ok {
			_ = f.pendingStore.Delete(ctx, sigHex)
			return f.awaitLifecycleSettlement(ctx, sigHex, network, lifecyclePayer(payload.Payload), txHash)
		}
	}

	pre, err := f.checkVoidPreconditions(ctx, payload, requirements)
	if err != nil {
		ve := &x402.VerifyError{}
		if errors.As(err, &ve) {
			return nil, x402.NewSettleError(ve.InvalidReason, ve.Payer, network, "", ve.InvalidMessage)
		}
		return nil, x402.NewSettleError(ErrVerificationFailed, "", network, "", err.Error())
	}
	payer := pre.lifecycle.paymentInfo.Payer

	if f.config.SimulateInSettle {
		if err := simulateVoid(ctx, f.signer, pre); err != nil {
			ve := &x402.VerifyError{}
			if errors.As(err, &ve) {
				return nil, x402.NewSettleError(ve.InvalidReason, ve.Payer, network, "", ve.InvalidMessage)
			}
			return nil, x402.NewSettleError(ErrVerificationFailed, payer, network, "", err.Error())
		}
	}

	abiTuple, err := pre.lifecycle.paymentInfo.ToAbiTuple()
	if err != nil {
		return nil, x402.NewSettleError(ErrPayloadFormat, payer, network, "", err.Error())
	}

	dataSuffix, err := evm.ResolveDataSuffix(fctx, evm.DataSuffixContext{Payload: payload, Requirements: requirements})
	if err != nil {
		return nil, x402.NewSettleError(ErrPayloadFormat, payer, network, "", err.Error())
	}

	txHash, err := f.signer.WriteContract(
		ctx,
		pre.lifecycle.deployment.Escrow,
		authcapture.EscrowABIForDeployment(&pre.lifecycle.deployment),
		"void",
		dataSuffix,
		abiTuple,
	)
	if err != nil {
		return nil, x402.NewSettleError(parseAuthCaptureRevert(err), payer, network, "", err.Error())
	}

	return f.awaitLifecycleSettlement(ctx, sigHex, network, payer, txHash)
}

func (f *AuthCaptureEvmScheme) awaitLifecycleSettlement(
	ctx context.Context,
	pendingKey string,
	network x402.Network,
	payer string,
	txHash string,
) (*x402.SettleResponse, error) {
	receipt, err := evm.WaitForSettleReceiptWithPendingStore(ctx, f.pendingStore, pendingKey, f.signer, txHash, payer, network,
		ErrTransactionReverted, ErrTransactionReverted)
	if err != nil {
		return nil, err
	}
	return &x402.SettleResponse{
		Success:     true,
		Transaction: receipt.TxHash,
		Network:     network,
		Payer:       payer,
	}, nil
}

// lifecycleSignature extracts the operator authorizerSignature shared by both
// capture and void wire payloads, used as the pending-settlement store key.
func lifecycleSignature(payload map[string]interface{}) string {
	if sig, ok := payload["authorizerSignature"].(string); ok {
		return sig
	}
	return ""
}

// lifecyclePayer extracts the payer address directly from the wire payload,
// for the pending-settlement reconciliation path where re-verifying is
// unnecessary (the original attempt already verified this exact payload
// before broadcasting).
func lifecyclePayer(payload map[string]interface{}) string {
	if info, ok := payload["paymentInfo"].(map[string]interface{}); ok {
		if payer, ok := info["payer"].(string); ok {
			return payer
		}
	}
	return ""
}
