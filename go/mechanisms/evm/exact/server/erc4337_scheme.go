package server

import (
	"context"
	"fmt"

	x402 "github.com/coinbase/x402/go"
	"github.com/coinbase/x402/go/mechanisms/evm"
	"github.com/coinbase/x402/go/types"
)

// ExactEvmSchemeERC4337 extends ExactEvmScheme with ERC-4337 support.
// It preserves the UserOperation capability in payment requirements
// and supports all networks in the ERC-4337 registry for default assets.
type ExactEvmSchemeERC4337 struct {
	*ExactEvmScheme
}

// NewExactEvmSchemeERC4337 creates a new ERC-4337 server scheme.
func NewExactEvmSchemeERC4337() *ExactEvmSchemeERC4337 {
	return &ExactEvmSchemeERC4337{
		ExactEvmScheme: NewExactEvmScheme(),
	}
}

// EnhancePaymentRequirements enhances requirements while preserving UserOperation capability.
func (s *ExactEvmSchemeERC4337) EnhancePaymentRequirements(
	ctx context.Context,
	requirements types.PaymentRequirements,
	supportedKind types.SupportedKind,
	extensionKeys []string,
) (types.PaymentRequirements, error) {
	// Extract userOperation capability before enhancement
	userOpCap := evm.ExtractUserOperationCapability(requirements.Extra)

	// Try the parent's enhancement first
	enhanced, err := s.ExactEvmScheme.EnhancePaymentRequirements(ctx, requirements, supportedKind, extensionKeys)
	if err != nil {
		// If the parent fails (e.g., unsupported network), try ERC-4337 registry
		enhanced, err = s.enhanceFromERC4337Registry(requirements, supportedKind, extensionKeys)
		if err != nil {
			return requirements, err
		}
	}

	// Preserve userOperation capability if it was present
	if userOpCap != nil {
		if enhanced.Extra == nil {
			enhanced.Extra = make(map[string]interface{})
		}
		enhanced.Extra["userOperation"] = map[string]interface{}{
			"supported":  userOpCap.Supported,
			"bundlerUrl": userOpCap.BundlerUrl,
			"paymaster":  userOpCap.Paymaster,
			"entrypoint": userOpCap.Entrypoint,
		}
	}

	return enhanced, nil
}

// enhanceFromERC4337Registry tries to enhance requirements using the ERC-4337 network registry
// when the standard network configs don't have the chain.
func (s *ExactEvmSchemeERC4337) enhanceFromERC4337Registry(
	requirements types.PaymentRequirements,
	supportedKind types.SupportedKind,
	extensionKeys []string,
) (types.PaymentRequirements, error) {
	networkStr := string(requirements.Network)

	chainID, err := evm.ResolveERC4337ChainId(networkStr)
	if err != nil {
		return requirements, err
	}

	chain := evm.GetERC4337Chain(chainID)
	if chain == nil {
		return requirements, fmt.Errorf("chain %d not in ERC-4337 registry", chainID)
	}

	// Use USDC from the registry if no asset specified
	if requirements.Asset == "" {
		requirements.Asset = chain.UsdcAddress
	}

	// Add standard USDC EIP-712 domain params
	if requirements.Extra == nil {
		requirements.Extra = make(map[string]interface{})
	}
	if _, ok := requirements.Extra["name"]; !ok {
		requirements.Extra["name"] = "USD Coin"
	}
	if _, ok := requirements.Extra["version"]; !ok {
		requirements.Extra["version"] = "2"
	}

	// Copy extensions from supportedKind if provided
	if supportedKind.Extra != nil {
		for _, key := range extensionKeys {
			if val, ok := supportedKind.Extra[key]; ok {
				requirements.Extra[key] = val
			}
		}
	}

	return requirements, nil
}

// GetSupportedNetworks returns all supported networks, including ERC-4337 registry chains.
func (s *ExactEvmSchemeERC4337) GetSupportedNetworks() []string {
	// Start with standard networks
	networks := s.ExactEvmScheme.GetSupportedNetworks()

	// Add ERC-4337 registry networks not already included
	existing := make(map[string]bool, len(networks))
	for _, n := range networks {
		existing[n] = true
	}

	for _, chain := range evm.ERC4337SupportedChains {
		if !existing[chain.CAIP2] {
			networks = append(networks, chain.CAIP2)
		}
	}

	return networks
}

// ParsePrice extends parent with ERC-4337 network support for default asset resolution.
func (s *ExactEvmSchemeERC4337) ParsePrice(price x402.Price, network x402.Network) (x402.AssetAmount, error) {
	// Try parent first
	result, err := s.ExactEvmScheme.ParsePrice(price, network)
	if err == nil {
		return result, nil
	}

	// If parent fails (unsupported network), try ERC-4337 registry
	networkStr := string(network)
	chainID, resolveErr := evm.ResolveERC4337ChainId(networkStr)
	if resolveErr != nil {
		return x402.AssetAmount{}, err // Return original error
	}

	chain := evm.GetERC4337Chain(chainID)
	if chain == nil {
		return x402.AssetAmount{}, err // Return original error
	}

	// Use USDC from the registry
	return x402.AssetAmount{
		Asset:  chain.UsdcAddress,
		Amount: fmt.Sprintf("%v", price),
		Extra:  map[string]interface{}{"name": "USD Coin", "version": "2"},
	}, nil
}
