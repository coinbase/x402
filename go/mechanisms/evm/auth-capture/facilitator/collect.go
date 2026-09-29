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

// collectPreconditions is the parsed, common-to-both-collector-types state that
// verifyCollect derives once and settleCollect reuses, avoiding a second parse/verify pass.
type collectPreconditions struct {
	deployment   authcapture.AuthCaptureDeployment
	paymentInfo  authcapture.PaymentInfoStruct
	payer        string
	collector    string
	sigData      *evm.ERC6492SignatureData
	rawSignature []byte
}

// verifyCollect validates a collect (authorize) payload — EIP-3009 or Permit2 — against
// requirements, following the spec's "Client payment payload" verification order. The
// terminal charge/authorization flow (ChargeCompletion fields present) is out of scope
// and rejected.
func (f *AuthCaptureEvmScheme) verifyCollect(
	ctx context.Context,
	payload types.PaymentPayload,
	requirements types.PaymentRequirements,
	simulate bool,
) (*x402.VerifyResponse, error) {
	pre, err := f.checkCollectPreconditions(ctx, payload, requirements)
	if err != nil {
		return nil, err
	}

	if simulate {
		if err := simulateAuthorize(ctx, f.signer, pre); err != nil {
			return nil, err
		}
	}

	return &x402.VerifyResponse{IsValid: true, Payer: pre.payer}, nil
}

// checkCollectPreconditions performs every validation step short of on-chain simulation,
// shared by verify and settle: scheme/network, extra/operator admission, collector/amount
// matching, deadline ordering, salt-binding, payer-agnostic nonce, and signature validity.
func (f *AuthCaptureEvmScheme) checkCollectPreconditions(
	ctx context.Context,
	payload types.PaymentPayload,
	requirements types.PaymentRequirements,
) (*collectPreconditions, error) {
	if payload.Accepted.Scheme != authcapture.SchemeAuthCapture {
		return nil, x402.NewVerifyError(ErrInvalidScheme, "", fmt.Sprintf("invalid scheme: %s", payload.Accepted.Scheme))
	}
	if payload.Accepted.Network != requirements.Network {
		return nil, x402.NewVerifyError(ErrNetworkMismatch, "", fmt.Sprintf("network mismatch: %s != %s", payload.Accepted.Network, requirements.Network))
	}

	extra, deployment, err := authcapture.ParseAuthCaptureExtra(requirements)
	if err != nil {
		return nil, x402.NewVerifyError(ErrExtra, "", err.Error())
	}
	if extra.OperatorType != "" && extra.OperatorType != "delegated" {
		return nil, x402.NewVerifyError(ErrUnsupportedOperatorType, "", fmt.Sprintf("unsupported operatorType: %s", extra.OperatorType))
	}
	if !f.controlsAddress(extra.CaptureAuthorizer) {
		return nil, x402.NewVerifyError(ErrOperatorNotAdmitted, "", fmt.Sprintf("captureAuthorizer %s is not controlled by this facilitator", extra.CaptureAuthorizer))
	}
	if authcapture.IsNonZeroAddress(extra.Policy) {
		return nil, x402.NewVerifyError(ErrPolicy, "", "policy operator type is not supported")
	}
	if extra.PaymentFlow != "" && extra.PaymentFlow != "escrow" {
		return nil, x402.NewVerifyError(ErrUnsupportedPaymentFlow, "", fmt.Sprintf("unsupported paymentFlow: %s", extra.PaymentFlow))
	}

	chainID, err := evm.GetEvmChainId(string(requirements.Network))
	if err != nil {
		return nil, x402.NewVerifyError(ErrNetworkMismatch, "", err.Error())
	}

	isPermit2 := authcapture.IsPermit2Payload(payload.Payload)

	var (
		payer, saltNonce, salt, signatureHex, nonceHex string
		preApprovalExpiry                              uint64
		expectedCollector                              string
		hash                                           [32]byte
	)

	if isPermit2 {
		p, err := authcapture.Permit2CollectPayloadFromMap(payload.Payload)
		if err != nil {
			return nil, x402.NewVerifyError(ErrPayloadFormat, "", err.Error())
		}
		if p.Charge != nil {
			return nil, x402.NewVerifyError(ErrUnsupportedPaymentFlow, p.Permit2Authorization.From, "terminal charge completion is not supported")
		}
		payer = p.Permit2Authorization.From
		saltNonce = p.SaltNonce
		salt = p.Salt
		signatureHex = p.Signature
		expectedCollector = deployment.Permit2Collector

		if !strings.EqualFold(p.Permit2Authorization.Spender, expectedCollector) {
			return nil, x402.NewVerifyError(ErrTokenCollectorMismatch, payer, fmt.Sprintf("permit2 spender mismatch: %s != %s", p.Permit2Authorization.Spender, expectedCollector))
		}
		if !strings.EqualFold(p.Permit2Authorization.Permitted.Token, requirements.Asset) {
			return nil, x402.NewVerifyError(ErrTokenMismatch, payer, "permitted token mismatch")
		}
		if p.Permit2Authorization.Permitted.Amount != requirements.Amount {
			return nil, x402.NewVerifyError(ErrAmountMismatch, payer, fmt.Sprintf("permitted amount mismatch: %s != %s", p.Permit2Authorization.Permitted.Amount, requirements.Amount))
		}
		deadline, ok := new(big.Int).SetString(p.Permit2Authorization.Deadline, 10)
		if !ok {
			return nil, x402.NewVerifyError(ErrPayloadFormat, payer, "invalid deadline")
		}
		preApprovalExpiry = deadline.Uint64()

		now := time.Now().Unix()
		if deadline.Cmp(big.NewInt(now)) <= 0 {
			return nil, x402.NewVerifyError(ErrAuthorizationExpired, payer, "permit2 deadline already expired")
		}

		msgHash, err := authcapture.HashPermit2Authorization(p.Permit2Authorization, chainID)
		if err != nil {
			return nil, x402.NewVerifyError(ErrPayloadFormat, payer, err.Error())
		}
		hash = msgHash

		nonceBig, ok := new(big.Int).SetString(p.Permit2Authorization.Nonce, 10)
		if !ok {
			return nil, x402.NewVerifyError(ErrPayloadFormat, payer, "invalid nonce")
		}
		nonceHex = evm.BytesToHex(paddedBigIntBytes(nonceBig))
	} else {
		p, err := authcapture.Eip3009CollectPayloadFromMap(payload.Payload)
		if err != nil {
			return nil, x402.NewVerifyError(ErrPayloadFormat, "", err.Error())
		}
		if p.Charge != nil {
			return nil, x402.NewVerifyError(ErrUnsupportedPaymentFlow, p.Authorization.From, "terminal charge completion is not supported")
		}
		payer = p.Authorization.From
		saltNonce = p.SaltNonce
		salt = p.Salt
		signatureHex = p.Signature
		expectedCollector = deployment.EIP3009Collector

		if !strings.EqualFold(p.Authorization.To, expectedCollector) {
			return nil, x402.NewVerifyError(ErrTokenCollectorMismatch, payer, fmt.Sprintf("authorization.to mismatch: %s != %s", p.Authorization.To, expectedCollector))
		}
		if p.Authorization.Value != requirements.Amount {
			return nil, x402.NewVerifyError(ErrAmountMismatch, payer, fmt.Sprintf("authorization value mismatch: %s != %s", p.Authorization.Value, requirements.Amount))
		}
		validBefore, ok := new(big.Int).SetString(p.Authorization.ValidBefore, 10)
		if !ok {
			return nil, x402.NewVerifyError(ErrPayloadFormat, payer, "invalid validBefore")
		}
		validAfter, ok := new(big.Int).SetString(p.Authorization.ValidAfter, 10)
		if !ok {
			return nil, x402.NewVerifyError(ErrPayloadFormat, payer, "invalid validAfter")
		}
		preApprovalExpiry = validBefore.Uint64()

		now := time.Now().Unix()
		if validBefore.Cmp(big.NewInt(now)) <= 0 {
			return nil, x402.NewVerifyError(ErrAuthorizationExpired, payer, "authorization already expired")
		}
		if validAfter.Cmp(big.NewInt(now)) > 0 {
			return nil, x402.NewVerifyError(ErrAuthorizationNotYetValid, payer, "authorization not yet valid")
		}

		msgHash, err := authcapture.HashERC3009Authorization(p.Authorization, extra, requirements.Asset, chainID)
		if err != nil {
			return nil, x402.NewVerifyError(ErrPayloadFormat, payer, err.Error())
		}
		hash = msgHash
		nonceHex = p.Authorization.Nonce
	}

	bindOn := authcapture.IsSaltBindingOn(extra)
	if bindOn {
		if saltNonce == "" {
			return nil, x402.NewVerifyError(ErrSaltBindingMismatch, payer, "saltNonce is required when salt binding is on")
		}
		expectedSalt, err := authcapture.DeriveBoundSalt(
			authcapture.ExtraAddress(extra.ReceiverAuthorizer),
			authcapture.ExtraAddress(extra.Policy),
			saltNonce,
		)
		if err != nil {
			return nil, x402.NewVerifyError(ErrSaltBindingMismatch, payer, err.Error())
		}
		if !strings.EqualFold(expectedSalt, salt) {
			return nil, x402.NewVerifyError(ErrSaltBindingMismatch, payer, "salt does not match derived bound salt")
		}
	}

	if extra.CaptureDeadline > extra.RefundDeadline || preApprovalExpiry > extra.CaptureDeadline {
		return nil, x402.NewVerifyError(ErrDeadlineOrdering, payer, "preApprovalExpiry <= authorizationExpiry <= refundExpiry violated")
	}

	paymentInfo := authcapture.ReconstructPaymentInfo(payer, preApprovalExpiry, salt, requirements, extra, "")

	expectedNonce, err := authcapture.ComputePayerAgnosticPaymentInfoHash(chainID, paymentInfo, deployment.Escrow)
	if err != nil {
		return nil, x402.NewVerifyError(ErrPayloadFormat, payer, err.Error())
	}
	if !strings.EqualFold(expectedNonce, nonceHex) {
		return nil, x402.NewVerifyError(ErrNonceMismatch, payer, fmt.Sprintf("nonce mismatch: %s != %s", nonceHex, expectedNonce))
	}

	signatureBytes, err := evm.HexToBytes(signatureHex)
	if err != nil {
		return nil, x402.NewVerifyError(ErrSignature, payer, err.Error())
	}

	valid, sigData, err := evm.VerifyUniversalSignature(ctx, f.signer, payer, hash, signatureBytes, true)
	if err != nil {
		return nil, x402.NewVerifyError(ErrSignature, payer, err.Error())
	}
	if sigData == nil {
		sigData = &evm.ERC6492SignatureData{InnerSignature: signatureBytes}
	}
	if !valid {
		if evm.HasEIP6492Deployment(sigData) {
			if !evm.IsFactoryAllowed(sigData.Factory, f.config.EIP6492AllowedFactories) {
				return nil, x402.NewVerifyError(ErrErc6492FactoryNotAllowed, payer, "factory not in EIP6492AllowedFactories allowlist")
			}
			// Counterfactual smart wallet: settle deploys via the factory, gated by the
			// allowlist above. Simulation (below, when requested) provides the actual
			// pre-deploy validity check.
		} else if sigData.CodeDeployed || len(sigData.InnerSignature) != 65 {
			return nil, x402.NewVerifyError(ErrUndeployedSmartWallet, payer, "smart wallet signature could not be verified")
		} else {
			return nil, x402.NewVerifyError(ErrSignature, payer, "invalid signature")
		}
	}

	return &collectPreconditions{
		deployment:   deployment,
		paymentInfo:  paymentInfo,
		payer:        payer,
		collector:    expectedCollector,
		sigData:      sigData,
		rawSignature: sigData.InnerSignature,
	}, nil
}

// simulateAuthorize runs AuthCaptureEscrow.authorize via eth_call, transparently handling
// counterfactual (undeployed) smart-wallet payers via Multicall3.
func simulateAuthorize(ctx context.Context, signer evm.FacilitatorEvmSigner, pre *collectPreconditions) error {
	amountBig, ok := new(big.Int).SetString(pre.paymentInfo.MaxAmount, 10)
	if !ok {
		return x402.NewVerifyError(ErrPayloadFormat, pre.payer, "invalid amount")
	}
	abiTuple, err := pre.paymentInfo.ToAbiTuple()
	if err != nil {
		return x402.NewVerifyError(ErrPayloadFormat, pre.payer, err.Error())
	}
	ok, err = simulateEscrowCall(ctx, signer, &pre.deployment, pre.sigData, "authorize", abiTuple, amountBig, evm.NormalizeAddress(pre.collector), pre.rawSignature)
	if err != nil {
		return x402.NewVerifyError(ErrSimulationFailed, pre.payer, err.Error())
	}
	if !ok {
		return x402.NewVerifyError(ErrSimulationFailed, pre.payer, "authorize simulation reverted")
	}
	return nil
}

// settleCollect settles a collect (authorize) payload on-chain.
func (f *AuthCaptureEvmScheme) settleCollect(
	ctx context.Context,
	payload types.PaymentPayload,
	requirements types.PaymentRequirements,
	fctx *x402.FacilitatorContext,
) (*x402.SettleResponse, error) {
	network := x402.Network(payload.Accepted.Network)

	signatureHex := collectSignature(payload.Payload)
	if signatureHex != "" {
		if txHash, ok, _ := f.pendingStore.Get(ctx, signatureHex); ok {
			_ = f.pendingStore.Delete(ctx, signatureHex)
			return f.awaitCollectSettlement(ctx, signatureHex, network, collectPayer(payload.Payload), txHash)
		}
	}

	pre, err := f.checkCollectPreconditions(ctx, payload, requirements)
	if err != nil {
		ve := &x402.VerifyError{}
		if errors.As(err, &ve) {
			return nil, x402.NewSettleError(ve.InvalidReason, ve.Payer, network, "", ve.InvalidMessage)
		}
		return nil, x402.NewSettleError(ErrVerificationFailed, "", network, "", err.Error())
	}

	if f.config.SimulateInSettle {
		if err := simulateAuthorize(ctx, f.signer, pre); err != nil {
			ve := &x402.VerifyError{}
			if errors.As(err, &ve) {
				return nil, x402.NewSettleError(ve.InvalidReason, ve.Payer, network, "", ve.InvalidMessage)
			}
			return nil, x402.NewSettleError(ErrVerificationFailed, pre.payer, network, "", err.Error())
		}
	}

	if evm.HasEIP6492Deployment(pre.sigData) && !pre.sigData.CodeDeployed {
		if err := evm.SendFactoryDeployTransaction(ctx, f.signer, pre.sigData); err != nil {
			return nil, x402.NewSettleError(ErrSmartWalletDeploymentFailed, pre.payer, network, "", err.Error())
		}
	}

	amountBig, ok := new(big.Int).SetString(pre.paymentInfo.MaxAmount, 10)
	if !ok {
		return nil, x402.NewSettleError(ErrPayloadFormat, pre.payer, network, "", "invalid amount")
	}
	abiTuple, err := pre.paymentInfo.ToAbiTuple()
	if err != nil {
		return nil, x402.NewSettleError(ErrPayloadFormat, pre.payer, network, "", err.Error())
	}

	dataSuffix, err := evm.ResolveDataSuffix(fctx, evm.DataSuffixContext{Payload: payload, Requirements: requirements})
	if err != nil {
		return nil, x402.NewSettleError(ErrPayloadFormat, pre.payer, network, "", err.Error())
	}

	txHash, err := f.signer.WriteContract(
		ctx,
		pre.deployment.Escrow,
		authcapture.EscrowABIForDeployment(&pre.deployment),
		"authorize",
		dataSuffix,
		abiTuple,
		amountBig,
		evm.NormalizeAddress(pre.collector),
		pre.rawSignature,
	)
	if err != nil {
		return nil, x402.NewSettleError(parseAuthCaptureRevert(err), pre.payer, network, "", err.Error())
	}

	return f.awaitCollectSettlement(ctx, signatureHex, network, pre.payer, txHash)
}

func (f *AuthCaptureEvmScheme) awaitCollectSettlement(
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

func collectSignature(payload map[string]interface{}) string {
	if sig, ok := payload["signature"].(string); ok {
		return sig
	}
	return ""
}

// collectPayer extracts the payer address directly from the wire payload, for the
// pending-settlement reconciliation path where re-verifying is unnecessary (the original
// attempt already verified this exact payload before broadcasting).
func collectPayer(payload map[string]interface{}) string {
	if auth, ok := payload["authorization"].(map[string]interface{}); ok {
		if from, ok := auth["from"].(string); ok {
			return from
		}
	}
	if auth, ok := payload["permit2Authorization"].(map[string]interface{}); ok {
		if from, ok := auth["from"].(string); ok {
			return from
		}
	}
	return ""
}

func paddedBigIntBytes(value *big.Int) []byte {
	b := value.Bytes()
	if len(b) >= 32 {
		return b[len(b)-32:]
	}
	out := make([]byte, 32)
	copy(out[32-len(b):], b)
	return out
}
