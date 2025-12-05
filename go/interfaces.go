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

	// CaipFamily returns the CAIP family pattern this facilitator supports.
	// Used to group signers by blockchain family in the supported response.
	//
	// Examples:
	//   - EVM facilitators return "eip155:*"
	//   - SVM facilitators return "solana:*"
	CaipFamily() string

	// GetExtra returns mechanism-specific extra data for the supported kinds endpoint.
	// This method is called when building the facilitator's supported response.
	//
	// For EVM schemes, return nil (no extra data needed).
	// For SVM schemes, return map with feePayer address.
	//
	// Args:
	//   network: Network identifier for context
	//
	// Returns:
	//   Extra data map or nil if no extra data is needed
	GetExtra(network Network) map[string]interface{}

	// GetSigners returns signer addresses used by this facilitator for a given network.
	// These are included in the supported response to help clients understand
	// which addresses might sign/pay for transactions.
	//
	// Supports multiple addresses for load balancing, key rotation, and high availability.
	//
	// Args:
	//   network: Network identifier
	//
	// Returns:
	//   Array of signer addresses
	//
	// Examples:
	//   - EVM: Returns facilitator wallet addresses
	//   - SVM: Returns fee payer addresses
	GetSigners(network Network) []string

	Verify(ctx context.Context, payload types.PaymentPayloadV1, requirements types.PaymentRequirementsV1) (*VerifyResponse, error)
	Settle(ctx context.Context, payload types.PaymentPayloadV1, requirements types.PaymentRequirementsV1) (*SettleResponse, error)
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

	// CaipFamily returns the CAIP family pattern this facilitator supports.
	// Used to group signers by blockchain family in the supported response.
	//
	// Examples:
	//   - EVM facilitators return "eip155:*"
	//   - SVM facilitators return "solana:*"
	CaipFamily() string

	// GetExtra returns mechanism-specific extra data for the supported kinds endpoint.
	// This method is called when building the facilitator's supported response.
	//
	// For EVM schemes, return nil (no extra data needed).
	// For SVM schemes, return map with feePayer address.
	//
	// Args:
	//   network: Network identifier for context
	//
	// Returns:
	//   Extra data map or nil if no extra data is needed
	GetExtra(network Network) map[string]interface{}

	// GetSigners returns signer addresses used by this facilitator for a given network.
	// These are included in the supported response to help clients understand
	// which addresses might sign/pay for transactions.
	//
	// Supports multiple addresses for load balancing, key rotation, and high availability.
	//
	// Args:
	//   network: Network identifier
	//
	// Returns:
	//   Array of signer addresses
	//
	// Examples:
	//   - EVM: Returns facilitator wallet addresses
	//   - SVM: Returns fee payer addresses
	GetSigners(network Network) []string

	Verify(ctx context.Context, payload types.PaymentPayload, requirements types.PaymentRequirements) (*VerifyResponse, error)
	Settle(ctx context.Context, payload types.PaymentPayload, requirements types.PaymentRequirements) (*SettleResponse, error)
}

// ============================================================================
// FacilitatorClient Interfaces (Network Boundary - uses bytes)
// ============================================================================

// FacilitatorClient interface for facilitators that support V1 and/or V2.
// Uses bytes at network boundary - SDK internal routing unmarshals and routes to typed mechanisms.
// Both modern facilitators (supporting V1+V2) and legacy facilitators (V1 only) implement this interface.
type FacilitatorClient interface {
	// Verify a payment (detects version from bytes, routes internally)
	Verify(ctx context.Context, payloadBytes []byte, requirementsBytes []byte) (*VerifyResponse, error)

	// Settle a payment (detects version from bytes, routes internally)
	Settle(ctx context.Context, payloadBytes []byte, requirementsBytes []byte) (*SettleResponse, error)

	// GetSupported returns supported payment kinds in flat array format with x402Version in each element (backward compatible)
	GetSupported(ctx context.Context) (SupportedResponse, error)
}
