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

// Verify checks if a payment is valid without executing it
// Bridge method: keeps struct API, uses bytes internally
func (f *x402Facilitator) Verify(ctx context.Context, payload PaymentPayload, requirements PaymentRequirements) (VerifyResponse, error) {
	f.mu.RLock()
	defer f.mu.RUnlock()

	// Marshal to bytes for mechanism
	payloadBytes, err := json.Marshal(payload)
	if err != nil {
		return VerifyResponse{IsValid: false}, err
	}

	requirementsBytes, err := json.Marshal(requirements)
	if err != nil {
		return VerifyResponse{IsValid: false}, err
	}

	// Detect version
	version, err := types.DetectVersion(payloadBytes)
	if err != nil {
		return VerifyResponse{IsValid: false}, err
	}

	// Extract scheme/network from requirements for routing
	reqInfo, err := types.ExtractRequirementsInfo(requirementsBytes)
	if err != nil {
		return VerifyResponse{IsValid: false}, err
	}

	// Find facilitator for this version
	versionSchemes, exists := f.schemes[version]
	if !exists {
		return VerifyResponse{
				IsValid:       false,
			InvalidReason: fmt.Sprintf("unsupported x402 version: %d", version),
			}, &PaymentError{
				Code:    ErrCodeInvalidPayment,
			Message: fmt.Sprintf("x402 version %d not supported", version),
			}
	}

	// Find the appropriate facilitator by scheme/network
	facilitator := findByNetworkAndScheme(versionSchemes, reqInfo.Scheme, Network(reqInfo.Network))
	if facilitator == nil {
		return VerifyResponse{
				IsValid:       false,
			InvalidReason: fmt.Sprintf("unsupported scheme %s on network %s", reqInfo.Scheme, reqInfo.Network),
			}, &PaymentError{
				Code:    ErrCodeUnsupportedScheme,
			Message: fmt.Sprintf("no facilitator for scheme %s on network %s", reqInfo.Scheme, reqInfo.Network),
			}
	}

	// Delegate to mechanism (mechanism unmarshals to version-specific types)
	return facilitator.Verify(ctx, version, payloadBytes, requirementsBytes)
}

// Settle executes a payment on-chain
// Bridge method: keeps struct API, uses bytes internally
func (f *x402Facilitator) Settle(ctx context.Context, payload PaymentPayload, requirements PaymentRequirements) (SettleResponse, error) {
	f.mu.RLock()
	defer f.mu.RUnlock()

	// Marshal to bytes for mechanism
	payloadBytes, err := json.Marshal(payload)
	if err != nil {
		return SettleResponse{Success: false}, err
	}

	requirementsBytes, err := json.Marshal(requirements)
	if err != nil {
		return SettleResponse{Success: false}, err
	}

	// Detect version
	version, err := types.DetectVersion(payloadBytes)
	if err != nil {
		return SettleResponse{Success: false}, err
	}

	// Extract scheme/network for routing
	reqInfo, err := types.ExtractRequirementsInfo(requirementsBytes)
	if err != nil {
		return SettleResponse{Success: false}, err
	}

	// Find facilitator
	versionSchemes, exists := f.schemes[version]
	if !exists {
		return SettleResponse{
				Success:     false,
			ErrorReason: fmt.Sprintf("unsupported x402 version: %d", version),
				Network:     payload.Accepted.Network,
			}, &PaymentError{
				Code:    ErrCodeInvalidPayment,
			Message: fmt.Sprintf("x402 version %d not supported", version),
			}
	}

	facilitator := findByNetworkAndScheme(versionSchemes, reqInfo.Scheme, Network(reqInfo.Network))
	if facilitator == nil {
		return SettleResponse{
			Success:     false,
			ErrorReason: fmt.Sprintf("unsupported scheme %s on network %s", reqInfo.Scheme, reqInfo.Network),
				Network:     payload.Accepted.Network,
			}, &PaymentError{
			Code:    ErrCodeUnsupportedScheme,
			Message: fmt.Sprintf("no facilitator for scheme %s on network %s", reqInfo.Scheme, reqInfo.Network),
			}
	}

	// Delegate to mechanism
	return facilitator.Settle(ctx, version, payloadBytes, requirementsBytes)
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
