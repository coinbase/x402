package x402

import "context"

// MoneyParser is a function that converts a decimal amount to an AssetAmount
// If the parser cannot handle the conversion, it should return nil
// Multiple parsers can be registered and will be tried in order
// The default parser is always used as a fallback
//
// Args:
//   amount: Decimal amount (e.g., 1.50 for $1.50)
//   network: Network identifier
//
// Returns:
//   AssetAmount or nil if this parser cannot handle the conversion
type MoneyParser func(amount float64, network Network) (*AssetAmount, error)

// SchemeNetworkClient is implemented by client-side payment mechanisms
// This interface is used by clients who sign/create payments
type SchemeNetworkClient interface {
	// Scheme returns the payment scheme identifier (e.g., "exact")
	Scheme() string

	// CreatePaymentPayload creates a signed payment for the given requirements
	// For v2: Returns partial payload (x402Version + payload), core wraps with accepted/resource/extensions
	// For v1: Returns complete payload (x402Version + scheme + network + payload)
	CreatePaymentPayload(ctx context.Context, version int, requirementsBytes []byte) (payloadBytes []byte, err error)
}

// SchemeNetworkFacilitator is implemented by facilitator-side payment mechanisms
// This interface is used by facilitators who verify and settle payments
type SchemeNetworkFacilitator interface {
	// Scheme returns the payment scheme identifier (e.g., "exact")
	Scheme() string

	// Verify checks if a payment is valid without executing it
	// Receives version + raw bytes, mechanisms unmarshal to version-specific types
	Verify(ctx context.Context, version int, payloadBytes []byte, requirementsBytes []byte) (VerifyResponse, error)

	// Settle executes the payment on-chain
	// Receives version + raw bytes, mechanisms unmarshal to version-specific types
	Settle(ctx context.Context, version int, payloadBytes []byte, requirementsBytes []byte) (SettleResponse, error)
}

// SchemeNetworkService is implemented by server-side payment mechanisms
// This interface is used by servers who create payment requirements
type SchemeNetworkService interface {
	// Scheme returns the payment scheme identifier (e.g., "exact")
	Scheme() string

	// ParsePrice converts a user-friendly price to asset/amount format
	ParsePrice(price Price, network Network) (AssetAmount, error)

	// EnhancePaymentRequirements adds scheme-specific details to requirements
	EnhancePaymentRequirements(
		ctx context.Context,
		requirements PaymentRequirements,
		supportedKind SupportedKind,
		extensions []string,
	) (PaymentRequirements, error)
}

// FacilitatorClient interface for services to interact with facilitators
// Updated to use bytes for version-agnostic communication
type FacilitatorClient interface {
	// Verify a payment against requirements
	// Accepts raw bytes (payload and requirements)
	Verify(ctx context.Context, payloadBytes []byte, requirementsBytes []byte) (VerifyResponse, error)

	// Settle a payment
	// Accepts raw bytes (payload and requirements)
	Settle(ctx context.Context, payloadBytes []byte, requirementsBytes []byte) (SettleResponse, error)

	// Get supported payment kinds
	GetSupported(ctx context.Context) (SupportedResponse, error)
}
