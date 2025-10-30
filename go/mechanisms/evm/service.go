package evm

import (
	"context"
	"fmt"
	"math/big"
	"strings"

	x402 "github.com/coinbase/x402/go"
)

// ExactEvmService implements the SchemeNetworkService interface for EVM exact payments (V2)
type ExactEvmService struct{}

// NewExactEvmService creates a new ExactEvmService
func NewExactEvmService() *ExactEvmService {
	return &ExactEvmService{}
}

// Scheme returns the scheme identifier
func (s *ExactEvmService) Scheme() string {
	return SchemeExact
}

// ParsePrice parses a price string and converts it to an asset amount (V2)
func (s *ExactEvmService) ParsePrice(price x402.Price, network x402.Network) (x402.AssetAmount, error) {
	// Convert price to string (Price is interface{})
	priceStr, ok := price.(string)
	if !ok {
		priceStr = fmt.Sprintf("%v", price)
	}
	networkStr := string(network)

	// Handle different price formats
	// Format 1: "$1.00" or "1.00 USD"
	// Format 2: "1000000" (already in smallest unit)
	// Format 3: "1.00" (decimal amount)

	// Remove common currency symbols and spaces
	priceStr = strings.TrimSpace(priceStr)
	priceStr = strings.TrimPrefix(priceStr, "$")
	priceStr = strings.TrimSuffix(priceStr, " USD")
	priceStr = strings.TrimSuffix(priceStr, " USDC")
	priceStr = strings.TrimSpace(priceStr)

	// Get network config to determine the asset
	config, err := GetNetworkConfig(networkStr)
	if err != nil {
		return x402.AssetAmount{}, err
	}

	// Try to parse as decimal first
	if strings.Contains(priceStr, ".") {
		// It's a decimal amount, convert to smallest unit
		amount, err := ParseAmount(priceStr, config.DefaultAsset.Decimals)
		if err != nil {
			return x402.AssetAmount{}, fmt.Errorf("failed to parse decimal price: %w", err)
		}

		return x402.AssetAmount{
			Asset:  config.DefaultAsset.Address,
			Amount: amount.String(),
		}, nil
	}

	// Try to parse as integer (already in smallest unit)
	amount, ok := new(big.Int).SetString(priceStr, 10)
	if !ok {
		return x402.AssetAmount{}, fmt.Errorf("invalid price format: %s", price)
	}

	// Check if this looks like a reasonable amount in smallest unit
	// (e.g., 1000000 for $1.00 USDC with 6 decimals)
	oneUnit := new(big.Int).Exp(big.NewInt(10), big.NewInt(int64(config.DefaultAsset.Decimals)), nil)
	if amount.Cmp(oneUnit) >= 0 {
		// Likely already in smallest unit
		return x402.AssetAmount{
			Asset:  config.DefaultAsset.Address,
			Amount: amount.String(),
		}, nil
	}

	// Small integer, treat as dollar amount
	amount.Mul(amount, oneUnit)

	return x402.AssetAmount{
		Asset:  config.DefaultAsset.Address,
		Amount: amount.String(),
	}, nil
}

// EnhancePaymentRequirements adds scheme-specific enhancements to payment requirements (V2)
func (s *ExactEvmService) EnhancePaymentRequirements(
	ctx context.Context,
	requirements x402.PaymentRequirements,
	supportedKind x402.SupportedKind,
	extensionKeys []string,
) (x402.PaymentRequirements, error) {
	// V2 specific: only handle version 2
	if supportedKind.X402Version != 2 {
		return requirements, fmt.Errorf("v2 only supports x402 version 2")
	}

	// Get network config
	networkStr := string(requirements.Network)
	config, err := GetNetworkConfig(networkStr)
	if err != nil {
		return requirements, err
	}

	// Get asset info
	var assetInfo *AssetInfo
	if requirements.Asset != "" {
		assetInfo, err = GetAssetInfo(networkStr, requirements.Asset)
		if err != nil {
			return requirements, err
		}
	} else {
		// Use default asset if not specified
		assetInfo = &config.DefaultAsset
		requirements.Asset = assetInfo.Address
	}

	// Ensure amount is in the correct format (smallest unit)
	if requirements.Amount != "" && strings.Contains(requirements.Amount, ".") {
		// Convert decimal to smallest unit
		amount, err := ParseAmount(requirements.Amount, assetInfo.Decimals)
		if err != nil {
			return requirements, fmt.Errorf("failed to parse amount: %w", err)
		}
		requirements.Amount = amount.String()
	}

	// Add EIP-3009 specific fields to Extra if not present
	if requirements.Extra == nil {
		requirements.Extra = make(map[string]interface{})
	}

	// Add token name and version for EIP-712 signing
	// ONLY add if not already present (client may have specified exact values)
	if _, ok := requirements.Extra["name"]; !ok {
		requirements.Extra["name"] = assetInfo.Name
	}
	if _, ok := requirements.Extra["version"]; !ok {
		requirements.Extra["version"] = assetInfo.Version
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

// GetDisplayAmount formats an amount for display
func (s *ExactEvmService) GetDisplayAmount(amount string, network string, asset string) (string, error) {
	// Get asset info
	assetInfo, err := GetAssetInfo(network, asset)
	if err != nil {
		return "", err
	}

	// Parse amount
	amountBig, ok := new(big.Int).SetString(amount, 10)
	if !ok {
		return "", fmt.Errorf("invalid amount: %s", amount)
	}

	// Format with decimals
	formatted := FormatAmount(amountBig, assetInfo.Decimals)

	// Add currency symbol
	return "$" + formatted + " USDC", nil
}

// ValidatePaymentRequirements validates that requirements are valid for this scheme
func (s *ExactEvmService) ValidatePaymentRequirements(requirements x402.PaymentRequirements) error {
	// Check network is supported
	networkStr := string(requirements.Network)
	if !IsValidNetwork(networkStr) {
		return fmt.Errorf("unsupported network: %s", requirements.Network)
	}

	// Check PayTo is a valid address
	if !IsValidAddress(requirements.PayTo) {
		return fmt.Errorf("invalid PayTo address: %s", requirements.PayTo)
	}

	// Check amount is valid
	if requirements.Amount == "" {
		return fmt.Errorf("amount is required")
	}

	amount, ok := new(big.Int).SetString(requirements.Amount, 10)
	if !ok || amount.Sign() <= 0 {
		return fmt.Errorf("invalid amount: %s", requirements.Amount)
	}

	// Check asset is valid if specified
	if requirements.Asset != "" && !IsValidAddress(requirements.Asset) {
		// Try to look it up as a symbol
		_, err := GetAssetInfo(networkStr, requirements.Asset)
		if err != nil {
			return fmt.Errorf("invalid asset: %s", requirements.Asset)
		}
	}

	return nil
}

// ConvertToTokenAmount converts a decimal amount to token smallest unit
func (s *ExactEvmService) ConvertToTokenAmount(decimalAmount string, network string) (string, error) {
	config, err := GetNetworkConfig(network)
	if err != nil {
		return "", err
	}

	amount, err := ParseAmount(decimalAmount, config.DefaultAsset.Decimals)
	if err != nil {
		return "", err
	}

	return amount.String(), nil
}

// ConvertFromTokenAmount converts from token smallest unit to decimal
func (s *ExactEvmService) ConvertFromTokenAmount(tokenAmount string, network string) (string, error) {
	config, err := GetNetworkConfig(network)
	if err != nil {
		return "", err
	}

	amount, ok := new(big.Int).SetString(tokenAmount, 10)
	if !ok {
		return "", fmt.Errorf("invalid token amount: %s", tokenAmount)
	}

	return FormatAmount(amount, config.DefaultAsset.Decimals), nil
}

// GetSupportedNetworks returns the list of supported networks
func (s *ExactEvmService) GetSupportedNetworks() []string {
	networks := make([]string, 0, len(NetworkConfigs))
	for network := range NetworkConfigs {
		networks = append(networks, network)
	}
	return networks
}

// GetSupportedAssets returns the list of supported assets for a network
func (s *ExactEvmService) GetSupportedAssets(network string) ([]string, error) {
	config, err := GetNetworkConfig(network)
	if err != nil {
		return nil, err
	}

	assets := make([]string, 0, len(config.SupportedAssets))
	for symbol := range config.SupportedAssets {
		assets = append(assets, symbol)
	}

	// Also add the addresses
	for _, asset := range config.SupportedAssets {
		assets = append(assets, asset.Address)
	}

	return assets, nil
}
