package x402

import "context"

// SchemeNetworkClient is implemented by client-side payment mechanisms
// This interface is used by clients who sign/create payments
type SchemeNetworkClient interface {
	// Scheme returns the payment scheme identifier (e.g., "exact")
	Scheme() string
	
	// CreatePaymentPayload creates a signed payment for the given requirements
	// This is where wallet/signer interaction happens
	CreatePaymentPayload(ctx context.Context, version int, requirements PaymentRequirements) (PaymentPayload, error)
}

// SchemeNetworkFacilitator is implemented by facilitator-side payment mechanisms
// This interface is used by facilitators who verify and settle payments
type SchemeNetworkFacilitator interface {
	// Scheme returns the payment scheme identifier (e.g., "exact")
	Scheme() string
	
	// Verify checks if a payment is valid without executing it
	Verify(ctx context.Context, payload PaymentPayload, requirements PaymentRequirements) (VerifyResponse, error)
	
	// Settle executes the payment on-chain
	Settle(ctx context.Context, payload PaymentPayload, requirements PaymentRequirements) (SettleResponse, error)
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
type FacilitatorClient interface {
	// Verify a payment against requirements
	Verify(ctx context.Context, payload PaymentPayload, requirements PaymentRequirements) (VerifyResponse, error)
	
	// Settle a payment
	Settle(ctx context.Context, payload PaymentPayload, requirements PaymentRequirements) (SettleResponse, error)
	
	// Get supported payment kinds
	GetSupported(ctx context.Context) (SupportedResponse, error)
}
