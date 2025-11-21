package x402

import (
	"context"

	"github.com/coinbase/x402/go/types"
)

// MoneyParser is a function that converts a decimal amount to an AssetAmount
// If the parser cannot handle the conversion, it should return nil
// Multiple parsers can be registered and will be tried in order
// The default parser is always used as a fallback
//
// Args:
//
//	amount: Decimal amount (e.g., 1.50 for $1.50)
//	network: Network identifier
//
// Returns:
//
//	AssetAmount or nil if this parser cannot handle the conversion
type MoneyParser func(amount float64, network Network) (*AssetAmount, error)

// ============================================================================
// V1 Interfaces (Legacy - explicitly versioned)
// ============================================================================

// SchemeNetworkClientV1 is implemented by client-side V1 payment mechanisms
type SchemeNetworkClientV1 interface {
	Scheme() string
	CreatePaymentPayload(ctx context.Context, requirements types.PaymentRequirementsV1) (types.PaymentPayloadV1, error)
}

// SchemeNetworkFacilitatorV1 is implemented by facilitator-side V1 payment mechanisms
type SchemeNetworkFacilitatorV1 interface {
	Scheme() string
	Verify(ctx context.Context, payload types.PaymentPayloadV1, requirements types.PaymentRequirementsV1) (VerifyResponse, error)
	Settle(ctx context.Context, payload types.PaymentPayloadV1, requirements types.PaymentRequirementsV1) (SettleResponse, error)
}

// Note: No SchemeNetworkServerV1 - new SDK servers are V2 only

// ============================================================================
// V2 Interfaces (Current - default, no version suffix)
// ============================================================================

// SchemeNetworkClient is implemented by client-side payment mechanisms (V2)
type SchemeNetworkClient interface {
	Scheme() string
	CreatePaymentPayload(ctx context.Context, requirements types.PaymentRequirements) (types.PaymentPayload, error)
}

// SchemeNetworkServer is implemented by server-side payment mechanisms (V2)
type SchemeNetworkServer interface {
	Scheme() string
	ParsePrice(price Price, network Network) (AssetAmount, error)
	EnhancePaymentRequirements(
		ctx context.Context,
		requirements types.PaymentRequirements,
		supportedKind types.SupportedKind,
		extensions []string,
	) (types.PaymentRequirements, error)
}

// SchemeNetworkFacilitator is implemented by facilitator-side payment mechanisms (V2)
type SchemeNetworkFacilitator interface {
	Scheme() string
	Verify(ctx context.Context, payload types.PaymentPayload, requirements types.PaymentRequirements) (VerifyResponse, error)
	Settle(ctx context.Context, payload types.PaymentPayload, requirements types.PaymentRequirements) (SettleResponse, error)
}

// ============================================================================
// FacilitatorClient Interfaces (Network Boundary - uses bytes)
// ============================================================================

// FacilitatorClient interface for new facilitators that support both V1 and V2
// Uses bytes at network boundary - SDK internal routing unmarshals and routes to typed mechanisms
type FacilitatorClient interface {
	// Verify a payment (detects version from bytes, routes internally)
	Verify(ctx context.Context, payloadBytes []byte, requirementsBytes []byte) (VerifyResponse, error)

	// Settle a payment (detects version from bytes, routes internally)
	Settle(ctx context.Context, payloadBytes []byte, requirementsBytes []byte) (SettleResponse, error)

	// GetSupported returns supported payment kinds (new format - includes both V1/V2)
	GetSupported(ctx context.Context) (SupportedResponse, error)
}

// LegacyFacilitatorClient interface for old facilitators (V1 only)
// Same signatures but GetSupported returns old format
type LegacyFacilitatorClient interface {
	// Verify a V1 payment only
	Verify(ctx context.Context, payloadBytes []byte, requirementsBytes []byte) (VerifyResponse, error)

	// Settle a V1 payment only
	Settle(ctx context.Context, payloadBytes []byte, requirementsBytes []byte) (SettleResponse, error)

	// GetSupported returns V1 supported format (no extensions)
	GetSupported(ctx context.Context) (SupportedResponseV1, error)
}

// SupportedResponseV1 is the old supported response format (V1 only, no extensions)
type SupportedResponseV1 struct {
	Kinds []types.SupportedKindV1 `json:"kinds"`
}
