package x402

import (
	"context"
	"fmt"
	"sync"

	"github.com/coinbase/x402/go/types"
)

// x402Facilitator manages payment verification and settlement
// Supports both V1 and V2 for legacy interoperability
type x402Facilitator struct {
	mu sync.RWMutex

	// Separate maps for V1 and V2 (V2 uses default name, no suffix)
	schemesV1    map[Network]map[string]SchemeNetworkFacilitatorV1
	schemes      map[Network]map[string]SchemeNetworkFacilitator // V2 (default)
	extrasV1     map[Network]map[string]interface{}
	extras       map[Network]map[string]interface{} // V2 (default)

	extensions []string

	// Lifecycle hooks
	beforeVerifyHooks    []FacilitatorBeforeVerifyHook
	afterVerifyHooks     []FacilitatorAfterVerifyHook
	onVerifyFailureHooks []FacilitatorOnVerifyFailureHook
	beforeSettleHooks    []FacilitatorBeforeSettleHook
	afterSettleHooks     []FacilitatorAfterSettleHook
	onSettleFailureHooks []FacilitatorOnSettleFailureHook
}

func Newx402Facilitator() *x402Facilitator {
	return &x402Facilitator{
		schemesV1:  make(map[Network]map[string]SchemeNetworkFacilitatorV1),
		schemes:    make(map[Network]map[string]SchemeNetworkFacilitator),
		extrasV1:   make(map[Network]map[string]interface{}),
		extras:     make(map[Network]map[string]interface{}),
		extensions: []string{},
	}
}

// RegisterV1 registers a V1 facilitator mechanism (legacy)
func (f *x402Facilitator) RegisterV1(network Network, facilitator SchemeNetworkFacilitatorV1, extra ...interface{}) *x402Facilitator {
	f.mu.Lock()
	defer f.mu.Unlock()

	if f.schemesV1[network] == nil {
		f.schemesV1[network] = make(map[string]SchemeNetworkFacilitatorV1)
	}
	f.schemesV1[network][facilitator.Scheme()] = facilitator

	if len(extra) > 0 {
		if f.extrasV1[network] == nil {
			f.extrasV1[network] = make(map[string]interface{})
		}
		f.extrasV1[network][facilitator.Scheme()] = extra[0]
	}
	return f
}

// Register registers a facilitator mechanism (V2, default)
func (f *x402Facilitator) Register(network Network, facilitator SchemeNetworkFacilitator, extra ...interface{}) *x402Facilitator {
	f.mu.Lock()
	defer f.mu.Unlock()

	if f.schemes[network] == nil {
		f.schemes[network] = make(map[string]SchemeNetworkFacilitator)
	}
	f.schemes[network][facilitator.Scheme()] = facilitator

	if len(extra) > 0 {
		if f.extras[network] == nil {
			f.extras[network] = make(map[string]interface{})
		}
		f.extras[network][facilitator.Scheme()] = extra[0]
	}
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

// ============================================================================
// Hook Registration Methods
// ============================================================================

func (f *x402Facilitator) OnBeforeVerify(hook FacilitatorBeforeVerifyHook) *x402Facilitator {
	f.mu.Lock()
	defer f.mu.Unlock()
	f.beforeVerifyHooks = append(f.beforeVerifyHooks, hook)
	return f
}

func (f *x402Facilitator) OnAfterVerify(hook FacilitatorAfterVerifyHook) *x402Facilitator {
	f.mu.Lock()
	defer f.mu.Unlock()
	f.afterVerifyHooks = append(f.afterVerifyHooks, hook)
	return f
}

func (f *x402Facilitator) OnVerifyFailure(hook FacilitatorOnVerifyFailureHook) *x402Facilitator {
	f.mu.Lock()
	defer f.mu.Unlock()
	f.onVerifyFailureHooks = append(f.onVerifyFailureHooks, hook)
	return f
}

func (f *x402Facilitator) OnBeforeSettle(hook FacilitatorBeforeSettleHook) *x402Facilitator {
	f.mu.Lock()
	defer f.mu.Unlock()
	f.beforeSettleHooks = append(f.beforeSettleHooks, hook)
	return f
}

func (f *x402Facilitator) OnAfterSettle(hook FacilitatorAfterSettleHook) *x402Facilitator {
	f.mu.Lock()
	defer f.mu.Unlock()
	f.afterSettleHooks = append(f.afterSettleHooks, hook)
	return f
}

func (f *x402Facilitator) OnSettleFailure(hook FacilitatorOnSettleFailureHook) *x402Facilitator {
	f.mu.Lock()
	defer f.mu.Unlock()
	f.onSettleFailureHooks = append(f.onSettleFailureHooks, hook)
	return f
}

// ============================================================================
// Core Payment Methods (Network Boundary - uses bytes, routes internally)
// ============================================================================

// Verify verifies a payment (detects version from bytes, routes to typed mechanism)
func (f *x402Facilitator) Verify(ctx context.Context, payloadBytes []byte, requirementsBytes []byte) (VerifyResponse, error) {
	// Detect version
	version, err := types.DetectVersion(payloadBytes)
	if err != nil {
		return VerifyResponse{IsValid: false, InvalidReason: "invalid version"}, err
	}

	// Unmarshal to typed structs for hooks
	var hookPayload PaymentPayloadView
	var hookRequirements PaymentRequirementsView

	// Route to version-specific method
	switch version {
	case 1:
		payload, err := types.ToPaymentPayloadV1(payloadBytes)
		if err != nil {
			return VerifyResponse{IsValid: false, InvalidReason: "invalid V1 payload"}, nil
		}
		requirements, err := types.ToPaymentRequirementsV1(requirementsBytes)
		if err != nil {
			return VerifyResponse{IsValid: false, InvalidReason: "invalid V1 requirements"}, nil
		}
		
		hookPayload = *payload
		hookRequirements = *requirements

		// Execute beforeVerify hooks
		hookCtx := FacilitatorVerifyContext{
			Ctx:               ctx,
			Payload:           hookPayload,
			Requirements:      hookRequirements,
			PayloadBytes:      payloadBytes,
			RequirementsBytes: requirementsBytes,
		}
		for _, hook := range f.beforeVerifyHooks {
			result, err := hook(hookCtx)
			if err != nil {
				return VerifyResponse{IsValid: false, InvalidReason: err.Error()}, err
			}
			if result != nil && result.Abort {
				return VerifyResponse{IsValid: false, InvalidReason: result.Reason}, nil
			}
		}

		// Call mechanism
		verifyResult, verifyErr := f.verifyV1(ctx, *payload, *requirements)

		// Handle failure
		if verifyErr != nil {
			failureCtx := FacilitatorVerifyFailureContext{FacilitatorVerifyContext: hookCtx, Error: verifyErr}
			for _, hook := range f.onVerifyFailureHooks {
				result, _ := hook(failureCtx)
				if result != nil && result.Recovered {
					return result.Result, nil
				}
			}
			return verifyResult, verifyErr
		}

		// Execute afterVerify hooks
		resultCtx := FacilitatorVerifyResultContext{FacilitatorVerifyContext: hookCtx, Result: verifyResult}
		for _, hook := range f.afterVerifyHooks {
			_ = hook(resultCtx) // Log errors but don't fail
		}

		return verifyResult, nil

	case 2:
		payload, err := types.ToPaymentPayload(payloadBytes)
		if err != nil {
			return VerifyResponse{IsValid: false, InvalidReason: "invalid V2 payload"}, nil
		}
		requirements, err := types.ToPaymentRequirements(requirementsBytes)
		if err != nil {
			return VerifyResponse{IsValid: false, InvalidReason: "invalid V2 requirements"}, nil
		}
		
		hookPayload = *payload
		hookRequirements = *requirements

		// Execute beforeVerify hooks
		hookCtx := FacilitatorVerifyContext{
			Ctx:               ctx,
			Payload:           hookPayload,
			Requirements:      hookRequirements,
			PayloadBytes:      payloadBytes,
			RequirementsBytes: requirementsBytes,
		}
		for _, hook := range f.beforeVerifyHooks {
			result, err := hook(hookCtx)
			if err != nil {
				return VerifyResponse{IsValid: false, InvalidReason: err.Error()}, err
			}
			if result != nil && result.Abort {
				return VerifyResponse{IsValid: false, InvalidReason: result.Reason}, nil
			}
		}

		// Call mechanism
		verifyResult, verifyErr := f.verifyV2(ctx, *payload, *requirements)

		// Handle failure
		if verifyErr != nil {
			failureCtx := FacilitatorVerifyFailureContext{FacilitatorVerifyContext: hookCtx, Error: verifyErr}
			for _, hook := range f.onVerifyFailureHooks {
				result, _ := hook(failureCtx)
				if result != nil && result.Recovered {
					return result.Result, nil
				}
			}
			return verifyResult, verifyErr
		}

		// Execute afterVerify hooks
		resultCtx := FacilitatorVerifyResultContext{FacilitatorVerifyContext: hookCtx, Result: verifyResult}
		for _, hook := range f.afterVerifyHooks {
			_ = hook(resultCtx) // Log errors but don't fail
		}

		return verifyResult, nil

	default:
		return VerifyResponse{IsValid: false, InvalidReason: fmt.Sprintf("unsupported version: %d", version)}, nil
	}
}

// Settle settles a payment (detects version from bytes, routes to typed mechanism)
func (f *x402Facilitator) Settle(ctx context.Context, payloadBytes []byte, requirementsBytes []byte) (SettleResponse, error) {
	// Detect version
	version, err := types.DetectVersion(payloadBytes)
	if err != nil {
		return SettleResponse{Success: false, ErrorReason: "invalid version"}, err
	}

	// Unmarshal to typed structs for hooks
	var hookPayload PaymentPayloadView
	var hookRequirements PaymentRequirementsView

	// Route to version-specific method
	switch version {
	case 1:
		payload, err := types.ToPaymentPayloadV1(payloadBytes)
		if err != nil {
			return SettleResponse{Success: false, ErrorReason: "invalid V1 payload"}, nil
		}
		requirements, err := types.ToPaymentRequirementsV1(requirementsBytes)
		if err != nil {
			return SettleResponse{Success: false, ErrorReason: "invalid V1 requirements"}, nil
		}
		
		hookPayload = *payload
		hookRequirements = *requirements

		// Execute beforeSettle hooks
		hookCtx := FacilitatorSettleContext{
			Ctx:               ctx,
			Payload:           hookPayload,
			Requirements:      hookRequirements,
			PayloadBytes:      payloadBytes,
			RequirementsBytes: requirementsBytes,
		}
		for _, hook := range f.beforeSettleHooks {
			result, err := hook(hookCtx)
			if err != nil {
				return SettleResponse{Success: false, ErrorReason: err.Error()}, err
			}
			if result != nil && result.Abort {
				return SettleResponse{Success: false, ErrorReason: result.Reason}, fmt.Errorf("%s", result.Reason)
			}
		}

		// Call mechanism
		settleResult, settleErr := f.settleV1(ctx, *payload, *requirements)

		// Handle failure
		if settleErr != nil {
			failureCtx := FacilitatorSettleFailureContext{FacilitatorSettleContext: hookCtx, Error: settleErr}
			for _, hook := range f.onSettleFailureHooks {
				result, _ := hook(failureCtx)
				if result != nil && result.Recovered {
					return result.Result, nil
				}
			}
			return settleResult, settleErr
		}

		// Execute afterSettle hooks
		resultCtx := FacilitatorSettleResultContext{FacilitatorSettleContext: hookCtx, Result: settleResult}
		for _, hook := range f.afterSettleHooks {
			_ = hook(resultCtx) // Log errors but don't fail
		}

		return settleResult, nil

	case 2:
		payload, err := types.ToPaymentPayload(payloadBytes)
		if err != nil {
			return SettleResponse{Success: false, ErrorReason: "invalid V2 payload"}, nil
		}
		requirements, err := types.ToPaymentRequirements(requirementsBytes)
		if err != nil {
			return SettleResponse{Success: false, ErrorReason: "invalid V2 requirements"}, nil
		}
		
		hookPayload = *payload
		hookRequirements = *requirements

		// Execute beforeSettle hooks
		hookCtx := FacilitatorSettleContext{
			Ctx:               ctx,
			Payload:           hookPayload,
			Requirements:      hookRequirements,
			PayloadBytes:      payloadBytes,
			RequirementsBytes: requirementsBytes,
		}
		for _, hook := range f.beforeSettleHooks {
			result, err := hook(hookCtx)
			if err != nil {
				return SettleResponse{Success: false, ErrorReason: err.Error()}, err
			}
			if result != nil && result.Abort {
				return SettleResponse{Success: false, ErrorReason: result.Reason}, fmt.Errorf("%s", result.Reason)
			}
		}

		// Call mechanism
		settleResult, settleErr := f.settleV2(ctx, *payload, *requirements)

		// Handle failure
		if settleErr != nil {
			failureCtx := FacilitatorSettleFailureContext{FacilitatorSettleContext: hookCtx, Error: settleErr}
			for _, hook := range f.onSettleFailureHooks {
				result, _ := hook(failureCtx)
				if result != nil && result.Recovered {
					return result.Result, nil
				}
			}
			return settleResult, settleErr
		}

		// Execute afterSettle hooks
		resultCtx := FacilitatorSettleResultContext{FacilitatorSettleContext: hookCtx, Result: settleResult}
		for _, hook := range f.afterSettleHooks {
			_ = hook(resultCtx) // Log errors but don't fail
		}

		return settleResult, nil

	default:
		return SettleResponse{Success: false, ErrorReason: fmt.Sprintf("unsupported version: %d", version)}, nil
	}
}

// ============================================================================
// Internal Typed Methods (called after version detection)
// ============================================================================

// verifyV1 verifies a V1 payment (internal, typed)
func (f *x402Facilitator) verifyV1(ctx context.Context, payload types.PaymentPayloadV1, requirements types.PaymentRequirementsV1) (VerifyResponse, error) {
	f.mu.RLock()
	defer f.mu.RUnlock()

	scheme := requirements.Scheme
	network := Network(requirements.Network)

	// Use helper for wildcard matching
	schemes := findSchemesByNetwork(f.schemesV1, network)
	if schemes == nil {
		return VerifyResponse{IsValid: false}, fmt.Errorf("no facilitator for network %s", network)
	}

	facilitator := schemes[scheme]
	if facilitator == nil {
		return VerifyResponse{IsValid: false}, fmt.Errorf("no facilitator for %s on %s", scheme, network)
	}

	return facilitator.Verify(ctx, payload, requirements)
}

// verifyV2 verifies a V2 payment (internal, typed)
func (f *x402Facilitator) verifyV2(ctx context.Context, payload types.PaymentPayload, requirements types.PaymentRequirements) (VerifyResponse, error) {
	f.mu.RLock()
	defer f.mu.RUnlock()

	scheme := requirements.Scheme
	network := Network(requirements.Network)

	// Use helper for wildcard matching
	schemes := findSchemesByNetwork(f.schemes, network)
	if schemes == nil {
		return VerifyResponse{IsValid: false}, fmt.Errorf("no facilitator for network %s", network)
	}

	facilitator := schemes[scheme]
	if facilitator == nil {
		return VerifyResponse{IsValid: false}, fmt.Errorf("no facilitator for %s on %s", scheme, network)
	}

	return facilitator.Verify(ctx, payload, requirements)
}

// settleV1 settles a V1 payment (internal, typed)
func (f *x402Facilitator) settleV1(ctx context.Context, payload types.PaymentPayloadV1, requirements types.PaymentRequirementsV1) (SettleResponse, error) {
	f.mu.RLock()
	defer f.mu.RUnlock()

	scheme := requirements.Scheme
	network := Network(requirements.Network)

	// Use helper for wildcard matching
	schemes := findSchemesByNetwork(f.schemesV1, network)
	if schemes == nil {
		return SettleResponse{Success: false}, fmt.Errorf("no facilitator for network %s", network)
	}

	facilitator := schemes[scheme]
	if facilitator == nil {
		return SettleResponse{Success: false}, fmt.Errorf("no facilitator for %s on %s", scheme, network)
	}

	return facilitator.Settle(ctx, payload, requirements)
}

// settleV2 settles a V2 payment (internal, typed)
func (f *x402Facilitator) settleV2(ctx context.Context, payload types.PaymentPayload, requirements types.PaymentRequirements) (SettleResponse, error) {
	f.mu.RLock()
	defer f.mu.RUnlock()

	scheme := requirements.Scheme
	network := Network(requirements.Network)

	// Use helper for wildcard matching
	schemes := findSchemesByNetwork(f.schemes, network)
	if schemes == nil {
		return SettleResponse{Success: false}, fmt.Errorf("no facilitator for network %s", network)
	}

	facilitator := schemes[scheme]
	if facilitator == nil {
		return SettleResponse{Success: false}, fmt.Errorf("no facilitator for %s on %s", scheme, network)
	}

	return facilitator.Settle(ctx, payload, requirements)
}

// GetSupported returns supported payment kinds
func (f *x402Facilitator) GetSupported() SupportedResponse {
	f.mu.RLock()
	defer f.mu.RUnlock()

	var kinds []SupportedKind

	// V1 schemes
	for network, schemeMap := range f.schemesV1 {
		for scheme := range schemeMap {
			kind := SupportedKind{
				X402Version: 1,
				Scheme:      scheme,
				Network:     string(network),
			}
			if extra := f.extrasV1[network][scheme]; extra != nil {
				if extraMap, ok := extra.(map[string]interface{}); ok {
					kind.Extra = extraMap
				}
			}
			kinds = append(kinds, kind)
		}
	}

	// V2 schemes (default)
	for network, schemeMap := range f.schemes {
		for scheme := range schemeMap {
			kind := SupportedKind{
				X402Version: 2,
				Scheme:      scheme,
				Network:     string(network),
			}
			if extra := f.extras[network][scheme]; extra != nil {
				if extraMap, ok := extra.(map[string]interface{}); ok {
					kind.Extra = extraMap
				}
			}
			kinds = append(kinds, kind)
		}
	}

	return SupportedResponse{
		Kinds:      kinds,
		Extensions: f.extensions,
	}
}
