package server

import (
	"fmt"
	"math/big"
	"strconv"

	x402 "github.com/x402-foundation/x402/go/v2"
	"github.com/x402-foundation/x402/go/v2/mechanisms/evm"
	authcapture "github.com/x402-foundation/x402/go/v2/mechanisms/evm/auth-capture"
	"github.com/x402-foundation/x402/go/v2/types"
)

// SettleOnCancel voids the escrow hold when a verified payment is canceled before
// the handler completes, releasing funds without waiting for onchain expiry.
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

// EnrichSettlementPayload adds the receiver-authorizer signature the facilitator needs:
// none for authorize, a full Capture after the handler, and a Void on cancel.
func (s *AuthCaptureEvmScheme) EnrichSettlementPayload(ctx x402.SettleContext) (map[string]interface{}, error) {
	if ctx.Phase == x402.SettlePhaseBeforeHandler {
		return nil, nil
	}

	requirements := requirementsFromView(ctx.Requirements)
	extra, deployment, err := authcapture.ParseAuthCaptureExtra(requirements)
	if err != nil {
		return nil, fmt.Errorf(ErrInvalidCollectPayload+": %w", err)
	}
	chainID, err := evm.GetEvmChainId(requirements.Network)
	if err != nil {
		return nil, err
	}
	payer, preApprovalExpiry, salt, err := collectPayloadFields(ctx.Payload.GetPayload())
	if err != nil {
		return nil, fmt.Errorf(ErrInvalidCollectPayload+": %w", err)
	}

	paymentInfo := authcapture.ReconstructPaymentInfo(payer, preApprovalExpiry, salt, requirements, extra)
	paymentInfoHash, err := authcapture.ComputePaymentInfoHash(chainID, paymentInfo, payer, deployment.Escrow)
	if err != nil {
		return nil, err
	}
	paymentInfoMap, err := paymentInfo.ToWireMap()
	if err != nil {
		return nil, err
	}

	if ctx.Phase == x402.SettlePhaseCancel {
		signature, err := authcapture.SignVoid(ctx.Ctx, s.config.ReceiverAuthorizerSigner, extra.CaptureAuthorizer, chainID, paymentInfoHash)
		if err != nil {
			return nil, fmt.Errorf(ErrFailedToSignVoid+": %w", err)
		}
		return map[string]interface{}{
			"type":                "void",
			"paymentInfo":         paymentInfoMap,
			"authorizerSignature": evm.BytesToHex(signature),
		}, nil
	}

	// The escrow still holds exactly the authorized amount: the capture follows authorize directly.
	amount, ok := new(big.Int).SetString(requirements.Amount, 10)
	if !ok {
		return nil, fmt.Errorf(ErrInvalidCollectPayload+": invalid requirements amount %s", requirements.Amount)
	}
	fee := authcapture.DefaultCaptureFee(&deployment, amount, extra.MinFeeBps)
	signature, err := authcapture.SignCapture(ctx.Ctx, s.config.ReceiverAuthorizerSigner, &deployment, extra.CaptureAuthorizer, chainID,
		authcapture.CaptureParams{
			PaymentInfoHash:    paymentInfoHash,
			Amount:             amount,
			Fee:                fee,
			FeeReceiver:        extra.FeeRecipient,
			ExpectedCapturable: amount,
			ExpectedRefundable: big.NewInt(0),
		})
	if err != nil {
		return nil, fmt.Errorf(ErrFailedToSignCapture+": %w", err)
	}

	result := map[string]interface{}{
		"type":                     "capture",
		"paymentInfo":              paymentInfoMap,
		"amount":                   amount.String(),
		"feeReceiver":              extra.FeeRecipient,
		"expectedCapturableAmount": amount.String(),
		"expectedRefundableAmount": "0",
		"authorizerSignature":      evm.BytesToHex(signature),
	}
	fee.AddToWire(result)
	return result, nil
}

// collectPayloadFields reads the payer, expiry and salt from the client's EIP-3009 or
// Permit2 collect payload, the only shape the server ever receives.
func collectPayloadFields(payload map[string]interface{}) (payer string, preApprovalExpiry uint64, salt string, err error) {
	switch {
	case authcapture.IsEip3009Payload(payload):
		p, err := authcapture.Eip3009CollectPayloadFromMap(payload)
		if err != nil {
			return "", 0, "", err
		}
		expiry, err := strconv.ParseUint(p.Authorization.ValidBefore, 10, 64)
		if err != nil {
			return "", 0, "", fmt.Errorf("invalid authorization.validBefore: %s", p.Authorization.ValidBefore)
		}
		return p.Authorization.From, expiry, p.Salt, nil
	case authcapture.IsPermit2Payload(payload):
		p, err := authcapture.Permit2CollectPayloadFromMap(payload)
		if err != nil {
			return "", 0, "", err
		}
		expiry, err := strconv.ParseUint(p.Permit2Authorization.Deadline, 10, 64)
		if err != nil {
			return "", 0, "", fmt.Errorf("invalid permit2Authorization.deadline: %s", p.Permit2Authorization.Deadline)
		}
		return p.Permit2Authorization.From, expiry, p.Salt, nil
	default:
		return "", 0, "", fmt.Errorf("payload is neither an EIP-3009 nor a Permit2 auth-capture collect payload")
	}
}

// requirementsFromView rebuilds concrete requirements from the version-agnostic hook view.
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
