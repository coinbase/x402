package facilitator

import (
	"context"
	"strings"

	x402 "github.com/x402-foundation/x402/go/v2"
	"github.com/x402-foundation/x402/go/v2/mechanisms/evm"
	authcapture "github.com/x402-foundation/x402/go/v2/mechanisms/evm/auth-capture"
	"github.com/x402-foundation/x402/go/v2/types"
)

// AuthCaptureEvmSchemeConfig holds configuration for the AuthCaptureEvmScheme facilitator.
//
// This implementation only supports operatorType "delegated" (the facilitator's own signer
// is PaymentInfo.operator) with the escrow payment flow (authorize/capture/void). "custom"/
// "policy" operator types, the "authorization" (terminal charge) flow, and refund are out of
// scope.
type AuthCaptureEvmSchemeConfig struct {
	// CaptureAuthorizer is the address this facilitator commits to submitting delegated
	// authorize/capture/void calls from. Required, and MUST be one of signer.GetAddresses().
	CaptureAuthorizer string
	// FeeRecipient, MinFeeBps, MaxFeeBps are the facilitator's advertised fee terms,
	// published verbatim in the /supported response extra. Optional; omitted means no fee.
	FeeRecipient string
	MinFeeBps    uint16
	MaxFeeBps    uint16
	// EIP6492AllowedFactories is the allowlist of factory contract addresses (hex strings,
	// case-insensitive) the facilitator will call when deploying an undeployed smart wallet
	// via ERC-6492. An empty list (the default) denies all factory deployment calls.
	EIP6492AllowedFactories []string
	// SimulateInSettle reruns collect/lifecycle simulation during settle. Verify always simulates.
	SimulateInSettle bool
}

// AuthCaptureEvmScheme implements SchemeNetworkFacilitator for the auth-capture EVM scheme.
type AuthCaptureEvmScheme struct {
	signer       evm.FacilitatorEvmSigner
	config       AuthCaptureEvmSchemeConfig
	pendingStore x402.PendingSettlementStore
}

// NewAuthCaptureEvmScheme creates a new AuthCaptureEvmScheme.
func NewAuthCaptureEvmScheme(signer evm.FacilitatorEvmSigner, config AuthCaptureEvmSchemeConfig) *AuthCaptureEvmScheme {
	return &AuthCaptureEvmScheme{
		signer:       signer,
		config:       config,
		pendingStore: x402.NewInMemoryPendingSettlementStore(),
	}
}

// SetPendingSettlementStore overrides the default in-memory PendingSettlementStore.
func (f *AuthCaptureEvmScheme) SetPendingSettlementStore(store x402.PendingSettlementStore) {
	if store != nil {
		f.pendingStore = store
	}
}

// Scheme returns the scheme identifier.
func (f *AuthCaptureEvmScheme) Scheme() string {
	return authcapture.SchemeAuthCapture
}

// CaipFamily returns the CAIP family pattern this facilitator supports.
func (f *AuthCaptureEvmScheme) CaipFamily() string {
	return "eip155:*"
}

// GetExtra returns the facilitator's advertised auth-capture terms for /supported.
func (f *AuthCaptureEvmScheme) GetExtra(_ x402.Network) map[string]interface{} {
	if f.config.CaptureAuthorizer == "" {
		return nil
	}
	extra := map[string]interface{}{
		"captureAuthorizer": f.config.CaptureAuthorizer,
	}
	if f.config.FeeRecipient != "" {
		extra["feeRecipient"] = f.config.FeeRecipient
		extra["minFeeBps"] = f.config.MinFeeBps
		extra["maxFeeBps"] = f.config.MaxFeeBps
	}
	return extra
}

// GetSigners returns signer addresses used by this facilitator.
func (f *AuthCaptureEvmScheme) GetSigners(_ x402.Network) []string {
	return f.signer.GetAddresses()
}

// controlsAddress reports whether address is one this facilitator submits transactions from.
func (f *AuthCaptureEvmScheme) controlsAddress(address string) bool {
	for _, controlled := range f.signer.GetAddresses() {
		if strings.EqualFold(controlled, address) {
			return true
		}
	}
	return false
}

// Verify verifies a V2 auth-capture payment payload against requirements.
// Routes to collect (authorize) or lifecycle (capture/void) verification based on payload shape.
func (f *AuthCaptureEvmScheme) Verify(
	ctx context.Context,
	payload types.PaymentPayload,
	requirements types.PaymentRequirements,
	fctx *x402.FacilitatorContext,
) (*x402.VerifyResponse, error) {
	switch {
	case authcapture.IsEip3009Payload(payload.Payload), authcapture.IsPermit2Payload(payload.Payload):
		return f.verifyCollect(ctx, payload, requirements, true)
	case authcapture.IsCapturePayload(payload.Payload):
		return f.verifyCapture(ctx, payload, requirements)
	case authcapture.IsVoidPayload(payload.Payload):
		return f.verifyVoid(ctx, payload, requirements)
	default:
		return nil, x402.NewVerifyError(ErrPayloadFormat, "", "payload matches no known auth-capture shape")
	}
}

// Settle settles a V2 auth-capture payment on-chain.
// Routes to collect (authorize) or lifecycle (capture/void) settlement based on payload shape.
func (f *AuthCaptureEvmScheme) Settle(
	ctx context.Context,
	payload types.PaymentPayload,
	requirements types.PaymentRequirements,
	fctx *x402.FacilitatorContext,
) (*x402.SettleResponse, error) {
	switch {
	case authcapture.IsEip3009Payload(payload.Payload), authcapture.IsPermit2Payload(payload.Payload):
		return f.settleCollect(ctx, payload, requirements, fctx)
	case authcapture.IsCapturePayload(payload.Payload):
		return f.settleCapture(ctx, payload, requirements, fctx)
	case authcapture.IsVoidPayload(payload.Payload):
		return f.settleVoid(ctx, payload, requirements, fctx)
	default:
		network := x402.Network(payload.Accepted.Network)
		return nil, x402.NewSettleError(ErrPayloadFormat, "", network, "", "payload matches no known auth-capture shape")
	}
}
