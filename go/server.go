package x402

import (
	"context"
	"encoding/json"
	"fmt"
	"sync"
	"time"

	"github.com/coinbase/x402/go/types"
)

// x402ResourceServer manages payment requirements and verification for protected resources
// This is used by servers/APIs that want to charge for access
type x402ResourceServer struct {
	mu                    sync.RWMutex
	schemes               map[Network]map[string]SchemeNetworkServer
	facilitatorClients    []FacilitatorClient
	registeredExtensions  map[string]types.ResourceServerExtension
	supportedCache        *SupportedCache
	facilitatorClientsMap map[int]map[Network]map[string]FacilitatorClient

	// Lifecycle hooks
	beforeVerifyHooks    []BeforeVerifyHook
	afterVerifyHooks     []AfterVerifyHook
	onVerifyFailureHooks []OnVerifyFailureHook
	beforeSettleHooks    []BeforeSettleHook
	afterSettleHooks     []AfterSettleHook
	onSettleFailureHooks []OnSettleFailureHook
}

// SupportedCache caches facilitator capabilities
type SupportedCache struct {
	mu     sync.RWMutex
	data   map[string]SupportedResponse // key is facilitator identifier
	expiry map[string]time.Time
	ttl    time.Duration
}

// ResourceServerOption configures the server
type ResourceServerOption func(*x402ResourceServer)

// WithFacilitatorClient adds a facilitator client
func WithFacilitatorClient(client FacilitatorClient) ResourceServerOption {
	return func(s *x402ResourceServer) {
		s.facilitatorClients = append(s.facilitatorClients, client)
	}
}

// WithSchemeServer registers a scheme server implementation
func WithSchemeServer(network Network, schemeServer SchemeNetworkServer) ResourceServerOption {
	return func(s *x402ResourceServer) {
		s.registerScheme(network, schemeServer)
	}
}

// WithCacheTTL sets the cache TTL for supported kinds
func WithCacheTTL(ttl time.Duration) ResourceServerOption {
	return func(s *x402ResourceServer) {
		s.supportedCache.ttl = ttl
	}
}

func Newx402ResourceServer(opts ...ResourceServerOption) *x402ResourceServer {
	s := &x402ResourceServer{
		schemes:              make(map[Network]map[string]SchemeNetworkServer),
		facilitatorClients:   []FacilitatorClient{},
		registeredExtensions: make(map[string]types.ResourceServerExtension),
		supportedCache: &SupportedCache{
			data:   make(map[string]SupportedResponse),
			expiry: make(map[string]time.Time),
			ttl:    5 * time.Minute,
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
func (s *x402ResourceServer) Initialize(ctx context.Context) error {
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

func (s *x402ResourceServer) Register(network Network, schemeServer SchemeNetworkServer) *x402ResourceServer {
	return s.registerScheme(network, schemeServer)
}

func (s *x402ResourceServer) registerScheme(network Network, schemeServer SchemeNetworkServer) *x402ResourceServer {
	s.mu.Lock()
	defer s.mu.Unlock()

	if s.schemes[network] == nil {
		s.schemes[network] = make(map[string]SchemeNetworkServer)
	}

	s.schemes[network][schemeServer.Scheme()] = schemeServer

	return s
}

func (s *x402ResourceServer) RegisterExtension(extension types.ResourceServerExtension) *x402ResourceServer {
	s.mu.Lock()
	defer s.mu.Unlock()

	s.registeredExtensions[extension.Key()] = extension
	return s
}

// ============================================================================
// Hook Registration Methods (Chainable)
// ============================================================================

// OnBeforeVerify registers a hook to execute before payment verification
// Can abort verification by returning a result with Abort=true
//
// Args:
//
//	hook: The hook function to register
//
// Returns:
//
//	The server instance for chaining
func (s *x402ResourceServer) OnBeforeVerify(hook BeforeVerifyHook) *x402ResourceServer {
	s.mu.Lock()
	defer s.mu.Unlock()
	s.beforeVerifyHooks = append(s.beforeVerifyHooks, hook)
	return s
}

// OnAfterVerify registers a hook to execute after successful payment verification
//
// Args:
//
//	hook: The hook function to register
//
// Returns:
//
//	The server instance for chaining
func (s *x402ResourceServer) OnAfterVerify(hook AfterVerifyHook) *x402ResourceServer {
	s.mu.Lock()
	defer s.mu.Unlock()
	s.afterVerifyHooks = append(s.afterVerifyHooks, hook)
	return s
}

// OnVerifyFailure registers a hook to execute when payment verification fails
// Can recover from failure by returning a result with Recovered=true
//
// Args:
//
//	hook: The hook function to register
//
// Returns:
//
//	The server instance for chaining
func (s *x402ResourceServer) OnVerifyFailure(hook OnVerifyFailureHook) *x402ResourceServer {
	s.mu.Lock()
	defer s.mu.Unlock()
	s.onVerifyFailureHooks = append(s.onVerifyFailureHooks, hook)
	return s
}

// OnBeforeSettle registers a hook to execute before payment settlement
// Can abort settlement by returning a result with Abort=true
//
// Args:
//
//	hook: The hook function to register
//
// Returns:
//
//	The server instance for chaining
func (s *x402ResourceServer) OnBeforeSettle(hook BeforeSettleHook) *x402ResourceServer {
	s.mu.Lock()
	defer s.mu.Unlock()
	s.beforeSettleHooks = append(s.beforeSettleHooks, hook)
	return s
}

// OnAfterSettle registers a hook to execute after successful payment settlement
//
// Args:
//
//	hook: The hook function to register
//
// Returns:
//
//	The server instance for chaining
func (s *x402ResourceServer) OnAfterSettle(hook AfterSettleHook) *x402ResourceServer {
	s.mu.Lock()
	defer s.mu.Unlock()
	s.afterSettleHooks = append(s.afterSettleHooks, hook)
	return s
}

// OnSettleFailure registers a hook to execute when payment settlement fails
// Can recover from failure by returning a result with Recovered=true
//
// Args:
//
//	hook: The hook function to register
//
// Returns:
//
//	The server instance for chaining
func (s *x402ResourceServer) OnSettleFailure(hook OnSettleFailureHook) *x402ResourceServer {
	s.mu.Lock()
	defer s.mu.Unlock()
	s.onSettleFailureHooks = append(s.onSettleFailureHooks, hook)
	return s
}

func (s *x402ResourceServer) EnrichExtensions(
	declaredExtensions map[string]interface{},
	transportContext interface{},
) map[string]interface{} {
	s.mu.RLock()
	defer s.mu.RUnlock()

	enriched := make(map[string]interface{})

	for key, declaration := range declaredExtensions {
		if extension, ok := s.registeredExtensions[key]; ok {
			enriched[key] = extension.EnrichDeclaration(declaration, transportContext)
		} else {
			enriched[key] = declaration
		}
	}

	return enriched
}

// BuildPaymentRequirements creates payment requirements for a resource
func (s *x402ResourceServer) BuildPaymentRequirements(ctx context.Context, config ResourceConfig) ([]PaymentRequirements, error) {
	s.mu.RLock()
	defer s.mu.RUnlock()

	// Find the scheme server
	schemeServer := findByNetworkAndScheme(s.schemes, config.Scheme, config.Network)
	if schemeServer == nil {
		return nil, &PaymentError{
			Code:    ErrCodeUnsupportedScheme,
			Message: fmt.Sprintf("no server registered for scheme %s on network %s", config.Scheme, config.Network),
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
	assetAmount, err := schemeServer.ParsePrice(config.Price, config.Network)
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
	enhanced, err := schemeServer.EnhancePaymentRequirements(ctx, baseRequirements, *supportedKind, extensions)
	if err != nil {
		return nil, fmt.Errorf("failed to enhance payment requirements: %w", err)
	}

	return []PaymentRequirements{enhanced}, nil
}

// CreatePaymentRequiredResponse creates a 402 response
func (s *x402ResourceServer) CreatePaymentRequiredResponse(
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
// Server is boundary: accepts bytes (from client), routes to facilitator
//
// Args:
//
//	ctx: Context for cancellation and metadata
//	payloadBytes: Serialized payment payload
//	requirementsBytes: Serialized payment requirements
//
// Returns:
//
//	VerifyResponse and error if verification fails
func (s *x402ResourceServer) VerifyPayment(ctx context.Context, payloadBytes []byte, requirementsBytes []byte) (VerifyResponse, error) {
	// Build hook context
	hookCtx := VerifyContext{
		Ctx:               ctx,
		PayloadBytes:      payloadBytes,
		RequirementsBytes: requirementsBytes,
	}

	// Execute beforeVerify hooks
	s.mu.RLock()
	beforeHooks := s.beforeVerifyHooks
	s.mu.RUnlock()

	for _, hook := range beforeHooks {
		result, err := hook(hookCtx)
		if err != nil {
			// Log error but continue (hook errors don't abort)
			// In production, you might want to log this
		}
		if result != nil && result.Abort {
			return VerifyResponse{
				IsValid:       false,
				InvalidReason: result.Reason,
			}, nil
		}
	}

	// Perform verification
	var verifyResult VerifyResponse
	var verifyErr error

	// Detect version
	version, err := types.DetectVersion(payloadBytes)
	if err != nil {
		verifyErr = err
		verifyResult = VerifyResponse{IsValid: false, InvalidReason: "invalid version"}
	} else {
		// Extract scheme/network from requirements for routing
		reqInfo, err := types.ExtractRequirementsInfo(requirementsBytes)
		if err != nil {
			verifyErr = err
			verifyResult = VerifyResponse{IsValid: false, InvalidReason: "invalid requirements"}
		} else {
			// Find appropriate facilitator
			facilitator := s.findFacilitatorForPayment(version, Network(reqInfo.Network), reqInfo.Scheme)
			if facilitator == nil {
				// Try all facilitators as fallback
				var lastErr error
				for _, client := range s.facilitatorClients {
					resp, err := client.Verify(ctx, payloadBytes, requirementsBytes)
					if err == nil {
						verifyResult = resp
						break
					}
					lastErr = err
				}

				if verifyResult.IsValid || lastErr != nil {
					if lastErr != nil {
						verifyErr = &PaymentError{
							Code:    ErrCodeUnsupportedNetwork,
							Message: "no facilitator supports this payment type",
						}
						verifyResult = VerifyResponse{
							IsValid:       false,
							InvalidReason: "no facilitator available for verification",
						}
					}
				}
			} else {
				// Use specific facilitator
				verifyResult, verifyErr = facilitator.Verify(ctx, payloadBytes, requirementsBytes)
			}
		}
	}

	// Handle success case
	if verifyErr == nil {
		// Execute afterVerify hooks
		s.mu.RLock()
		afterHooks := s.afterVerifyHooks
		s.mu.RUnlock()

		resultCtx := VerifyResultContext{
			VerifyContext: hookCtx,
			Result:        verifyResult,
		}

		for _, hook := range afterHooks {
			if err := hook(resultCtx); err != nil {
				// Log error but don't fail the verification
				// In production, you might want to log this
			}
		}

		return verifyResult, nil
	}

	// Handle failure case
	s.mu.RLock()
	failureHooks := s.onVerifyFailureHooks
	s.mu.RUnlock()

	failureCtx := VerifyFailureContext{
		VerifyContext: hookCtx,
		Error:         verifyErr,
	}

	// Execute onVerifyFailure hooks
	for _, hook := range failureHooks {
		result, err := hook(failureCtx)
		if err != nil {
			// Log error but continue
		}
		if result != nil && result.Recovered {
			// Hook recovered from failure
			return result.Result, nil
		}
	}

	// No recovery, return original error
	return verifyResult, verifyErr
}

// SettlePayment settles a verified payment
// Server is boundary: accepts bytes (from client), routes to facilitator
//
// Args:
//
//	ctx: Context for cancellation and metadata
//	payloadBytes: Serialized payment payload
//	requirementsBytes: Serialized payment requirements
//
// Returns:
//
//	SettleResponse and error if settlement fails
func (s *x402ResourceServer) SettlePayment(ctx context.Context, payloadBytes []byte, requirementsBytes []byte) (SettleResponse, error) {
	// Build hook context
	hookCtx := SettleContext{
		Ctx:               ctx,
		PayloadBytes:      payloadBytes,
		RequirementsBytes: requirementsBytes,
	}

	// Execute beforeSettle hooks
	s.mu.RLock()
	beforeHooks := s.beforeSettleHooks
	s.mu.RUnlock()

	for _, hook := range beforeHooks {
		result, err := hook(hookCtx)
		if err != nil {
			// Log error but continue (hook errors don't abort)
			// In production, you might want to log this
		}
		if result != nil && result.Abort {
			return SettleResponse{
				Success:     false,
				ErrorReason: fmt.Sprintf("Settlement aborted: %s", result.Reason),
			}, fmt.Errorf("settlement aborted: %s", result.Reason)
		}
	}

	// Perform settlement
	var settleResult SettleResponse
	var settleErr error

	// Detect version
	version, err := types.DetectVersion(payloadBytes)
	if err != nil {
		settleErr = err
		settleResult = SettleResponse{Success: false, ErrorReason: "invalid version"}
	} else {
		// Extract scheme/network from requirements for routing
		reqInfo, err := types.ExtractRequirementsInfo(requirementsBytes)
		if err != nil {
			settleErr = err
			settleResult = SettleResponse{Success: false, ErrorReason: "invalid requirements"}
		} else {
			// Find appropriate facilitator
			facilitator := s.findFacilitatorForPayment(version, Network(reqInfo.Network), reqInfo.Scheme)
			if facilitator == nil {
				// Try all facilitators as fallback
				var lastErr error
				for _, client := range s.facilitatorClients {
					resp, err := client.Settle(ctx, payloadBytes, requirementsBytes)
					if err == nil {
						settleResult = resp
						break
					}
					lastErr = err
				}

				if !settleResult.Success && lastErr != nil {
					settleErr = &PaymentError{
						Code:    ErrCodeSettlementFailed,
						Message: "no facilitator supports this payment type",
					}
					settleResult = SettleResponse{
						Success:     false,
						ErrorReason: "no facilitator available for settlement",
					}
				}
			} else {
				// Use specific facilitator
				settleResult, settleErr = facilitator.Settle(ctx, payloadBytes, requirementsBytes)
			}
		}
	}

	// Handle success case
	if settleErr == nil && settleResult.Success {
		// Execute afterSettle hooks
		s.mu.RLock()
		afterHooks := s.afterSettleHooks
		s.mu.RUnlock()

		resultCtx := SettleResultContext{
			SettleContext: hookCtx,
			Result:        settleResult,
		}

		for _, hook := range afterHooks {
			if err := hook(resultCtx); err != nil {
				// Log error but don't fail the settlement
				// In production, you might want to log this
			}
		}

		return settleResult, nil
	}

	// Handle failure case
	s.mu.RLock()
	failureHooks := s.onSettleFailureHooks
	s.mu.RUnlock()

	failureCtx := SettleFailureContext{
		SettleContext: hookCtx,
		Error:         settleErr,
	}

	// Execute onSettleFailure hooks
	for _, hook := range failureHooks {
		result, err := hook(failureCtx)
		if err != nil {
			// Log error but continue
		}
		if result != nil && result.Recovered {
			// Hook recovered from failure
			return result.Result, nil
		}
	}

	// No recovery, return original error
	return settleResult, settleErr
}

// FindMatchingRequirements finds requirements that match a payment payload
// Server boundary: takes bytes (payload) + structs (available requirements)
func (s *x402ResourceServer) FindMatchingRequirements(available []PaymentRequirements, payloadBytes []byte) *PaymentRequirements {
	// Detect version from payload
	version, err := types.DetectVersion(payloadBytes)
	if err != nil {
		return nil
	}

	// Check each requirement using version-aware matching
	for _, req := range available {
		reqBytes, err := json.Marshal(req)
		if err != nil {
			continue
		}

		match, err := types.MatchPayloadToRequirements(version, payloadBytes, reqBytes)
		if err == nil && match {
			return &req
		}
	}

	return nil
}

// ProcessPaymentRequest processes a payment request end-to-end
func (s *x402ResourceServer) ProcessPaymentRequest(
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

	// Marshal payment payload to bytes for matching
	payloadBytes, err := json.Marshal(paymentPayload)
	if err != nil {
		return nil, err
	}

	// Find matching requirements
	matchingRequirements := s.FindMatchingRequirements(requirements, payloadBytes)
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

	// Marshal requirements to bytes for verification
	requirementsBytes, err := json.Marshal(matchingRequirements)
	if err != nil {
		return nil, err
	}

	// Verify payment
	verificationResult, err := s.VerifyPayment(ctx, payloadBytes, requirementsBytes)
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
func (s *x402ResourceServer) findSupportedKind(version int, network Network, scheme string) *SupportedKind {
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
func (s *x402ResourceServer) getFacilitatorExtensions(version int, network Network, scheme string) []string {
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
func (s *x402ResourceServer) findFacilitatorForPayment(version int, network Network, scheme string) FacilitatorClient {
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
