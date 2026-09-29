package client

import (
	"context"
	"fmt"
	"math/big"
	"time"

	x402 "github.com/x402-foundation/x402/go/v2"
	"github.com/x402-foundation/x402/go/v2/mechanisms/evm"
	authcapture "github.com/x402-foundation/x402/go/v2/mechanisms/evm/auth-capture"
	"github.com/x402-foundation/x402/go/v2/types"
)

// AuthCaptureEvmScheme implements SchemeNetworkClient for auth-capture EVM payments.
type AuthCaptureEvmScheme struct {
	signer evm.ClientEvmSigner
	now    func() time.Time
}

// NewAuthCaptureEvmScheme creates a client-side auth-capture scheme bound to signer.
func NewAuthCaptureEvmScheme(signer evm.ClientEvmSigner) *AuthCaptureEvmScheme {
	return &AuthCaptureEvmScheme{
		signer: signer,
		now:    time.Now,
	}
}

// Scheme returns the scheme identifier.
func (c *AuthCaptureEvmScheme) Scheme() string {
	return authcapture.SchemeAuthCapture
}

func (c *AuthCaptureEvmScheme) FindDefaultAsset(asset string, network x402.Network) *x402.DefaultAsset {
	info := evm.FindDefaultAsset(asset, string(network))
	if info == nil {
		return nil
	}
	return &x402.DefaultAsset{Asset: info.Asset, Decimals: info.Decimals, Symbol: info.Symbol}
}

// CreatePaymentPayload builds and signs an auth-capture collect payload for the given requirements.
func (c *AuthCaptureEvmScheme) CreatePaymentPayload(
	ctx context.Context,
	requirements types.PaymentRequirements,
	_ x402.PaymentPayloadContext,
) (types.PaymentPayload, error) {
	extra, deployment, err := authcapture.ParseAuthCaptureExtra(requirements)
	if err != nil {
		return types.PaymentPayload{}, err
	}

	if requirements.MaxTimeoutSeconds <= 0 {
		return types.PaymentPayload{}, fmt.Errorf("'maxTimeoutSeconds' is required in PaymentRequirements (used to derive preApprovalExpiry)")
	}

	chainID, err := evm.GetEvmChainId(string(requirements.Network))
	if err != nil {
		return types.PaymentPayload{}, err
	}

	maxAmount := requirements.Amount
	nowSeconds := c.now().Unix()
	preApprovalExpiry := uint64(nowSeconds + int64(requirements.MaxTimeoutSeconds))

	assetTransferMethod := extra.AssetTransferMethod
	if assetTransferMethod == "" {
		assetTransferMethod = string(evm.AssetTransferMethodEIP3009)
	}

	bindOn := authcapture.IsSaltBindingOn(extra)
	saltNonce, err := authcapture.GenerateSalt()
	if err != nil {
		return types.PaymentPayload{}, err
	}

	var salt string
	if bindOn {
		salt, err = authcapture.DeriveBoundSalt(
			authcapture.ExtraAddress(extra.ReceiverAuthorizer),
			authcapture.ExtraAddress(extra.Policy),
			saltNonce,
		)
		if err != nil {
			return types.PaymentPayload{}, err
		}
	} else {
		salt = saltNonce
	}

	paymentInfo := authcapture.PaymentInfoStruct{
		Operator:            extra.CaptureAuthorizer,
		Payer:               c.signer.Address(),
		Receiver:            requirements.PayTo,
		Token:               requirements.Asset,
		MaxAmount:           maxAmount,
		PreApprovalExpiry:   preApprovalExpiry,
		AuthorizationExpiry: extra.CaptureDeadline,
		RefundExpiry:        extra.RefundDeadline,
		MinFeeBps:           extra.MinFeeBps,
		MaxFeeBps:           extra.MaxFeeBps,
		FeeReceiver:         extra.FeeRecipient,
		Salt:                salt,
	}

	nonce, err := authcapture.ComputePayerAgnosticPaymentInfoHash(chainID, paymentInfo, deployment.Escrow)
	if err != nil {
		return types.PaymentPayload{}, err
	}

	if assetTransferMethod == string(evm.AssetTransferMethodPermit2) {
		return c.createPermit2Payload(ctx, requirements, bindOn, salt, saltNonce, nonce, preApprovalExpiry, chainID, deployment)
	}

	return c.createEIP3009Payload(ctx, requirements, extra, bindOn, salt, saltNonce, nonce, preApprovalExpiry, chainID, deployment)
}

func (c *AuthCaptureEvmScheme) createEIP3009Payload(
	ctx context.Context,
	requirements types.PaymentRequirements,
	extra authcapture.AuthCaptureExtra,
	bindOn bool,
	salt string,
	saltNonce string,
	nonce string,
	preApprovalExpiry uint64,
	chainID *big.Int,
	deployment authcapture.AuthCaptureDeployment,
) (types.PaymentPayload, error) {
	authorization := authcapture.Eip3009Authorization{
		From:        c.signer.Address(),
		To:          deployment.EIP3009Collector,
		Value:       requirements.Amount,
		ValidAfter:  "0",
		ValidBefore: fmt.Sprintf("%d", preApprovalExpiry),
		Nonce:       nonce,
	}

	signature, err := authcapture.SignERC3009(ctx, c.signer, authorization, extra, requirements.Asset, chainID)
	if err != nil {
		return types.PaymentPayload{}, fmt.Errorf("failed to sign ERC-3009 authorization: %w", err)
	}

	payload := map[string]interface{}{
		"authorization": map[string]interface{}{
			"from":        authorization.From,
			"to":          authorization.To,
			"value":       authorization.Value,
			"validAfter":  authorization.ValidAfter,
			"validBefore": authorization.ValidBefore,
			"nonce":       authorization.Nonce,
		},
		"signature": evm.BytesToHex(signature),
		"salt":      salt,
	}
	if bindOn {
		payload["saltNonce"] = saltNonce
	}

	return types.PaymentPayload{
		X402Version: 2,
		Payload:     payload,
	}, nil
}

func (c *AuthCaptureEvmScheme) createPermit2Payload(
	ctx context.Context,
	requirements types.PaymentRequirements,
	bindOn bool,
	salt string,
	saltNonce string,
	nonce string,
	preApprovalExpiry uint64,
	chainID *big.Int,
	deployment authcapture.AuthCaptureDeployment,
) (types.PaymentPayload, error) {
	permitNonce, err := authcapture.NonceHexToDecimalString(nonce)
	if err != nil {
		return types.PaymentPayload{}, err
	}

	permit := authcapture.Permit2Authorization{
		From: c.signer.Address(),
		Permitted: authcapture.Permit2TokenPermissions{
			Token:  requirements.Asset,
			Amount: requirements.Amount,
		},
		Spender:  deployment.Permit2Collector,
		Nonce:    permitNonce,
		Deadline: fmt.Sprintf("%d", preApprovalExpiry),
	}

	signature, err := authcapture.SignPermit2(ctx, c.signer, permit, chainID)
	if err != nil {
		return types.PaymentPayload{}, fmt.Errorf("failed to sign Permit2 authorization: %w", err)
	}

	payload := map[string]interface{}{
		"permit2Authorization": map[string]interface{}{
			"from": permit.From,
			"permitted": map[string]interface{}{
				"token":  permit.Permitted.Token,
				"amount": permit.Permitted.Amount,
			},
			"spender":  permit.Spender,
			"nonce":    permit.Nonce,
			"deadline": permit.Deadline,
		},
		"signature": evm.BytesToHex(signature),
		"salt":      salt,
	}
	if bindOn {
		payload["saltNonce"] = saltNonce
	}

	return types.PaymentPayload{
		X402Version: 2,
		Payload:     payload,
	}, nil
}

