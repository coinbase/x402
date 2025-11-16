package x402

import (
	"context"
	"encoding/json"
	"fmt"
	"sync"

	"github.com/coinbase/x402/go/types"
)

type x402Facilitator struct {
	mu sync.RWMutex
	schemes map[int]map[Network]map[string]SchemeNetworkFacilitator
	schemeExtras map[int]map[Network]map[string]interface{}
	extensions []string
	
	// Lifecycle hooks
	beforeVerifyHooks     []FacilitatorBeforeVerifyHook
	afterVerifyHooks      []FacilitatorAfterVerifyHook
	onVerifyFailureHooks  []FacilitatorOnVerifyFailureHook
	beforeSettleHooks     []FacilitatorBeforeSettleHook
	afterSettleHooks      []FacilitatorAfterSettleHook
	onSettleFailureHooks  []FacilitatorOnSettleFailureHook
}

func Newx402Facilitator() *x402Facilitator {
	return &x402Facilitator{
		schemes:      make(map[int]map[Network]map[string]SchemeNetworkFacilitator),
		schemeExtras: make(map[int]map[Network]map[string]interface{}),
		extensions:   []string{},
	}
}

func (f *x402Facilitator) RegisterScheme(network Network, facilitator SchemeNetworkFacilitator, extra ...interface{}) *x402Facilitator {
	var extraData interface{}
	if len(extra) > 0 {
		extraData = extra[0]
	}
	return f.registerScheme(ProtocolVersion, network, facilitator, extraData)
}

func (f *x402Facilitator) RegisterSchemeV1(network Network, facilitator SchemeNetworkFacilitator, extra ...interface{}) *x402Facilitator {
	var extraData interface{}
	if len(extra) > 0 {
		extraData = extra[0]
	}
	return f.registerScheme(ProtocolVersionV1, network, facilitator, extraData)
}

func (f *x402Facilitator) registerScheme(version int, network Network, facilitator SchemeNetworkFacilitator, extra interface{}) *x402Facilitator {
	f.mu.Lock()
	defer f.mu.Unlock()

	if f.schemes[version] == nil {
		f.schemes[version] = make(map[Network]map[string]SchemeNetworkFacilitator)
	}
	if f.schemes[version][network] == nil {
		f.schemes[version][network] = make(map[string]SchemeNetworkFacilitator)
	}

	f.schemes[version][network][facilitator.Scheme()] = facilitator

	if extra != nil {
		if f.schemeExtras[version] == nil {
			f.schemeExtras[version] = make(map[Network]map[string]interface{})
		}
		if f.schemeExtras[version][network] == nil {
			f.schemeExtras[version][network] = make(map[string]interface{})
		}
		f.schemeExtras[version][network][facilitator.Scheme()] = extra
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
// Facilitator Hook Registration Methods (Chainable)
// ============================================================================

// OnBeforeVerify registers a hook to execute before facilitator payment verification
// Can abort verification by returning a result with Abort=true
//
// Args:
//   hook: The hook function to register
//
// Returns:
//   The facilitator instance for chaining
func (f *x402Facilitator) OnBeforeVerify(hook FacilitatorBeforeVerifyHook) *x402Facilitator {
	f.mu.Lock()
	defer f.mu.Unlock()
	f.beforeVerifyHooks = append(f.beforeVerifyHooks, hook)
	return f
}

// OnAfterVerify registers a hook to execute after successful facilitator payment verification
//
// Args:
//   hook: The hook function to register
//
// Returns:
//   The facilitator instance for chaining
func (f *x402Facilitator) OnAfterVerify(hook FacilitatorAfterVerifyHook) *x402Facilitator {
	f.mu.Lock()
	defer f.mu.Unlock()
	f.afterVerifyHooks = append(f.afterVerifyHooks, hook)
	return f
}

// OnVerifyFailure registers a hook to execute when facilitator payment verification fails
// Can recover from failure by returning a result with Recovered=true
//
// Args:
//   hook: The hook function to register
//
// Returns:
//   The facilitator instance for chaining
func (f *x402Facilitator) OnVerifyFailure(hook FacilitatorOnVerifyFailureHook) *x402Facilitator {
	f.mu.Lock()
	defer f.mu.Unlock()
	f.onVerifyFailureHooks = append(f.onVerifyFailureHooks, hook)
	return f
}

// OnBeforeSettle registers a hook to execute before facilitator payment settlement
// Can abort settlement by returning a result with Abort=true
//
// Args:
//   hook: The hook function to register
//
// Returns:
//   The facilitator instance for chaining
func (f *x402Facilitator) OnBeforeSettle(hook FacilitatorBeforeSettleHook) *x402Facilitator {
	f.mu.Lock()
	defer f.mu.Unlock()
	f.beforeSettleHooks = append(f.beforeSettleHooks, hook)
	return f
}

// OnAfterSettle registers a hook to execute after successful facilitator payment settlement
//
// Args:
//   hook: The hook function to register
//
// Returns:
//   The facilitator instance for chaining
func (f *x402Facilitator) OnAfterSettle(hook FacilitatorAfterSettleHook) *x402Facilitator {
	f.mu.Lock()
	defer f.mu.Unlock()
	f.afterSettleHooks = append(f.afterSettleHooks, hook)
	return f
}

// OnSettleFailure registers a hook to execute when facilitator payment settlement fails
// Can recover from failure by returning a result with Recovered=true
//
// Args:
//   hook: The hook function to register
//
// Returns:
//   The facilitator instance for chaining
func (f *x402Facilitator) OnSettleFailure(hook FacilitatorOnSettleFailureHook) *x402Facilitator {
	f.mu.Lock()
	defer f.mu.Unlock()
	f.onSettleFailureHooks = append(f.onSettleFailureHooks, hook)
	return f
}

// Verify checks if a payment is valid without executing it
// Bridge method: keeps struct API, uses bytes internally
//
// Args:
//   ctx: Context for cancellation and metadata
//   payload: Payment payload struct
//   requirements: Payment requirements struct
//
// Returns:
//   VerifyResponse and error if verification fails
func (f *x402Facilitator) Verify(ctx context.Context, payload PaymentPayload, requirements PaymentRequirements) (VerifyResponse, error) {
	// Build hook context
	hookCtx := FacilitatorVerifyContext{
		Ctx:                 ctx,
		PaymentPayload:      payload,
		PaymentRequirements: requirements,
	}
	
	// Execute beforeVerify hooks
	f.mu.RLock()
	beforeHooks := f.beforeVerifyHooks
	f.mu.RUnlock()
	
	for _, hook := range beforeHooks {
		result, err := hook(hookCtx)
		if err != nil {
			// Log error but continue (hook errors don't abort)
		}
		if result != nil && result.Abort {
			return VerifyResponse{
				IsValid:       false,
				InvalidReason: result.Reason,
			}, nil
		}
	}
	
	// Perform verification
	f.mu.RLock()
	defer f.mu.RUnlock()
	
	var verifyResult VerifyResponse
	var verifyErr error

	// Marshal to bytes for mechanism
	payloadBytes, err := json.Marshal(payload)
	if err != nil {
		verifyErr = err
		verifyResult = VerifyResponse{IsValid: false}
	} else {
		requirementsBytes, err := json.Marshal(requirements)
		if err != nil {
			verifyErr = err
			verifyResult = VerifyResponse{IsValid: false}
		} else {
			// Detect version
			version, err := types.DetectVersion(payloadBytes)
			if err != nil {
				verifyErr = err
				verifyResult = VerifyResponse{IsValid: false}
			} else {
				// Extract scheme/network from requirements for routing
				reqInfo, err := types.ExtractRequirementsInfo(requirementsBytes)
				if err != nil {
					verifyErr = err
					verifyResult = VerifyResponse{IsValid: false}
				} else {
					// Find facilitator for this version
					versionSchemes, exists := f.schemes[version]
					if !exists {
						verifyErr = &PaymentError{
							Code:    ErrCodeInvalidPayment,
							Message: fmt.Sprintf("x402 version %d not supported", version),
						}
						verifyResult = VerifyResponse{
							IsValid:       false,
							InvalidReason: fmt.Sprintf("unsupported x402 version: %d", version),
						}
					} else {
						// Find the appropriate facilitator by scheme/network
						facilitator := findByNetworkAndScheme(versionSchemes, reqInfo.Scheme, Network(reqInfo.Network))
						if facilitator == nil {
							verifyErr = &PaymentError{
								Code:    ErrCodeUnsupportedScheme,
								Message: fmt.Sprintf("no facilitator for scheme %s on network %s", reqInfo.Scheme, reqInfo.Network),
							}
							verifyResult = VerifyResponse{
								IsValid:       false,
								InvalidReason: fmt.Sprintf("unsupported scheme %s on network %s", reqInfo.Scheme, reqInfo.Network),
							}
						} else {
							// Delegate to mechanism (mechanism unmarshals to version-specific types)
							verifyResult, verifyErr = facilitator.Verify(ctx, version, payloadBytes, requirementsBytes)
						}
					}
				}
			}
		}
	}
	
	// Handle success case
	if verifyErr == nil {
		// Execute afterVerify hooks
		f.mu.RLock()
		afterHooks := f.afterVerifyHooks
		f.mu.RUnlock()
		
		resultCtx := FacilitatorVerifyResultContext{
			FacilitatorVerifyContext: hookCtx,
			Result:                   verifyResult,
		}
		
		for _, hook := range afterHooks {
			if err := hook(resultCtx); err != nil {
				// Log error but don't fail the verification
			}
		}
		
		return verifyResult, nil
	}
	
	// Handle failure case
	f.mu.RLock()
	failureHooks := f.onVerifyFailureHooks
	f.mu.RUnlock()
	
	failureCtx := FacilitatorVerifyFailureContext{
		FacilitatorVerifyContext: hookCtx,
		Error:                    verifyErr,
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

// Settle executes a payment on-chain
// Bridge method: keeps struct API, uses bytes internally
//
// Args:
//   ctx: Context for cancellation and metadata
//   payload: Payment payload struct
//   requirements: Payment requirements struct
//
// Returns:
//   SettleResponse and error if settlement fails
func (f *x402Facilitator) Settle(ctx context.Context, payload PaymentPayload, requirements PaymentRequirements) (SettleResponse, error) {
	// Build hook context
	hookCtx := FacilitatorSettleContext{
		Ctx:                 ctx,
		PaymentPayload:      payload,
		PaymentRequirements: requirements,
	}
	
	// Execute beforeSettle hooks
	f.mu.RLock()
	beforeHooks := f.beforeSettleHooks
	f.mu.RUnlock()
	
	for _, hook := range beforeHooks {
		result, err := hook(hookCtx)
		if err != nil {
			// Log error but continue (hook errors don't abort)
		}
		if result != nil && result.Abort {
			return SettleResponse{
				Success:     false,
				ErrorReason: fmt.Sprintf("Settlement aborted: %s", result.Reason),
			}, fmt.Errorf("settlement aborted: %s", result.Reason)
		}
	}
	
	// Perform settlement
	f.mu.RLock()
	defer f.mu.RUnlock()
	
	var settleResult SettleResponse
	var settleErr error

	// Marshal to bytes for mechanism
	payloadBytes, err := json.Marshal(payload)
	if err != nil {
		settleErr = err
		settleResult = SettleResponse{Success: false}
	} else {
		requirementsBytes, err := json.Marshal(requirements)
		if err != nil {
			settleErr = err
			settleResult = SettleResponse{Success: false}
		} else {
			// Detect version
			version, err := types.DetectVersion(payloadBytes)
			if err != nil {
				settleErr = err
				settleResult = SettleResponse{Success: false}
			} else {
				// Extract scheme/network for routing
				reqInfo, err := types.ExtractRequirementsInfo(requirementsBytes)
				if err != nil {
					settleErr = err
					settleResult = SettleResponse{Success: false}
				} else {
					// Find facilitator
					versionSchemes, exists := f.schemes[version]
					if !exists {
						settleErr = &PaymentError{
							Code:    ErrCodeInvalidPayment,
							Message: fmt.Sprintf("x402 version %d not supported", version),
						}
						settleResult = SettleResponse{
							Success:     false,
							ErrorReason: fmt.Sprintf("unsupported x402 version: %d", version),
							Network:     payload.Accepted.Network,
						}
					} else {
						facilitator := findByNetworkAndScheme(versionSchemes, reqInfo.Scheme, Network(reqInfo.Network))
						if facilitator == nil {
							settleErr = &PaymentError{
								Code:    ErrCodeUnsupportedScheme,
								Message: fmt.Sprintf("no facilitator for scheme %s on network %s", reqInfo.Scheme, reqInfo.Network),
							}
							settleResult = SettleResponse{
								Success:     false,
								ErrorReason: fmt.Sprintf("unsupported scheme %s on network %s", reqInfo.Scheme, reqInfo.Network),
								Network:     payload.Accepted.Network,
							}
						} else {
							// Delegate to mechanism
							settleResult, settleErr = facilitator.Settle(ctx, version, payloadBytes, requirementsBytes)
						}
					}
				}
			}
		}
	}
	
	// Handle success case
	if settleErr == nil && settleResult.Success {
		// Execute afterSettle hooks
		f.mu.RLock()
		afterHooks := f.afterSettleHooks
		f.mu.RUnlock()
		
		resultCtx := FacilitatorSettleResultContext{
			FacilitatorSettleContext: hookCtx,
			Result:                   settleResult,
		}
		
		for _, hook := range afterHooks {
			if err := hook(resultCtx); err != nil {
				// Log error but don't fail the settlement
			}
		}
		
		return settleResult, nil
	}
	
	// Handle failure case
	f.mu.RLock()
	failureHooks := f.onSettleFailureHooks
	f.mu.RUnlock()
	
	failureCtx := FacilitatorSettleFailureContext{
		FacilitatorSettleContext: hookCtx,
		Error:                    settleErr,
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

func (f *x402Facilitator) GetSupported() SupportedResponse {
	f.mu.RLock()
	defer f.mu.RUnlock()

	response := SupportedResponse{
		Kinds:      []SupportedKind{},
		Extensions: f.extensions,
	}

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

func (f *x402Facilitator) BuildSupported(networks []Network) SupportedResponse {
	f.mu.RLock()
	defer f.mu.RUnlock()

	kinds := []SupportedKind{}

	for _, concreteNetwork := range networks {
		for version, versionSchemes := range f.schemes {
			for registeredPattern, schemes := range versionSchemes {
				if !concreteNetwork.Match(registeredPattern) {
					continue
				}

				for scheme := range schemes {
					kind := SupportedKind{
						X402Version: version,
						Scheme:      scheme,
						Network:     concreteNetwork,
					}

					if f.schemeExtras[version] != nil &&
						f.schemeExtras[version][registeredPattern] != nil {
						if extra := f.schemeExtras[version][registeredPattern][scheme]; extra != nil {
							if fn, ok := extra.(func() map[string]interface{}); ok {
								kind.Extra = fn()
							} else if extraMap, ok := extra.(map[string]interface{}); ok {
								kind.Extra = extraMap
							}
						}
					}

					kinds = append(kinds, kind)
				}
			}
		}
	}

	var extensions []string
	if len(f.extensions) > 0 {
		extensions = f.extensions
	}

	return SupportedResponse{
		Kinds:      kinds,
		Extensions: extensions,
	}
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
// Bridge: converts bytes to structs for x402Facilitator
func (c *LocalFacilitatorClient) Verify(ctx context.Context, payloadBytes []byte, requirementsBytes []byte) (VerifyResponse, error) {
	// Unmarshal to structs (x402Facilitator uses struct API)
	var payload PaymentPayload
	if err := json.Unmarshal(payloadBytes, &payload); err != nil {
		return VerifyResponse{IsValid: false}, err
	}
	
	var requirements PaymentRequirements
	if err := json.Unmarshal(requirementsBytes, &requirements); err != nil {
		return VerifyResponse{IsValid: false}, err
	}
	
	return c.facilitator.Verify(ctx, payload, requirements)
}

// Settle implements FacilitatorClient
// Bridge: converts bytes to structs for x402Facilitator
func (c *LocalFacilitatorClient) Settle(ctx context.Context, payloadBytes []byte, requirementsBytes []byte) (SettleResponse, error) {
	// Unmarshal to structs (x402Facilitator uses struct API)
	var payload PaymentPayload
	if err := json.Unmarshal(payloadBytes, &payload); err != nil {
		return SettleResponse{Success: false}, err
	}
	
	var requirements PaymentRequirements
	if err := json.Unmarshal(requirementsBytes, &requirements); err != nil {
		return SettleResponse{Success: false}, err
	}
	
	return c.facilitator.Settle(ctx, payload, requirements)
}

// GetSupported implements FacilitatorClient
func (c *LocalFacilitatorClient) GetSupported(ctx context.Context) (SupportedResponse, error) {
	return c.facilitator.GetSupported(), nil
}
