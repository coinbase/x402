package server

import (
	"context"
	"encoding/json"
	"fmt"
	"math/big"

	x402 "github.com/x402-foundation/x402/go/v2"
	"github.com/x402-foundation/x402/go/v2/mechanisms/evm"
	authcapture "github.com/x402-foundation/x402/go/v2/mechanisms/evm/auth-capture"
	"github.com/x402-foundation/x402/go/v2/types"
)

// lifecycleRequirementsTimeout is the minimum, since a lifecycle settle has no payer-signed window.
const lifecycleRequirementsTimeout = 1

// CaptureOptions tunes a manager capture. A nil Amount captures everything capturable. A nil Fee
// charges the route's minimum fee, and a Fee must use the deployment's encoding (feeBps on v1.0,
// feeAmount on v1.1). An empty FeeReceiver pays the route's feeRecipient.
type CaptureOptions struct {
	Amount        *big.Int
	Fee           *authcapture.CaptureFee
	FeeReceiver   string
	VoidRemainder bool
}

// LifecycleManager captures, voids and refunds stored authorized payments through a facilitator,
// for deferred routes and for any payment the server holds a record of. It refuses payments of a
// custom operator, whose contract performs those calls itself.
type LifecycleManager struct {
	scheme      *AuthCaptureEvmScheme
	facilitator x402.FacilitatorClient
}

// NewLifecycleManager binds the scheme's storage and signer to a facilitator client.
func (s *AuthCaptureEvmScheme) NewLifecycleManager(facilitator x402.FacilitatorClient) *LifecycleManager {
	return &LifecycleManager{scheme: s, facilitator: facilitator}
}

// Get returns the stored payment, or nil when none is recorded.
func (m *LifecycleManager) Get(ctx context.Context, paymentInfoHash string) (*AuthorizedPayment, error) {
	return m.scheme.storage.Get(ctx, paymentInfoHash)
}

// List returns every stored payment.
func (m *LifecycleManager) List(ctx context.Context) ([]*AuthorizedPayment, error) {
	return m.scheme.storage.List(ctx)
}

// lifecycleCall is a stored payment resolved for one capture, void or refund.
type lifecycleCall struct {
	record       *AuthorizedPayment
	requirements types.PaymentRequirements
	extra        authcapture.AuthCaptureExtra
	deployment   authcapture.AuthCaptureDeployment
	chainID      *big.Int
	capturable   *big.Int
	refundable   *big.Int
}

// requirements rebuilds the requirements the payment was collected under from its record.
func (p *AuthorizedPayment) requirements() types.PaymentRequirements {
	info := p.PaymentInfo
	extra := map[string]interface{}{
		"captureAuthorizer": info.Operator,
		"captureDeadline":   info.AuthorizationExpiry,
		"refundDeadline":    info.RefundExpiry,
		"feeRecipient":      info.FeeReceiver,
		"minFeeBps":         info.MinFeeBps,
		"maxFeeBps":         info.MaxFeeBps,
		"paymentFlow":       p.PaymentFlow,
		"operatorType":      p.OperatorType,
		"authCaptureEscrow": p.AuthCaptureEscrow,
	}
	for key, value := range map[string]string{
		"receiverAuthorizer":  p.ReceiverAuthorizer,
		"policy":              p.Policy,
		"name":                p.Name,
		"version":             p.Version,
		"assetTransferMethod": p.AssetTransferMethod,
	} {
		if value != "" {
			extra[key] = value
		}
	}
	if p.PaymentFlow == authcapture.PaymentFlowEscrow {
		extra["captureMode"] = authcapture.CaptureModeDeferred
	}
	return types.PaymentRequirements{
		Scheme:            authcapture.SchemeAuthCapture,
		Network:           p.Network,
		Asset:             info.Token,
		Amount:            info.MaxAmount,
		PayTo:             info.Receiver,
		MaxTimeoutSeconds: lifecycleRequirementsTimeout,
		Extra:             extra,
	}
}

func (m *LifecycleManager) resolve(ctx context.Context, paymentInfoHash string, refund bool) (*lifecycleCall, error) {
	record, err := m.scheme.storage.Get(ctx, paymentInfoHash)
	if err != nil {
		return nil, err
	}
	if record == nil {
		return nil, fmt.Errorf("%s: %s", ErrPaymentNotFound, paymentInfoHash)
	}
	switch {
	case record.OperatorType == authcapture.OperatorTypeCustom:
		return nil, fmt.Errorf("%s: the custom operator performs capture, void and refund itself", ErrLifecycleUnavailable)
	case record.PaymentFlow == authcapture.PaymentFlowAuthorization && !refund:
		return nil, fmt.Errorf("%s: an authorization-flow payment is already charged, only a refund applies", ErrLifecycleUnavailable)
	case record.SaltNonce == "":
		return nil, fmt.Errorf("%s: the record has no saltNonce, which lifecycle payloads need", ErrLifecycleUnavailable)
	}

	requirements := record.requirements()
	extra, deployment, err := authcapture.ParseAuthCaptureExtra(requirements)
	if err != nil {
		return nil, fmt.Errorf("%s: %w", ErrLifecycleUnavailable, err)
	}
	chainID, err := evm.GetEvmChainId(record.Network)
	if err != nil {
		return nil, err
	}
	capturable, capturableOK := parseBalance(record.CapturableAmount)
	refundable, refundableOK := parseBalance(record.RefundableAmount)
	if !capturableOK || !refundableOK {
		return nil, fmt.Errorf("%s: stored balances of %s are unreadable", ErrInvalidLifecycleAmount, paymentInfoHash)
	}
	return &lifecycleCall{
		record: record, requirements: requirements, extra: extra, deployment: deployment,
		chainID: chainID, capturable: capturable, refundable: refundable,
	}, nil
}

// settle sends a signed lifecycle payload to the facilitator, reporting whether it succeeded.
func (m *LifecycleManager) settle(ctx context.Context, call *lifecycleCall, fields map[string]interface{}) (*x402.SettleResponse, error) {
	paymentInfo, err := call.record.PaymentInfo.ToWireMap()
	if err != nil {
		return nil, err
	}
	fields["paymentInfo"] = paymentInfo
	fields["saltNonce"] = call.record.SaltNonce

	payloadBytes, err := json.Marshal(types.PaymentPayload{X402Version: 2, Accepted: call.requirements, Payload: fields})
	if err != nil {
		return nil, err
	}
	requirementsBytes, err := json.Marshal(call.requirements)
	if err != nil {
		return nil, err
	}
	return m.facilitator.Settle(ctx, payloadBytes, requirementsBytes)
}

// Capture captures a stored payment, optionally releasing the rest of the hold.
func (m *LifecycleManager) Capture(ctx context.Context, paymentInfoHash string, opts *CaptureOptions) (*x402.SettleResponse, error) {
	if opts == nil {
		opts = &CaptureOptions{}
	}
	call, err := m.resolve(ctx, paymentInfoHash, false)
	if err != nil {
		return nil, err
	}
	signer, err := m.scheme.requireSigner()
	if err != nil {
		return nil, err
	}
	amount := call.capturable
	if opts.Amount != nil {
		amount = opts.Amount
	}
	if amount.Sign() <= 0 || amount.Cmp(call.capturable) > 0 {
		return nil, fmt.Errorf("%s: capture amount %s must be > 0 and <= capturable %s", ErrInvalidLifecycleAmount, amount, call.capturable)
	}
	if opts.VoidRemainder && amount.Cmp(call.capturable) == 0 {
		return nil, fmt.Errorf("%s: nothing remains to void after capturing all %s", ErrInvalidLifecycleAmount, call.capturable)
	}

	fee := authcapture.DefaultCaptureFee(&call.deployment, amount, call.extra.MinFeeBps)
	if opts.Fee != nil {
		fee = *opts.Fee
	}
	fields, err := signCapture(ctx, signer, call.deployment, call.extra, call.chainID, captureTerms{
		paymentInfoHash: call.record.PaymentInfoHash,
		amount:          amount,
		fee:             fee,
		feeReceiver:     firstNonEmpty(opts.FeeReceiver, call.extra.FeeRecipient),
		capturable:      call.capturable,
		refundable:      call.refundable,
		voidRemainder:   opts.VoidRemainder,
	})
	if err != nil {
		return nil, err
	}
	fields["type"] = "capture"
	response, err := m.settle(ctx, call, fields)
	if err != nil || !response.Success {
		return response, err
	}
	return response, applyCapture(ctx, m.scheme.storage, call.record.PaymentInfoHash, amount, opts.VoidRemainder)
}

// Void releases the remaining hold of a stored payment.
func (m *LifecycleManager) Void(ctx context.Context, paymentInfoHash string) (*x402.SettleResponse, error) {
	call, err := m.resolve(ctx, paymentInfoHash, false)
	if err != nil {
		return nil, err
	}
	signer, err := m.scheme.requireSigner()
	if err != nil {
		return nil, err
	}
	signature, err := authcapture.SignVoid(ctx, signer, call.extra.CaptureAuthorizer, call.chainID, call.record.PaymentInfoHash)
	if err != nil {
		return nil, fmt.Errorf(ErrFailedToSignVoid+": %w", err)
	}
	response, err := m.settle(ctx, call, map[string]interface{}{"type": "void", "authorizerSignature": evm.BytesToHex(signature)})
	if err != nil || !response.Success {
		return response, err
	}
	return response, applyVoid(ctx, m.scheme.storage, call.record.PaymentInfoHash)
}

// Refund returns captured funds of a stored payment to the payer.
func (m *LifecycleManager) Refund(ctx context.Context, paymentInfoHash string, amount *big.Int) (*x402.SettleResponse, error) {
	call, err := m.resolve(ctx, paymentInfoHash, true)
	if err != nil {
		return nil, err
	}
	signer, err := m.scheme.requireSigner()
	if err != nil {
		return nil, err
	}
	if amount == nil || amount.Sign() <= 0 || amount.Cmp(call.refundable) > 0 {
		return nil, fmt.Errorf("%s: refund amount %v must be > 0 and <= refundable %s", ErrInvalidLifecycleAmount, amount, call.refundable)
	}
	signature, err := authcapture.SignRefund(ctx, signer, call.extra.CaptureAuthorizer, call.chainID, authcapture.RefundParams{
		PaymentInfoHash:    call.record.PaymentInfoHash,
		Amount:             amount,
		TokenCollector:     call.deployment.OperatorRefundCollector,
		ExpectedCapturable: call.capturable,
		ExpectedRefundable: call.refundable,
	})
	if err != nil {
		return nil, fmt.Errorf(ErrFailedToSignRefund+": %w", err)
	}
	response, err := m.settle(ctx, call, map[string]interface{}{
		"type":                     "refund",
		"amount":                   amount.String(),
		"expectedCapturableAmount": call.capturable.String(),
		"expectedRefundableAmount": call.refundable.String(),
		"authorizerSignature":      evm.BytesToHex(signature),
	})
	if err != nil || !response.Success {
		return response, err
	}
	return response, applyRefund(ctx, m.scheme.storage, call.record.PaymentInfoHash, amount)
}
