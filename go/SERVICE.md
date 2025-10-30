# SERVICE - x402 Resource Service Implementation

The service is used by servers/APIs to protect resources with payment requirements. It creates 402 responses, verifies payments, and coordinates settlement with facilitators.

```go
package x402

import (
	"context"
	"fmt"
	"sync"
	"time"
)

// ============================================================================
// ResourceService - Used by SERVERS that want to charge for resources
// ============================================================================

// ResourceService manages payment requirements and verification for protected resources
// This is used by servers/APIs that want to charge for access
type ResourceService struct {
	mu sync.RWMutex
	
	// Map of network -> scheme -> service implementation
	schemes map[Network]map[string]SchemeNetworkService
	
	// Facilitator clients for payment verification/settlement
	facilitatorClients []FacilitatorClient
	
	// Cache of supported payment kinds from facilitators
	supportedCache *SupportedCache
}

// SupportedCache caches facilitator capabilities
type SupportedCache struct {
	mu         sync.RWMutex
	data       map[string]SupportedResponse // key is facilitator identifier
	expiry     map[string]time.Time
	ttl        time.Duration
}

// ResourceServiceOption configures the service
type ResourceServiceOption func(*ResourceService)

// WithFacilitatorClient adds a facilitator client
func WithFacilitatorClient(client FacilitatorClient) ResourceServiceOption {
	return func(s *ResourceService) {
		s.facilitatorClients = append(s.facilitatorClients, client)
	}
}

// WithSchemeService registers a scheme service implementation
func WithSchemeService(network Network, service SchemeNetworkService) ResourceServiceOption {
	return func(s *ResourceService) {
		s.registerScheme(network, service)
	}
}

// WithCacheTTL sets the cache TTL for supported kinds
func WithCacheTTL(ttl time.Duration) ResourceServiceOption {
	return func(s *ResourceService) {
		s.supportedCache.ttl = ttl
	}
}

// NewResourceService creates a new resource service
func NewResourceService(opts ...ResourceServiceOption) *ResourceService {
	s := &ResourceService{
		schemes:            make(map[Network]map[string]SchemeNetworkService),
		facilitatorClients: []FacilitatorClient{},
		supportedCache: &SupportedCache{
			data:   make(map[string]SupportedResponse),
			expiry: make(map[string]time.Time),
			ttl:    5 * time.Minute, // Default 5 minute cache
		},
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

// ============================================================================
// Initialization
// ============================================================================

// Initialize fetches supported payment kinds from all facilitators
// Should be called on startup to populate cache
func (s *ResourceService) Initialize(ctx context.Context) error {
	var lastErr error
	successCount := 0
	
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
	}
	
	if successCount == 0 && lastErr != nil {
		return fmt.Errorf("failed to initialize any facilitators: %w", lastErr)
	}
	
	return nil
}

// ============================================================================
// Scheme Registration
// ============================================================================

// RegisterScheme registers a scheme service for a network
func (s *ResourceService) RegisterScheme(network Network, service SchemeNetworkService) *ResourceService {
	return s.registerScheme(network, service)
}

func (s *ResourceService) registerScheme(network Network, service SchemeNetworkService) *ResourceService {
	s.mu.Lock()
	defer s.mu.Unlock()
	
	if s.schemes[network] == nil {
		s.schemes[network] = make(map[string]SchemeNetworkService)
	}
	
	s.schemes[network][service.Scheme()] = service
	
	return s
}

// ============================================================================
// Payment Requirements Building
// ============================================================================

// BuildPaymentRequirements creates payment requirements for a resource
func (s *ResourceService) BuildPaymentRequirements(ctx context.Context, config ResourceConfig) ([]PaymentRequirements, error) {
	s.mu.RLock()
	defer s.mu.RUnlock()
	
	// Find the scheme service
	service := s.findSchemeService(config.Network, config.Scheme)
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
func (s *ResourceService) CreatePaymentRequiredResponse(
	requirements []PaymentRequirements,
	info ResourceInfo,
	errorMsg string,
	extensions map[string]interface{},
) PaymentRequired {
	response := PaymentRequired{
		X402Version: ProtocolVersion,
		Error:       errorMsg,
		Resource:    info,
		Accepts:     requirements,
		Extensions:  extensions,
	}
	
	if errorMsg == "" {
		response.Error = "Payment required"
	}
	
	return response
}

// ============================================================================
// Payment Verification & Settlement
// ============================================================================

// VerifyPayment verifies a payment against requirements
func (s *ResourceService) VerifyPayment(ctx context.Context, payload PaymentPayload, requirements PaymentRequirements) (VerifyResponse, error) {
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
func (s *ResourceService) SettlePayment(ctx context.Context, payload PaymentPayload, requirements PaymentRequirements) (SettleResponse, error) {
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
func (s *ResourceService) FindMatchingRequirements(available []PaymentRequirements, payload PaymentPayload) *PaymentRequirements {
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

// ============================================================================
// Helper Methods
// ============================================================================

// findSchemeService finds a registered service for network/scheme
func (s *ResourceService) findSchemeService(network Network, scheme string) SchemeNetworkService {
	// Try exact match
	if schemes, exists := s.schemes[network]; exists {
		if service, exists := schemes[scheme]; exists {
			return service
		}
	}
	
	// Try pattern matching
	for registeredNetwork, schemes := range s.schemes {
		if network.Match(registeredNetwork) {
			if service, exists := schemes[scheme]; exists {
				return service
			}
		}
	}
	
	return nil
}

// findSupportedKind finds a supported kind from cache
func (s *ResourceService) findSupportedKind(version int, network Network, scheme string) *SupportedKind {
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
func (s *ResourceService) getFacilitatorExtensions(version int, network Network, scheme string) []string {
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
func (s *ResourceService) findFacilitatorForPayment(version int, network Network, scheme string) FacilitatorClient {
	// This is simplified - in practice, we'd match against cached supported kinds
	// to find the right facilitator
	if len(s.facilitatorClients) > 0 {
		return s.facilitatorClients[0]
	}
	return nil
}

// ============================================================================
// Cache Methods
// ============================================================================

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
```

## Usage Example

```go
// Example: Creating a service for a protected API
import (
    x402 "github.com/coinbase/x402/go"
    "github.com/coinbase/x402/go/mechanisms/evm"
)

func main() {
    // Create service with EVM support
    service := x402.NewResourceService(
        // Add facilitator client(s)
        x402.WithFacilitatorClient(facilitatorClient),
        
        // Register scheme services
        x402.WithSchemeService("eip155:8453", evm.NewExactService()),
        x402.WithSchemeService("eip155:1", evm.NewExactService()),
    )
    
    // Initialize to fetch supported kinds
    if err := service.Initialize(ctx); err != nil {
        log.Fatal(err)
    }
    
    // Build payment requirements for a resource
    config := ResourceConfig{
        Scheme:  "exact",
        PayTo:   "0x...",
        Price:   "$0.10",
        Network: "eip155:8453",
    }
    
    requirements, err := service.BuildPaymentRequirements(ctx, config)
    if err != nil {
        // Handle error
    }
    
    // Create 402 response
    response := service.CreatePaymentRequiredResponse(
        requirements,
        ResourceInfo{
            URL:         "https://api.example.com/data",
            Description: "Premium API data",
            MimeType:    "application/json",
        },
        "Payment required for access",
        nil,
    )
    
    // Later, verify payment from client
    verifyResp, err := service.VerifyPayment(ctx, paymentPayload, requirements[0])
    if verifyResp.IsValid {
        // Payment is valid, provide resource
        
        // Then settle payment
        settleResp, err := service.SettlePayment(ctx, paymentPayload, requirements[0])
    }
}
```
