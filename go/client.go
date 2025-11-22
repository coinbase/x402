package x402

import (
	"context"
	"fmt"
	"sync"

	"github.com/coinbase/x402/go/types"
)

// x402Client manages payment mechanisms and creates payment payloads
// This is used by applications that need to make payments (have wallets/signers)
type x402Client struct {
	mu sync.RWMutex

	// Separate maps for V1 and V2 (V2 uses default name, no suffix)
	schemesV1 map[Network]map[string]SchemeNetworkClientV1
	schemes   map[Network]map[string]SchemeNetworkClient // V2 (default)

	// Single selector/policies - work with unified view
	requirementsSelector PaymentRequirementsSelector
	policies             []PaymentPolicy

	// Lifecycle hooks
	beforePaymentCreationHooks    []BeforePaymentCreationHook
	afterPaymentCreationHooks     []AfterPaymentCreationHook
	onPaymentCreationFailureHooks []OnPaymentCreationFailureHook
}

// ClientOption configures the client
type ClientOption func(*x402Client)

// WithPaymentSelector sets a custom payment requirements selector
func WithPaymentSelector(selector PaymentRequirementsSelector) ClientOption {
	return func(c *x402Client) {
		c.requirementsSelector = selector
	}
}

// WithPolicy registers a payment policy at creation time
func WithPolicy(policy PaymentPolicy) ClientOption {
	return func(c *x402Client) {
		c.policies = append(c.policies, policy)
	}
}

// Newx402Client creates a new x402 client
func Newx402Client(opts ...ClientOption) *x402Client {
	c := &x402Client{
		schemesV1:            make(map[Network]map[string]SchemeNetworkClientV1),
		schemes:              make(map[Network]map[string]SchemeNetworkClient),
		requirementsSelector: DefaultPaymentSelector,
		policies:             []PaymentPolicy{},
	}

	for _, opt := range opts {
		opt(c)
	}

	return c
}

// RegisterV1 registers a V1 payment mechanism
func (c *x402Client) RegisterV1(network Network, client SchemeNetworkClientV1) *x402Client {
	c.mu.Lock()
	defer c.mu.Unlock()

	if c.schemesV1[network] == nil {
		c.schemesV1[network] = make(map[string]SchemeNetworkClientV1)
	}
	c.schemesV1[network][client.Scheme()] = client
	return c
}

// Register registers a payment mechanism (V2, default)
func (c *x402Client) Register(network Network, client SchemeNetworkClient) *x402Client {
	c.mu.Lock()
	defer c.mu.Unlock()

	if c.schemes[network] == nil {
		c.schemes[network] = make(map[string]SchemeNetworkClient)
	}
	c.schemes[network][client.Scheme()] = client
	return c
}

// RegisterPolicy registers a policy to filter or transform payment requirements
func (c *x402Client) RegisterPolicy(policy PaymentPolicy) *x402Client {
	c.mu.Lock()
	defer c.mu.Unlock()
	c.policies = append(c.policies, policy)
	return c
}

// OnBeforePaymentCreation registers a hook to execute before payment payload creation
func (c *x402Client) OnBeforePaymentCreation(hook BeforePaymentCreationHook) *x402Client {
	c.mu.Lock()
	defer c.mu.Unlock()
	c.beforePaymentCreationHooks = append(c.beforePaymentCreationHooks, hook)
	return c
}

// OnAfterPaymentCreation registers a hook to execute after successful payment payload creation
func (c *x402Client) OnAfterPaymentCreation(hook AfterPaymentCreationHook) *x402Client {
	c.mu.Lock()
	defer c.mu.Unlock()
	c.afterPaymentCreationHooks = append(c.afterPaymentCreationHooks, hook)
	return c
}

// OnPaymentCreationFailure registers a hook to execute when payment payload creation fails
func (c *x402Client) OnPaymentCreationFailure(hook OnPaymentCreationFailureHook) *x402Client {
	c.mu.Lock()
	defer c.mu.Unlock()
	c.onPaymentCreationFailureHooks = append(c.onPaymentCreationFailureHooks, hook)
	return c
}

// SelectPaymentRequirementsV1 selects a V1 payment requirement
func (c *x402Client) SelectPaymentRequirementsV1(requirements []types.PaymentRequirementsV1) (types.PaymentRequirementsV1, error) {
	c.mu.RLock()
	defer c.mu.RUnlock()

	// Filter to supported (use wildcard matching helper)
	var supported []types.PaymentRequirementsV1
	for _, req := range requirements {
		network := Network(req.Network)
		schemes := findSchemesByNetwork(c.schemesV1, network)
		if schemes != nil {
			if _, ok := schemes[req.Scheme]; ok {
				supported = append(supported, req)
			}
		}
	}

	if len(supported) == 0 {
		return types.PaymentRequirementsV1{}, &PaymentError{
			Code:    ErrCodeUnsupportedScheme,
			Message: "no supported payment schemes available",
		}
	}

	// Convert to views for selector/policies
	views := toViews(supported)

	// Apply policies
	filtered := views
	for _, policy := range c.policies {
		filtered = policy(filtered)
		if len(filtered) == 0 {
			return types.PaymentRequirementsV1{}, &PaymentError{
				Code:    ErrCodeUnsupportedScheme,
				Message: "all payment requirements were filtered out by policies",
			}
		}
	}

	// Select final and convert back
	selected := c.requirementsSelector(filtered)
	return fromView[types.PaymentRequirementsV1](selected), nil
}

// SelectPaymentRequirements selects a payment requirement (V2, default)
func (c *x402Client) SelectPaymentRequirements(requirements []types.PaymentRequirements) (types.PaymentRequirements, error) {
	c.mu.RLock()
	defer c.mu.RUnlock()

	// Filter to supported (use wildcard matching helper)
	var supported []types.PaymentRequirements
	for _, req := range requirements {
		network := Network(req.Network)
		schemes := findSchemesByNetwork(c.schemes, network)
		if schemes != nil {
			if _, ok := schemes[req.Scheme]; ok {
				supported = append(supported, req)
			}
		}
	}

	if len(supported) == 0 {
		return types.PaymentRequirements{}, &PaymentError{
			Code:    ErrCodeUnsupportedScheme,
			Message: "no supported payment schemes available",
		}
	}

	// Convert to views for selector/policies
	views := toViews(supported)

	// Apply policies
	filtered := views
	for _, policy := range c.policies {
		filtered = policy(filtered)
		if len(filtered) == 0 {
			return types.PaymentRequirements{}, &PaymentError{
				Code:    ErrCodeUnsupportedScheme,
				Message: "all payment requirements were filtered out by policies",
			}
		}
	}

	// Select final and convert back
	selected := c.requirementsSelector(filtered)
	return fromView[types.PaymentRequirements](selected), nil
}

// CreatePaymentPayloadV1 creates a V1 payment payload
func (c *x402Client) CreatePaymentPayloadV1(
	ctx context.Context,
	requirements types.PaymentRequirementsV1,
) (types.PaymentPayloadV1, error) {
	c.mu.RLock()
	defer c.mu.RUnlock()

	// Direct field access for routing
	scheme := requirements.Scheme
	network := Network(requirements.Network)

	// Use wildcard matching helper
	schemes := findSchemesByNetwork(c.schemesV1, network)
	if schemes == nil {
		return types.PaymentPayloadV1{}, &PaymentError{
			Code:    ErrCodeUnsupportedScheme,
			Message: fmt.Sprintf("no client registered for network %s", network),
		}
	}

	client := schemes[scheme]
	if client == nil {
		return types.PaymentPayloadV1{}, &PaymentError{
			Code:    ErrCodeUnsupportedScheme,
			Message: fmt.Sprintf("no client registered for scheme %s on network %s", scheme, network),
		}
	}

	return client.CreatePaymentPayload(ctx, requirements)
}

// CreatePaymentPayload creates a payment payload (V2, default)
func (c *x402Client) CreatePaymentPayload(
	ctx context.Context,
	requirements types.PaymentRequirements,
	resource *types.ResourceInfo,
	extensions map[string]interface{},
) (types.PaymentPayload, error) {
	c.mu.RLock()
	defer c.mu.RUnlock()

	scheme := requirements.Scheme
	network := Network(requirements.Network)

	// Use wildcard matching helper
	schemes := findSchemesByNetwork(c.schemes, network)
	if schemes == nil {
		return types.PaymentPayload{}, &PaymentError{
			Code:    ErrCodeUnsupportedScheme,
			Message: fmt.Sprintf("no client registered for network %s", network),
		}
	}

	client := schemes[scheme]
	if client == nil {
		return types.PaymentPayload{}, &PaymentError{
			Code:    ErrCodeUnsupportedScheme,
			Message: fmt.Sprintf("no client registered for scheme %s on network %s", scheme, network),
		}
	}

	// Get partial payload from mechanism
	partial, err := client.CreatePaymentPayload(ctx, requirements)
	if err != nil {
		return types.PaymentPayload{}, err
	}

	// Wrap with accepted/resource/extensions
	partial.Accepted = requirements
	partial.Resource = resource
	partial.Extensions = extensions

	return partial, nil
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

	// V1 schemes
	for network, schemes := range c.schemesV1 {
		for scheme := range schemes {
			result[1] = append(result[1], struct {
				Network Network
				Scheme  string
			}{
				Network: network,
				Scheme:  scheme,
			})
		}
	}

	// V2 schemes
	for network, schemeMap := range c.schemes {
		for scheme := range schemeMap {
			result[2] = append(result[2], struct {
				Network Network
				Scheme  string
			}{
				Network: network,
				Scheme:  scheme,
			})
		}
	}

	return result
}

// Helper functions use the generic findSchemesByNetwork from utils.go
