package server

import (
	"context"
	"fmt"
	"math/big"

	x402 "github.com/x402-foundation/x402/go/v2"
	"github.com/x402-foundation/x402/go/v2/mechanisms/evm"
	authcapture "github.com/x402-foundation/x402/go/v2/mechanisms/evm/auth-capture"
	"github.com/x402-foundation/x402/go/v2/types"
)

// SettleOnCancel voids the full escrow hold when a verified-but-uncompleted
// payment is canceled (handler failure/throw or a post-verify abort), so
// funds are released immediately instead of waiting for onchain expiry.
func (s *AuthCaptureEvmScheme) SettleOnCancel(ctx x402.VerifiedPaymentCanceledContext) (*types.PaymentRequirements, error) {
	switch ctx.Reason {
	case x402.CancellationReasonHandlerFailed,
		x402.CancellationReasonHandlerThrew,
		x402.CancellationReasonAfterVerifyAborted:
	default:
		return nil, nil
	}
	requirements := requirementsFromView(ctx.Requirements)
	return &requirements, nil
}

// EnrichSettlementPayload signs the receiver-authorizer message the
// facilitator requires to relay the current phase's escrow operation:
// authorize needs no server-added fields, after-handler signs a full Capture
// of the entire held amount, and cancel signs a Void that releases it.
func (s *AuthCaptureEvmScheme) EnrichSettlementPayload(ctx x402.SettleContext) (map[string]interface{}, error) {
	if ctx.Phase == x402.SettlePhaseBeforeHandler {
		return nil, nil
	}

	extra, deployment, err := authcapture.ParseAuthCaptureExtra(requirementsFromView(ctx.Requirements))
	if err != nil {
		return nil, fmt.Errorf(ErrInvalidCollectPayload+": %w", err)
	}
	chainID, err := evm.GetEvmChainId(ctx.Requirements.GetNetwork())
	if err != nil {
		return nil, err
	}

	payer, preApprovalExpiry, salt, saltNonce, err := collectPayloadFields(ctx.Payload.GetPayload())
	if err != nil {
		return nil, fmt.Errorf(ErrInvalidCollectPayload+": %w", err)
	}

	requirements := requirementsFromView(ctx.Requirements)
	paymentInfo := authcapture.ReconstructPaymentInfo(payer, preApprovalExpiry, salt, requirements, extra, "")
	paymentInfoHash, err := authcapture.ComputePaymentInfoHash(chainID, paymentInfo, payer, deployment.Escrow)
	if err != nil {
		return nil, err
	}

	paymentInfoMap := map[string]interface{}{
		"operator":            paymentInfo.Operator,
		"payer":               paymentInfo.Payer,
		"receiver":            paymentInfo.Receiver,
		"token":               paymentInfo.Token,
		"maxAmount":           paymentInfo.MaxAmount,
		"preApprovalExpiry":   paymentInfo.PreApprovalExpiry,
		"authorizationExpiry": paymentInfo.AuthorizationExpiry,
		"refundExpiry":        paymentInfo.RefundExpiry,
		"minFeeBps":           paymentInfo.MinFeeBps,
		"maxFeeBps":           paymentInfo.MaxFeeBps,
		"feeReceiver":         paymentInfo.FeeReceiver,
		"salt":                paymentInfo.Salt,
	}

	if ctx.Phase == x402.SettlePhaseCancel {
		signature, err := s.signVoid(ctx.Ctx, extra, chainID, paymentInfoHash)
		if err != nil {
			return nil, fmt.Errorf(ErrFailedToSignVoid+": %w", err)
		}
		return map[string]interface{}{
			"type":                "void",
			"paymentInfo":         paymentInfoMap,
			"saltNonce":           saltNonce,
			"authorizerSignature": signature,
		}, nil
	}

	// SettlePhaseAfterHandler: capture the full amount originally held. This
	// scheme only supports captureMode "sync" (capture immediately follows
	// authorize with no intervening lifecycle event), so the escrow's
	// onchain capturable/refundable balances are still exactly the amounts
	// authorize collected: the full requirements amount and zero.
	amountBig, ok := new(big.Int).SetString(requirements.Amount, 10)
	if !ok {
		return nil, fmt.Errorf(ErrInvalidCollectPayload+": invalid requirements amount %s", requirements.Amount)
	}
	feeAmountBig := authcapture.FeeAmountFromBps(amountBig, extra.MinFeeBps)

	signature, err := s.signCapture(ctx.Ctx, extra, &deployment, chainID, paymentInfoHash, amountBig, feeAmountBig)
	if err != nil {
		return nil, fmt.Errorf(ErrFailedToSignCapture+": %w", err)
	}

	result := map[string]interface{}{
		"type":                     "capture",
		"paymentInfo":              paymentInfoMap,
		"saltNonce":                saltNonce,
		"amount":                   amountBig.String(),
		"feeReceiver":              extra.FeeRecipient,
		"expectedCapturableAmount": amountBig.String(),
		"expectedRefundableAmount": "0",
		"authorizerSignature":      signature,
	}
	if deployment.Version == authcapture.AuthCaptureDeploymentV1_0 {
		result["feeBps"] = extra.MinFeeBps
	} else {
		result["feeAmount"] = feeAmountBig.String()
	}
	return result, nil
}

// signCapture signs the Capture EIP-712 message matching the facilitator's
// lifecycleDomain/message construction in facilitator/lifecycle.go.
func (s *AuthCaptureEvmScheme) signCapture(
	ctx context.Context,
	extra authcapture.AuthCaptureExtra,
	deployment *authcapture.AuthCaptureDeployment,
	chainID *big.Int,
	paymentInfoHash string,
	amount *big.Int,
	feeAmount *big.Int,
) (string, error) {
	domain := operatorDomain(extra, chainID)
	message := map[string]interface{}{
		"paymentInfoHash":          paymentInfoHash,
		"amount":                   amount,
		"feeReceiver":              evm.NormalizeAddress(extra.FeeRecipient),
		"expectedCapturableAmount": amount,
		"expectedRefundableAmount": big.NewInt(0),
	}
	if deployment.Version == authcapture.AuthCaptureDeploymentV1_0 {
		message["feeBps"] = big.NewInt(int64(extra.MinFeeBps))
	} else {
		message["feeAmount"] = feeAmount
	}

	sig, err := s.config.ReceiverAuthorizerSigner.SignTypedData(
		ctx, domain, authcapture.CaptureTypesForDeployment(deployment), "Capture", message,
	)
	if err != nil {
		return "", err
	}
	return evm.BytesToHex(sig), nil
}

// signVoid signs the Void EIP-712 message matching the facilitator's
// lifecycleDomain/message construction in facilitator/lifecycle.go.
func (s *AuthCaptureEvmScheme) signVoid(
	ctx context.Context,
	extra authcapture.AuthCaptureExtra,
	chainID *big.Int,
	paymentInfoHash string,
) (string, error) {
	domain := operatorDomain(extra, chainID)
	message := map[string]interface{}{"paymentInfoHash": paymentInfoHash}

	sig, err := s.config.ReceiverAuthorizerSigner.SignTypedData(ctx, domain, authcapture.VoidTypes, "Void", message)
	if err != nil {
		return "", err
	}
	return evm.BytesToHex(sig), nil
}

// operatorDomain mirrors facilitator.lifecycleDomain: the shared operator
// EIP-712 domain scoped to this request's chain and captureAuthorizer.
func operatorDomain(extra authcapture.AuthCaptureExtra, chainID *big.Int) evm.TypedDataDomain {
	return evm.TypedDataDomain{
		Name:              authcapture.OperatorEIP712Domain.Name,
		Version:           authcapture.OperatorEIP712Domain.Version,
		ChainID:           chainID,
		VerifyingContract: evm.NormalizeAddress(extra.CaptureAuthorizer),
	}
}

// collectPayloadFields extracts payer/preApprovalExpiry/salt/saltNonce from
// the client's original EIP-3009 or Permit2 collect payload — the only shape
// ctx.Payload.GetPayload() ever holds, since the client never builds a
// capture/void-shaped payload itself.
func collectPayloadFields(payload map[string]interface{}) (payer string, preApprovalExpiry uint64, salt string, saltNonce string, err error) {
	if authcapture.IsEip3009Payload(payload) {
		p, err := authcapture.Eip3009CollectPayloadFromMap(payload)
		if err != nil {
			return "", 0, "", "", err
		}
		validBefore, ok := new(big.Int).SetString(p.Authorization.ValidBefore, 10)
		if !ok {
			return "", 0, "", "", fmt.Errorf("invalid authorization.validBefore: %s", p.Authorization.ValidBefore)
		}
		return p.Authorization.From, validBefore.Uint64(), p.Salt, p.SaltNonce, nil
	}
	if authcapture.IsPermit2Payload(payload) {
		p, err := authcapture.Permit2CollectPayloadFromMap(payload)
		if err != nil {
			return "", 0, "", "", err
		}
		deadline, ok := new(big.Int).SetString(p.Permit2Authorization.Deadline, 10)
		if !ok {
			return "", 0, "", "", fmt.Errorf("invalid permit2Authorization.deadline: %s", p.Permit2Authorization.Deadline)
		}
		return p.Permit2Authorization.From, deadline.Uint64(), p.Salt, p.SaltNonce, nil
	}
	return "", 0, "", "", fmt.Errorf("payload is neither an EIP-3009 nor a Permit2 auth-capture collect payload")
}

// requirementsFromView rebuilds concrete requirements from the version-agnostic
// hook view so EnrichSettlementPayload/SettleOnCancel can parse extra.
func requirementsFromView(view x402.PaymentRequirementsView) types.PaymentRequirements {
	return types.PaymentRequirements{
		Scheme:            view.GetScheme(),
		Network:           view.GetNetwork(),
		Amount:            view.GetAmount(),
		Asset:             view.GetAsset(),
		PayTo:             view.GetPayTo(),
		MaxTimeoutSeconds: view.GetMaxTimeoutSeconds(),
		Extra:             view.GetExtra(),
	}
}

func jsonNumberToUint16(value interface{}) (uint16, bool) {
	switch v := value.(type) {
	case float64:
		if v < 0 || v > 65535 {
			return 0, false
		}
		return uint16(v), true
	case int:
		if v < 0 || v > 65535 {
			return 0, false
		}
		return uint16(v), true
	case uint16:
		return v, true
	default:
		return 0, false
	}
}
