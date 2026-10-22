package facilitator

import (
	"context"
	"fmt"
	"math/rand"

	x402 "github.com/x402-foundation/x402/go/v2"
	"github.com/x402-foundation/x402/go/v2/mechanisms/evm"
	"github.com/x402-foundation/x402/go/v2/types"
)

type UptoEvmSchemeConfig struct {
	// Simulate Permit2 settlement during settle. ERC-3009 always simulates the actual amount.
	SimulateInSettle bool
}

// UptoEvmScheme implements the SchemeNetworkFacilitator interface for EVM upto payments (V2).
type UptoEvmScheme struct {
	signer       evm.FacilitatorEvmSigner
	config       UptoEvmSchemeConfig
	pendingStore x402.PendingSettlementStore
}

func NewUptoEvmScheme(signer evm.FacilitatorEvmSigner, config *UptoEvmSchemeConfig) *UptoEvmScheme {
	cfg := UptoEvmSchemeConfig{}
	if config != nil {
		cfg = *config
	}
	return &UptoEvmScheme{
		signer:       signer,
		config:       cfg,
		pendingStore: x402.NewInMemoryPendingSettlementStore(),
	}
}

// SetPendingSettlementStore overrides the default in-memory
// PendingSettlementStore. See ExactEvmScheme.SetPendingSettlementStore for
// rationale. A nil store is a no-op.
func (f *UptoEvmScheme) SetPendingSettlementStore(store x402.PendingSettlementStore) {
	if store != nil {
		f.pendingStore = store
	}
}

func (f *UptoEvmScheme) Scheme() string {
	return evm.SchemeUpto
}

// CaipFamily returns the CAIP family pattern this facilitator supports
func (f *UptoEvmScheme) CaipFamily() string {
	return "eip155:*"
}

// GetExtra returns mechanism-specific extra data for the supported kinds endpoint.
// For upto, returns one selected signer under both method-specific keys.
func (f *UptoEvmScheme) GetExtra(_ x402.Network) map[string]interface{} {
	addresses := f.signer.GetAddresses()
	if len(addresses) == 0 {
		return nil
	}
	address := addresses[rand.Intn(len(addresses))]
	return map[string]interface{}{
		"facilitatorAddress": address,
		"settlerAddress":     address,
	}
}

// GetSigners returns signer addresses used by this facilitator.
func (f *UptoEvmScheme) GetSigners(_ x402.Network) []string {
	return f.signer.GetAddresses()
}

// Verify verifies a V2 upto payment payload against requirements.
func (f *UptoEvmScheme) Verify(
	ctx context.Context,
	payload types.PaymentPayload,
	requirements types.PaymentRequirements,
	fctx *x402.FacilitatorContext,
) (*x402.VerifyResponse, error) {
	if evm.IsUptoEIP3009Payload(payload.Payload) {
		eip3009Payload, err := evm.UptoEIP3009PayloadFromMap(payload.Payload)
		if err != nil {
			return nil, x402.NewVerifyError(ErrUptoInvalidPayload, "", fmt.Sprintf("failed to parse upto EIP-3009 payload: %s", err.Error()))
		}
		return VerifyUptoEIP3009(ctx, f.signer, payload, requirements, eip3009Payload, true)
	}
	if !evm.IsUptoPermit2Payload(payload.Payload) {
		return nil, x402.NewVerifyError(ErrUptoInvalidPayload, "", "unsupported payload type")
	}

	permit2Payload, err := evm.UptoPermit2PayloadFromMap(payload.Payload)
	if err != nil {
		return nil, x402.NewVerifyError(ErrUptoInvalidPayload, "", fmt.Sprintf("failed to parse upto Permit2 payload: %s", err.Error()))
	}

	return VerifyUptoPermit2(ctx, f.signer, payload, requirements, permit2Payload, fctx, true)
}

// Settle settles a V2 upto payment on-chain.
func (f *UptoEvmScheme) Settle(
	ctx context.Context,
	payload types.PaymentPayload,
	requirements types.PaymentRequirements,
	fctx *x402.FacilitatorContext,
) (*x402.SettleResponse, error) {
	if evm.IsUptoEIP3009Payload(payload.Payload) {
		eip3009Payload, err := evm.UptoEIP3009PayloadFromMap(payload.Payload)
		if err != nil {
			network := x402.Network(payload.Accepted.Network)
			return nil, x402.NewSettleError(ErrUptoInvalidPayload, "", network, "", fmt.Sprintf("failed to parse upto EIP-3009 payload: %s", err.Error()))
		}
		return SettleUptoEIP3009(ctx, f.signer, payload, requirements, eip3009Payload, fctx, f.pendingStore)
	}
	if !evm.IsUptoPermit2Payload(payload.Payload) {
		network := x402.Network(payload.Accepted.Network)
		return nil, x402.NewSettleError(ErrUptoInvalidPayload, "", network, "", "unsupported payload type")
	}

	permit2Payload, err := evm.UptoPermit2PayloadFromMap(payload.Payload)
	if err != nil {
		network := x402.Network(payload.Accepted.Network)
		return nil, x402.NewSettleError(ErrUptoInvalidPayload, "", network, "", fmt.Sprintf("failed to parse upto Permit2 payload: %s", err.Error()))
	}

	return SettleUptoPermit2(ctx, f.signer, payload, requirements, permit2Payload, fctx, f.config.SimulateInSettle, f.pendingStore)
}
