package x402

import (
	"context"
	"fmt"
	"sync"
)

// x402Facilitator manages payment verification and settlement
// This is used by payment processors that execute on-chain transactions
type x402Facilitator struct {
	mu sync.RWMutex

	// Nested map: version -> network -> scheme -> facilitator implementation
	schemes map[int]map[Network]map[string]SchemeNetworkFacilitator

	// Extensions this facilitator supports (e.g., "bazaar", "sign_in_with_x")
	extensions []string
}

// Newx402Facilitator creates a new facilitator
func Newx402Facilitator() *x402Facilitator {
	return &x402Facilitator{
		schemes:    make(map[int]map[Network]map[string]SchemeNetworkFacilitator),
		extensions: []string{},
	}
}

// RegisterScheme registers a payment mechanism for protocol v2
func (f *x402Facilitator) RegisterScheme(network Network, facilitator SchemeNetworkFacilitator) *x402Facilitator {
	return f.registerScheme(ProtocolVersion, network, facilitator)
}

// RegisterSchemeV1 registers a payment mechanism for protocol v1
func (f *x402Facilitator) RegisterSchemeV1(network Network, facilitator SchemeNetworkFacilitator) *x402Facilitator {
	return f.registerScheme(ProtocolVersionV1, network, facilitator)
}

// registerScheme internal method to register schemes
func (f *x402Facilitator) registerScheme(version int, network Network, facilitator SchemeNetworkFacilitator) *x402Facilitator {
	f.mu.Lock()
	defer f.mu.Unlock()

	// Initialize nested maps if needed
	if f.schemes[version] == nil {
		f.schemes[version] = make(map[Network]map[string]SchemeNetworkFacilitator)
	}
	if f.schemes[version][network] == nil {
		f.schemes[version][network] = make(map[string]SchemeNetworkFacilitator)
	}

	// Register the facilitator for this scheme
	f.schemes[version][network][facilitator.Scheme()] = facilitator

	return f
}

// RegisterExtension registers a protocol extension
func (f *x402Facilitator) RegisterExtension(extension string) *x402Facilitator {
	f.mu.Lock()
	defer f.mu.Unlock()

	// Check if already registered
	for _, ext := range f.extensions {
		if ext == extension {
			return f
		}
	}

	f.extensions = append(f.extensions, extension)
	return f
}

// Verify checks if a payment is valid without executing it
// This validates signatures, checks balances, etc.
func (f *x402Facilitator) Verify(ctx context.Context, payload PaymentPayload, requirements PaymentRequirements) (VerifyResponse, error) {
	f.mu.RLock()
	defer f.mu.RUnlock()

	// Validate inputs
	if err := ValidatePaymentPayload(payload); err != nil {
		return VerifyResponse{
			IsValid:       false,
			InvalidReason: err.Error(),
		}, err
	}

	if err := ValidatePaymentRequirements(requirements); err != nil {
		return VerifyResponse{
			IsValid:       false,
			InvalidReason: err.Error(),
		}, err
	}

	// Check version compatibility
	versionSchemes, exists := f.schemes[payload.X402Version]
	if !exists {
		return VerifyResponse{
				IsValid:       false,
				InvalidReason: fmt.Sprintf("unsupported x402 version: %d", payload.X402Version),
			}, &PaymentError{
				Code:    ErrCodeInvalidPayment,
				Message: fmt.Sprintf("x402 version %d not supported", payload.X402Version),
			}
	}

	// Find the appropriate facilitator
	facilitator := findByNetworkAndScheme(versionSchemes, requirements.Scheme, requirements.Network)
	if facilitator == nil {
		return VerifyResponse{
				IsValid:       false,
				InvalidReason: fmt.Sprintf("unsupported scheme %s on network %s", requirements.Scheme, requirements.Network),
			}, &PaymentError{
				Code:    ErrCodeUnsupportedScheme,
				Message: fmt.Sprintf("no facilitator for scheme %s on network %s", requirements.Scheme, requirements.Network),
			}
	}

	// Verify basic compatibility
	if payload.Accepted.Scheme != requirements.Scheme {
		return VerifyResponse{
				IsValid:       false,
				InvalidReason: "scheme mismatch",
			}, &PaymentError{
				Code:    ErrCodeSchemeMismatch,
				Message: fmt.Sprintf("payment scheme %s does not match requirement %s", payload.Accepted.Scheme, requirements.Scheme),
			}
	}

	if !Network(payload.Accepted.Network).Match(requirements.Network) {
		return VerifyResponse{
				IsValid:       false,
				InvalidReason: "network mismatch",
			}, &PaymentError{
				Code:    ErrCodeNetworkMismatch,
				Message: fmt.Sprintf("payment network %s does not match requirement %s", payload.Accepted.Network, requirements.Network),
			}
	}

	// Delegate to mechanism-specific verification
	return facilitator.Verify(ctx, payload, requirements)
}

// Settle executes a payment on-chain
// This is where the actual blockchain transaction happens
func (f *x402Facilitator) Settle(ctx context.Context, payload PaymentPayload, requirements PaymentRequirements) (SettleResponse, error) {
	f.mu.RLock()
	defer f.mu.RUnlock()

	// Check version compatibility
	versionSchemes, exists := f.schemes[payload.X402Version]
	if !exists {
		return SettleResponse{
				Success:     false,
				ErrorReason: fmt.Sprintf("unsupported x402 version: %d", payload.X402Version),
				Network:     payload.Accepted.Network,
			}, &PaymentError{
				Code:    ErrCodeInvalidPayment,
				Message: fmt.Sprintf("x402 version %d not supported", payload.X402Version),
			}
	}

	// Find the appropriate facilitator
	facilitator := findByNetworkAndScheme(versionSchemes, requirements.Scheme, requirements.Network)
	if facilitator == nil {
		return SettleResponse{
				Success:     false,
				ErrorReason: fmt.Sprintf("unsupported scheme %s on network %s", requirements.Scheme, requirements.Network),
				Network:     payload.Accepted.Network,
			}, &PaymentError{
				Code:    ErrCodeUnsupportedScheme,
				Message: fmt.Sprintf("no facilitator for scheme %s on network %s", requirements.Scheme, requirements.Network),
			}
	}

	// Always verify before settling
	verifyResp, err := facilitator.Verify(ctx, payload, requirements)
	if err != nil {
		return SettleResponse{
			Success:     false,
			ErrorReason: fmt.Sprintf("verification failed: %v", err),
			Network:     payload.Accepted.Network,
		}, err
	}

	if !verifyResp.IsValid {
		return SettleResponse{
				Success:     false,
				ErrorReason: verifyResp.InvalidReason,
				Payer:       verifyResp.Payer,
				Network:     payload.Accepted.Network,
			}, &PaymentError{
				Code:    ErrCodeInvalidPayment,
				Message: verifyResp.InvalidReason,
			}
	}

	// Delegate to mechanism-specific settlement
	return facilitator.Settle(ctx, payload, requirements)
}

// GetSupported returns the payment kinds this facilitator supports
func (f *x402Facilitator) GetSupported() SupportedResponse {
	f.mu.RLock()
	defer f.mu.RUnlock()

	response := SupportedResponse{
		Kinds:      []SupportedKind{},
		Extensions: f.extensions,
	}

	// Build list of supported kinds
	for version, versionSchemes := range f.schemes {
		for network, schemes := range versionSchemes {
			for scheme := range schemes {
				response.Kinds = append(response.Kinds, SupportedKind{
					X402Version: version,
					Scheme:      scheme,
					Network:     network,
					Extra:       map[string]interface{}{},
				})
			}
		}
	}

	return response
}

// CanHandle checks if the facilitator can handle a payment type
func (f *x402Facilitator) CanHandle(version int, network Network, scheme string) bool {
	f.mu.RLock()
	defer f.mu.RUnlock()

	versionSchemes, exists := f.schemes[version]
	if !exists {
		return false
	}

	return findByNetworkAndScheme(versionSchemes, scheme, network) != nil
}

// LocalFacilitatorClient wraps a local facilitator to implement FacilitatorClient
// This allows using a local facilitator in the same process as the service
type LocalFacilitatorClient struct {
	facilitator *x402Facilitator
	identifier  string
}

// NewLocalFacilitatorClient creates a facilitator client backed by a local facilitator
func NewLocalFacilitatorClient(facilitator *x402Facilitator) *LocalFacilitatorClient {
	return &LocalFacilitatorClient{
		facilitator: facilitator,
		identifier:  "local",
	}
}

// Verify implements FacilitatorClient
func (c *LocalFacilitatorClient) Verify(ctx context.Context, payload PaymentPayload, requirements PaymentRequirements) (VerifyResponse, error) {
	return c.facilitator.Verify(ctx, payload, requirements)
}

// Settle implements FacilitatorClient
func (c *LocalFacilitatorClient) Settle(ctx context.Context, payload PaymentPayload, requirements PaymentRequirements) (SettleResponse, error) {
	return c.facilitator.Settle(ctx, payload, requirements)
}

// GetSupported implements FacilitatorClient
func (c *LocalFacilitatorClient) GetSupported(ctx context.Context) (SupportedResponse, error) {
	return c.facilitator.GetSupported(), nil
}
