package facilitator

import (
	"context"
	"strings"

	gethtypes "github.com/ethereum/go-ethereum/core/types"
	x402 "github.com/x402-foundation/x402/go/v2"
	"github.com/x402-foundation/x402/go/v2/mechanisms/evm"
	authcapture "github.com/x402-foundation/x402/go/v2/mechanisms/evm/auth-capture"
	"github.com/x402-foundation/x402/go/v2/types"
)

// OperatorAddressWildcard admits every contract operator of an entry's type.
const OperatorAddressWildcard = "*"

// OperatorAllowlistEntry admits a contract operator, or every one with OperatorAddressWildcard,
// under the given operator type. Only "custom" is relayed.
type OperatorAllowlistEntry struct {
	Address      string `json:"address"`
	OperatorType string `json:"operatorType"`
}

// AuthCaptureEvmSchemeConfig configures the facilitator for the delegated operator type
// (authorize, charge, capture, void, refund) and, with an allowlist, custom operators.
type AuthCaptureEvmSchemeConfig struct {
	// CaptureAuthorizer is the operator address; it MUST be one of signer.GetAddresses().
	// Leave it empty for a relay-only facilitator that serves only Operators.
	CaptureAuthorizer string
	// FeeRecipient, MinFeeBps and MaxFeeBps are the fee terms advertised in /supported; omit for no fee.
	FeeRecipient string
	MinFeeBps    uint16
	MaxFeeBps    uint16
	// EIP6492AllowedFactories allowlists factories called to deploy counterfactual wallets; empty denies all.
	EIP6492AllowedFactories []string
	// SimulateInSettle reruns collect/lifecycle simulation during settle. Verify always simulates,
	// and settle always does for a charge and for a custom operator.
	SimulateInSettle bool
	// Operators is the allowlist of custom contract operators the facilitator relays collects
	// for. Empty admits none. Custom operators also need a signer implementing CallSimulator
	// and GasLimitWriter.
	Operators []OperatorAllowlistEntry
	// CustomOperatorGasLimit caps simulated and submitted calls into a custom operator; zero
	// selects authcapture.DefaultCustomOperatorGasLimit.
	CustomOperatorGasLimit uint64
	// RefundFunding permits relaying refunds for delegated operators. The refund collector pulls
	// the refunded tokens from the captureAuthorizer, so enable it only with an out-of-band
	// funding agreement that keeps every advertised submitter funded and approved.
	RefundFunding bool
}

// SenderReader is an optional capability of a FacilitatorEvmSigner: ReadContract with an
// explicit eth_call sender. The scheme uses it to simulate every escrow call as the operator,
// because the escrow gates authorize, capture and void on msg.sender. A signer without it
// must make ReadContract itself call from the operator, which only works when the signer
// holds a single address.
type SenderReader interface {
	ReadContractFrom(ctx context.Context, from, address string, abi []byte, functionName string, args ...interface{}) (interface{}, error)
}

// SimulatedCall is one call of a CallSimulator batch. A zero Gas leaves the limit unset.
type SimulatedCall struct {
	To   string
	Data []byte
	Gas  uint64
}

// SimulatedCallResult is the outcome of one SimulatedCall, with the logs of nested calls.
type SimulatedCallResult struct {
	Success    bool
	ReturnData []byte
	GasUsed    uint64
	Logs       []*gethtypes.Log
}

// CallSimulator is an optional capability of a FacilitatorEvmSigner: run an ordered batch of calls
// against one simulated state (eth_simulateV1), so each call sees the effects of the earlier ones.
// Custom operators need it to check the outcome of a relayed call before it is broadcast.
type CallSimulator interface {
	SimulateCalls(ctx context.Context, from string, calls []SimulatedCall) ([]SimulatedCallResult, error)
}

// GasLimitWriter is an optional capability of a FacilitatorEvmSigner: WriteContract with an
// explicit gas limit. Custom operators need it so a relayed call cannot drain the gas budget.
type GasLimitWriter interface {
	WriteContractWithGas(ctx context.Context, address string, abi []byte, functionName string, dataSuffix []byte, gas uint64, args ...interface{}) (string, error)
}

// AuthCaptureEvmScheme implements SchemeNetworkFacilitator for the auth-capture EVM scheme.
// Simulations call as the operator through SenderReader when the signer implements it, else
// the signer's ReadContract must eth_call from the operator address.
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

// supportsCustomOperators reports whether the signer has what relaying into a custom operator needs.
func (f *AuthCaptureEvmScheme) supportsCustomOperators() bool {
	_, simulates := f.signer.(CallSimulator)
	_, capsGas := f.signer.(GasLimitWriter)
	return len(f.config.Operators) > 0 && simulates && capsGas
}

// operatorAdmitted reports whether the allowlist admits address as a custom operator.
func (f *AuthCaptureEvmScheme) operatorAdmitted(address string) bool {
	if !f.supportsCustomOperators() {
		return false
	}
	for _, entry := range f.config.Operators {
		if entry.OperatorType != authcapture.OperatorTypeCustom {
			continue
		}
		if entry.Address == OperatorAddressWildcard || strings.EqualFold(entry.Address, address) {
			return true
		}
	}
	return false
}

// GetExtra returns the facilitator's advertised auth-capture terms for /supported.
func (f *AuthCaptureEvmScheme) GetExtra(_ x402.Network) map[string]interface{} {
	extra := map[string]interface{}{}
	if f.config.CaptureAuthorizer != "" {
		extra["captureAuthorizer"] = f.config.CaptureAuthorizer
	}
	if f.config.FeeRecipient != "" {
		extra["feeRecipient"] = f.config.FeeRecipient
		extra["minFeeBps"] = f.config.MinFeeBps
		extra["maxFeeBps"] = f.config.MaxFeeBps
	}
	if f.supportsCustomOperators() {
		extra["operators"] = f.config.Operators
	}
	if len(extra) == 0 {
		return nil
	}
	return extra
}

// GetSigners returns signer addresses used by this facilitator.
func (f *AuthCaptureEvmScheme) GetSigners(_ x402.Network) []string {
	return f.signer.GetAddresses()
}

// Verify routes to collect or lifecycle (capture, void, refund) verification by payload shape.
func (f *AuthCaptureEvmScheme) Verify(
	ctx context.Context,
	payload types.PaymentPayload,
	requirements types.PaymentRequirements,
	fctx *x402.FacilitatorContext,
) (*x402.VerifyResponse, error) {
	switch {
	case authcapture.IsEip3009Payload(payload.Payload), authcapture.IsPermit2Payload(payload.Payload):
		return f.verifyCollect(ctx, payload, requirements)
	case authcapture.IsCapturePayload(payload.Payload):
		return f.verifyCapture(ctx, payload, requirements)
	case authcapture.IsVoidPayload(payload.Payload):
		return f.verifyVoid(ctx, payload, requirements)
	case authcapture.IsRefundPayload(payload.Payload):
		return f.verifyRefund(ctx, payload, requirements)
	default:
		return nil, x402.NewVerifyError(unknownShapeReason(payload.Payload), "", "payload matches no known auth-capture shape")
	}
}

// Settle routes to collect or lifecycle (capture, void, refund) settlement by payload shape.
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
	case authcapture.IsRefundPayload(payload.Payload):
		return f.settleRefund(ctx, payload, requirements, fctx)
	default:
		network := x402.Network(payload.Accepted.Network)
		return nil, x402.NewSettleError(unknownShapeReason(payload.Payload), "", network, "", "payload matches no known auth-capture shape")
	}
}

// unknownShapeReason is payload_type for a payload naming a lifecycle type we do not know, and
// payload_format for a malformed payload of a known shape.
func unknownShapeReason(payload map[string]interface{}) string {
	switch payload["type"] {
	case nil, opCapture, opVoid, opRefund:
		return ErrPayloadFormat
	}
	return ErrPayloadType
}
