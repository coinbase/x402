package x402

import (
	"context"
	"encoding/json"
	"fmt"
	"sync"

	"github.com/coinbase/x402/go/types"
)

// x402Client manages payment mechanisms and creates payment payloads
// This is used by applications that need to make payments (have wallets/signers)
type x402Client struct {
	mu sync.RWMutex

	// Nested map: version -> network -> scheme -> client implementation
	// This allows multiple versions and network patterns
	schemes map[int]map[Network]map[string]SchemeNetworkClient

	// Function to select payment requirements when multiple options exist
	requirementsSelector PaymentRequirementsSelector
}

// PaymentRequirementsSelector chooses which payment option to use
type PaymentRequirementsSelector func(version int, requirements []PaymentRequirements) PaymentRequirements

// ClientOption configures the client
type ClientOption func(*x402Client)

// WithPaymentSelector sets a custom payment requirements selector
func WithPaymentSelector(selector PaymentRequirementsSelector) ClientOption {
	return func(c *x402Client) {
		c.requirementsSelector = selector
	}
}

// WithScheme registers a payment mechanism at creation time
func WithScheme(version int, network Network, client SchemeNetworkClient) ClientOption {
	return func(c *x402Client) {
		c.registerScheme(version, network, client)
	}
}

// Newx402Client creates a new x402 client
func Newx402Client(opts ...ClientOption) *x402Client {
	c := &x402Client{
		schemes:              make(map[int]map[Network]map[string]SchemeNetworkClient),
		requirementsSelector: defaultPaymentSelector,
	}

	for _, opt := range opts {
		opt(c)
	}

	return c
}

// defaultPaymentSelector chooses the first available payment option
func defaultPaymentSelector(version int, requirements []PaymentRequirements) PaymentRequirements {
	if len(requirements) == 0 {
		panic("no payment requirements available")
	}
	return requirements[0]
}

// RegisterScheme registers a payment mechanism for protocol v2
func (c *x402Client) RegisterScheme(network Network, client SchemeNetworkClient) *x402Client {
	return c.registerScheme(ProtocolVersion, network, client)
}

// RegisterSchemeV1 registers a payment mechanism for protocol v1
func (c *x402Client) RegisterSchemeV1(network Network, client SchemeNetworkClient) *x402Client {
	return c.registerScheme(ProtocolVersionV1, network, client)
}

// registerScheme internal method to register schemes
func (c *x402Client) registerScheme(version int, network Network, client SchemeNetworkClient) *x402Client {
	c.mu.Lock()
	defer c.mu.Unlock()

	// Initialize nested maps if needed
	if c.schemes[version] == nil {
		c.schemes[version] = make(map[Network]map[string]SchemeNetworkClient)
	}
	if c.schemes[version][network] == nil {
		c.schemes[version][network] = make(map[string]SchemeNetworkClient)
	}

	// Register the client for this scheme
	c.schemes[version][network][client.Scheme()] = client

	return c
}

// SelectPaymentRequirements chooses which payment requirements to use
// This filters requirements to only those the client can fulfill
func (c *x402Client) SelectPaymentRequirements(version int, requirements []PaymentRequirements) (PaymentRequirements, error) {
	c.mu.RLock()
	defer c.mu.RUnlock()

	versionSchemes, exists := c.schemes[version]
	if !exists {
		return PaymentRequirements{}, fmt.Errorf("no schemes registered for x402 version %d", version)
	}

	// Filter to only supported requirements
	var supported []PaymentRequirements
	for _, req := range requirements {
		schemeMap := findSchemesByNetwork(versionSchemes, req.Network)
		if schemeMap != nil {
			if _, hasScheme := schemeMap[req.Scheme]; hasScheme {
				supported = append(supported, req)
			}
		}
	}

	if len(supported) == 0 {
		return PaymentRequirements{}, &PaymentError{
			Code:    ErrCodeUnsupportedScheme,
			Message: "no supported payment schemes available",
			Details: map[string]interface{}{
				"version":      version,
				"requirements": requirements,
			},
		}
	}

	// Use selector to choose from supported options
	return c.requirementsSelector(version, supported), nil
}

// CreatePaymentPayload creates a signed payment payload
// For v2: mechanism returns partial, core wraps with accepted/resource/extensions
// For v1: mechanism returns complete payload
func (c *x402Client) CreatePaymentPayload(
	ctx context.Context,
	version int,
	requirementsBytes []byte,
	resource *types.ResourceInfoV2,
	extensions map[string]interface{},
) ([]byte, error) {
	c.mu.RLock()
	defer c.mu.RUnlock()

	// Extract scheme/network for routing
	info, err := types.ExtractRequirementsInfo(requirementsBytes)
	if err != nil {
		return nil, fmt.Errorf("failed to extract requirements info: %w", err)
	}

	// Find the appropriate client for the specified version
	versionSchemes, exists := c.schemes[version]
	if !exists {
		return nil, fmt.Errorf("no schemes registered for x402 version %d", version)
	}

	client := findByNetworkAndScheme(versionSchemes, info.Scheme, Network(info.Network))
	if client == nil {
		return nil, &PaymentError{
			Code:    ErrCodeUnsupportedScheme,
			Message: fmt.Sprintf("no client registered for scheme %s on network %s for version %d", info.Scheme, info.Network, version),
		}
	}

	// Create payment payload using mechanism
	// V1 returns complete, V2 returns partial
	payloadBytes, err := client.CreatePaymentPayload(ctx, version, requirementsBytes)
	if err != nil {
		return nil, fmt.Errorf("failed to create payment payload: %w", err)
	}

	// For v1: return as-is (mechanism included scheme/network)
	if version == 1 {
		return payloadBytes, nil
	}

	// For v2: wrap partial with accepted/resource/extensions
	return c.wrapV2Payload(payloadBytes, requirementsBytes, resource, extensions)
}

// wrapV2Payload wraps a partial v2 payload with accepted/resource/extensions
func (c *x402Client) wrapV2Payload(
	partialPayloadBytes []byte,
	requirementsBytes []byte,
	resource *types.ResourceInfoV2,
	extensions map[string]interface{},
) ([]byte, error) {
	// Unmarshal partial payload (just version + payload field)
	partial, err := types.ToPayloadBase(partialPayloadBytes)
	if err != nil {
		return nil, err
	}

	// Unmarshal requirements to get accepted field
	requirements, err := types.ToPaymentRequirementsV2(requirementsBytes)
	if err != nil {
		return nil, err
	}

	// Build complete v2 payload
	complete := types.PaymentPayloadV2{
		X402Version: partial.X402Version,
		Payload:     partial.Payload,
		Accepted:    *requirements,
		Resource:    resource,
		Extensions:  extensions,
	}

	return json.Marshal(complete)
}

// GetRegisteredSchemes returns a list of registered schemes for debugging
func (c *x402Client) GetRegisteredSchemes() map[int][]struct {
	Network Network
	Scheme  string
} {
	c.mu.RLock()
	defer c.mu.RUnlock()

	result := make(map[int][]struct {
		Network Network
		Scheme  string
	})

	for version, versionSchemes := range c.schemes {
		for network, schemes := range versionSchemes {
			for scheme := range schemes {
				result[version] = append(result[version], struct {
					Network Network
					Scheme  string
				}{
					Network: network,
					Scheme:  scheme,
				})
			}
		}
	}

	return result
}

// CanPay checks if the client can pay with any of the given requirements
func (c *x402Client) CanPay(version int, requirements []PaymentRequirements) bool {
	_, err := c.SelectPaymentRequirements(version, requirements)
	return err == nil
}

// CreatePaymentForRequired creates a payment for a PaymentRequired response
// Bridge method: keeps struct API, uses bytes internally
func (c *x402Client) CreatePaymentForRequired(ctx context.Context, required PaymentRequired) (PaymentPayload, error) {
	// Select appropriate requirements
	selected, err := c.SelectPaymentRequirements(required.X402Version, required.Accepts)
	if err != nil {
		return PaymentPayload{}, err
	}

	// Marshal selected requirements to bytes
	selectedBytes, err := json.Marshal(selected)
	if err != nil {
		return PaymentPayload{}, err
	}

	// Marshal resource to v2 type if present
	var resourceV2 *types.ResourceInfoV2
	if required.Resource != nil {
		resourceV2 = &types.ResourceInfoV2{
			URL:         required.Resource.URL,
			Description: required.Resource.Description,
			MimeType:    required.Resource.MimeType,
		}
	}

	// Call bytes-based CreatePaymentPayload
	payloadBytes, err := c.CreatePaymentPayload(ctx, required.X402Version, selectedBytes, resourceV2, required.Extensions)
	if err != nil {
		return PaymentPayload{}, err
	}

	// Unmarshal back to struct for backward compat
	var payload PaymentPayload
	if err := json.Unmarshal(payloadBytes, &payload); err != nil {
		return PaymentPayload{}, err
	}

	return payload, nil
}
