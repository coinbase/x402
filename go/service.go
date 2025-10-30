package x402

import (
	"context"
	"fmt"
	"sync"
	"time"
)

// x402ResourceService manages payment requirements and verification for protected resources
// This is used by servers/APIs that want to charge for access
type x402ResourceService struct {
	mu sync.RWMutex

	// Map of network -> scheme -> service implementation
	schemes map[Network]map[string]SchemeNetworkService

	// Facilitator clients for payment verification/settlement
	facilitatorClients []FacilitatorClient

	// Cache of supported payment kinds from facilitators
	supportedCache *SupportedCache

	// Map of version -> network -> scheme -> FacilitatorClient
	// Built during Initialize() to map which facilitator handles which payment type
	facilitatorClientsMap map[int]map[Network]map[string]FacilitatorClient
}

// SupportedCache caches facilitator capabilities
type SupportedCache struct {
	mu     sync.RWMutex
	data   map[string]SupportedResponse // key is facilitator identifier
	expiry map[string]time.Time
	ttl    time.Duration
}

// ResourceServiceOption configures the service
type ResourceServiceOption func(*x402ResourceService)

// WithFacilitatorClient adds a facilitator client
func WithFacilitatorClient(client FacilitatorClient) ResourceServiceOption {
	return func(s *x402ResourceService) {
		s.facilitatorClients = append(s.facilitatorClients, client)
	}
}

// WithSchemeService registers a scheme service implementation
func WithSchemeService(network Network, service SchemeNetworkService) ResourceServiceOption {
	return func(s *x402ResourceService) {
		s.registerScheme(network, service)
	}
}

// WithCacheTTL sets the cache TTL for supported kinds
func WithCacheTTL(ttl time.Duration) ResourceServiceOption {
	return func(s *x402ResourceService) {
		s.supportedCache.ttl = ttl
	}
}

// Newx402ResourceService creates a new resource service
func Newx402ResourceService(opts ...ResourceServiceOption) *x402ResourceService {
	s := &x402ResourceService{
		schemes:            make(map[Network]map[string]SchemeNetworkService),
		facilitatorClients: []FacilitatorClient{},
		supportedCache: &SupportedCache{
			data:   make(map[string]SupportedResponse),
			expiry: make(map[string]time.Time),
			ttl:    5 * time.Minute, // Default 5 minute cache
		},
		facilitatorClientsMap: make(map[int]map[Network]map[string]FacilitatorClient),
	}

	for _, opt := range opts {
		opt(s)
	}

	// If no facilitator clients provided, this is an error for production
	// but we'll allow it for testing
	if len(s.facilitatorClients) == 0 {
		// Log warning - in production should have at least one facilitator
	}

	return s
}

// Initialize fetches supported payment kinds from all facilitators
// Should be called on startup to populate cache and build facilitator mapping
func (s *x402ResourceService) Initialize(ctx context.Context) error {
	s.mu.Lock()
	defer s.mu.Unlock()

	// Clear existing mappings
	s.facilitatorClientsMap = make(map[int]map[Network]map[string]FacilitatorClient)

	var lastErr error
	successCount := 0

	// Process facilitators in order (earlier ones get precedence)
	for i, client := range s.facilitatorClients {
		supported, err := client.GetSupported(ctx)
		if err != nil {
			lastErr = fmt.Errorf("facilitator %d: %w", i, err)
			continue
		}

		// Cache the supported kinds
		key := fmt.Sprintf("facilitator_%d", i)
		s.supportedCache.Set(key, supported)
		successCount++

		// Build the facilitatorClientsMap for quick lookup
		for _, kind := range supported.Kinds {
			// Get or create version map
			if s.facilitatorClientsMap[kind.X402Version] == nil {
				s.facilitatorClientsMap[kind.X402Version] = make(map[Network]map[string]FacilitatorClient)
			}
			versionMap := s.facilitatorClientsMap[kind.X402Version]

			// Get or create network map
			if versionMap[kind.Network] == nil {
				versionMap[kind.Network] = make(map[string]FacilitatorClient)
			}
			networkMap := versionMap[kind.Network]

			// Only store if not already present (gives precedence to earlier facilitators)
			if _, exists := networkMap[kind.Scheme]; !exists {
				networkMap[kind.Scheme] = client
			}
		}
	}

	if successCount == 0 && lastErr != nil {
		return fmt.Errorf("failed to initialize any facilitators: %w", lastErr)
	}

	return nil
}

// RegisterScheme registers a scheme service for a network
func (s *x402ResourceService) RegisterScheme(network Network, service SchemeNetworkService) *x402ResourceService {
	return s.registerScheme(network, service)
}

func (s *x402ResourceService) registerScheme(network Network, service SchemeNetworkService) *x402ResourceService {
	s.mu.Lock()
	defer s.mu.Unlock()

	if s.schemes[network] == nil {
		s.schemes[network] = make(map[string]SchemeNetworkService)
	}

	s.schemes[network][service.Scheme()] = service

	return s
}

// BuildPaymentRequirements creates payment requirements for a resource
func (s *x402ResourceService) BuildPaymentRequirements(ctx context.Context, config ResourceConfig) ([]PaymentRequirements, error) {
	s.mu.RLock()
	defer s.mu.RUnlock()

	// Find the scheme service
	service := findByNetworkAndScheme(s.schemes, config.Scheme, config.Network)
	if service == nil {
		return nil, &PaymentError{
			Code:    ErrCodeUnsupportedScheme,
			Message: fmt.Sprintf("no service registered for scheme %s on network %s", config.Scheme, config.Network),
		}
	}

	// Get supported kinds from facilitators
	supportedKind := s.findSupportedKind(ProtocolVersion, config.Network, config.Scheme)
	if supportedKind == nil {
		return nil, &PaymentError{
			Code:    ErrCodeUnsupportedNetwork,
			Message: fmt.Sprintf("facilitator does not support %s on %s", config.Scheme, config.Network),
			Details: map[string]interface{}{
				"hint": "call Initialize() to fetch supported kinds from facilitators",
			},
		}
	}

	// Parse the price using the scheme's parser
	assetAmount, err := service.ParsePrice(config.Price, config.Network)
	if err != nil {
		return nil, fmt.Errorf("failed to parse price: %w", err)
	}

	// Build base requirements
	baseRequirements := PaymentRequirements{
		Scheme:            config.Scheme,
		Network:           config.Network,
		Asset:             assetAmount.Asset,
		Amount:            assetAmount.Amount,
		PayTo:             config.PayTo,
		MaxTimeoutSeconds: config.MaxTimeoutSeconds,
		Extra:             assetAmount.Extra,
	}

	// Set default timeout if not specified
	if baseRequirements.MaxTimeoutSeconds == 0 {
		baseRequirements.MaxTimeoutSeconds = 300 // 5 minutes default
	}

	// Get facilitator extensions
	extensions := s.getFacilitatorExtensions(ProtocolVersion, config.Network, config.Scheme)

	// Enhance with scheme-specific details
	enhanced, err := service.EnhancePaymentRequirements(ctx, baseRequirements, *supportedKind, extensions)
	if err != nil {
		return nil, fmt.Errorf("failed to enhance payment requirements: %w", err)
	}

	return []PaymentRequirements{enhanced}, nil
}

// CreatePaymentRequiredResponse creates a 402 response
func (s *x402ResourceService) CreatePaymentRequiredResponse(
	requirements []PaymentRequirements,
	info ResourceInfo,
	errorMsg string,
	extensions map[string]interface{},
) PaymentRequired {
	response := PaymentRequired{
		X402Version: ProtocolVersion,
		Error:       errorMsg,
		Resource:    &info,
		Accepts:     requirements,
		Extensions:  extensions,
	}

	if errorMsg == "" {
		response.Error = "Payment required"
	}

	return response
}

// VerifyPayment verifies a payment against requirements
func (s *x402ResourceService) VerifyPayment(ctx context.Context, payload PaymentPayload, requirements PaymentRequirements) (VerifyResponse, error) {
	// Validate inputs
	if err := ValidatePaymentPayload(payload); err != nil {
		return VerifyResponse{IsValid: false, InvalidReason: err.Error()}, err
	}

	if err := ValidatePaymentRequirements(requirements); err != nil {
		return VerifyResponse{IsValid: false, InvalidReason: err.Error()}, err
	}

	// Find appropriate facilitator
	facilitator := s.findFacilitatorForPayment(payload.X402Version, requirements.Network, requirements.Scheme)
	if facilitator == nil {
		// Try all facilitators as fallback
		for _, client := range s.facilitatorClients {
			resp, err := client.Verify(ctx, payload, requirements)
			if err == nil {
				return resp, nil
			}
		}

		return VerifyResponse{
				IsValid:       false,
				InvalidReason: "no facilitator available for verification",
			}, &PaymentError{
				Code:    ErrCodeUnsupportedNetwork,
				Message: "no facilitator supports this payment type",
			}
	}

	return facilitator.Verify(ctx, payload, requirements)
}

// SettlePayment settles a verified payment
func (s *x402ResourceService) SettlePayment(ctx context.Context, payload PaymentPayload, requirements PaymentRequirements) (SettleResponse, error) {
	// Find appropriate facilitator
	facilitator := s.findFacilitatorForPayment(payload.X402Version, requirements.Network, requirements.Scheme)
	if facilitator == nil {
		// Try all facilitators as fallback
		for _, client := range s.facilitatorClients {
			resp, err := client.Settle(ctx, payload, requirements)
			if err == nil {
				return resp, nil
			}
		}

		return SettleResponse{
				Success:     false,
				ErrorReason: "no facilitator available for settlement",
			}, &PaymentError{
				Code:    ErrCodeSettlementFailed,
				Message: "no facilitator supports this payment type",
			}
	}

	return facilitator.Settle(ctx, payload, requirements)
}

// FindMatchingRequirements finds requirements that match a payment payload
func (s *x402ResourceService) FindMatchingRequirements(available []PaymentRequirements, payload PaymentPayload) *PaymentRequirements {
	switch payload.X402Version {
	case 2:
		// V2: match by accepted requirements
		for _, req := range available {
			if DeepEqual(req, payload.Accepted) {
				return &req
			}
		}
	case 1:
		// V1: match by scheme and network
		for _, req := range available {
			if req.Scheme == payload.Scheme && req.Network == payload.Network {
				return &req
			}
		}
	}
	return nil
}

// ProcessPaymentRequest processes a payment request end-to-end
func (s *x402ResourceService) ProcessPaymentRequest(
	ctx context.Context,
	paymentPayload *PaymentPayload,
	resourceConfig ResourceConfig,
	resourceInfo ResourceInfo,
	extensions map[string]interface{},
) (*ProcessResult, error) {
	requirements, err := s.BuildPaymentRequirements(ctx, resourceConfig)
	if err != nil {
		return nil, err
	}

	if paymentPayload == nil {
		return &ProcessResult{
			Success: false,
			RequiresPayment: &PaymentRequired{
				X402Version: ProtocolVersion,
				Error:       "Payment required",
				Resource:    &resourceInfo,
				Accepts:     requirements,
				Extensions:  extensions,
			},
		}, nil
	}

	// Find matching requirements
	matchingRequirements := s.FindMatchingRequirements(requirements, *paymentPayload)
	if matchingRequirements == nil {
		return &ProcessResult{
			Success: false,
			RequiresPayment: &PaymentRequired{
				X402Version: ProtocolVersion,
				Error:       "No matching payment requirements found",
				Resource:    &resourceInfo,
				Accepts:     requirements,
				Extensions:  extensions,
			},
		}, nil
	}

	// Verify payment
	verificationResult, err := s.VerifyPayment(ctx, *paymentPayload, *matchingRequirements)
	if err != nil {
		return nil, err
	}

	if !verificationResult.IsValid {
		return &ProcessResult{
			Success:            false,
			Error:              verificationResult.InvalidReason,
			VerificationResult: &verificationResult,
		}, nil
	}

	// Payment verified, ready for settlement
	return &ProcessResult{
		Success:            true,
		VerificationResult: &verificationResult,
	}, nil
}

// ProcessResult contains the result of processing a payment request
type ProcessResult struct {
	Success            bool
	RequiresPayment    *PaymentRequired
	VerificationResult *VerifyResponse
	SettlementResult   *SettleResponse
	Error              string
}

// Helper methods

// findSupportedKind finds a supported kind from cache
func (s *x402ResourceService) findSupportedKind(version int, network Network, scheme string) *SupportedKind {
	s.supportedCache.mu.RLock()
	defer s.supportedCache.mu.RUnlock()

	for key, supported := range s.supportedCache.data {
		// Check if cache entry is still valid
		if expiry, exists := s.supportedCache.expiry[key]; exists {
			if time.Now().After(expiry) {
				continue // Skip expired entries
			}
		}

		// Look for matching kind
		for _, kind := range supported.Kinds {
			if kind.X402Version == version &&
				kind.Scheme == scheme &&
				Network(kind.Network).Match(network) {
				return &SupportedKind{
					X402Version: kind.X402Version,
					Scheme:      kind.Scheme,
					Network:     kind.Network,
					Extra:       kind.Extra,
				}
			}
		}
	}

	return nil
}

// getFacilitatorExtensions gets extensions for a payment type
func (s *x402ResourceService) getFacilitatorExtensions(version int, network Network, scheme string) []string {
	s.supportedCache.mu.RLock()
	defer s.supportedCache.mu.RUnlock()

	for _, supported := range s.supportedCache.data {
		for _, kind := range supported.Kinds {
			if kind.X402Version == version &&
				kind.Scheme == scheme &&
				Network(kind.Network).Match(network) {
				return supported.Extensions
			}
		}
	}

	return []string{}
}

// findFacilitatorForPayment finds the facilitator that supports a payment type
// Uses the facilitatorClientsMap built during Initialize() for O(1) lookup
func (s *x402ResourceService) findFacilitatorForPayment(version int, network Network, scheme string) FacilitatorClient {
	s.mu.RLock()
	defer s.mu.RUnlock()

	versionMap, exists := s.facilitatorClientsMap[version]
	if !exists {
		return nil
	}

	// Use the utility function to find with pattern matching support
	return findByNetworkAndScheme(versionMap, scheme, network)
}

// Set adds an item to the cache
func (c *SupportedCache) Set(key string, value SupportedResponse) {
	c.mu.Lock()
	defer c.mu.Unlock()

	c.data[key] = value
	c.expiry[key] = time.Now().Add(c.ttl)
}

// Clear clears the cache
func (c *SupportedCache) Clear() {
	c.mu.Lock()
	defer c.mu.Unlock()

	c.data = make(map[string]SupportedResponse)
	c.expiry = make(map[string]time.Time)
}
