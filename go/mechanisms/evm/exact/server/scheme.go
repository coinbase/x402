package server

import (
	"context"
	"errors"
	"fmt"
	"math/big"
	"strconv"
	"strings"

	x402 "github.com/gatechain/x402/go"
	"github.com/gatechain/x402/go/mechanisms/evm"
	"github.com/gatechain/x402/go/types"
)

// ExactEvmScheme implements the SchemeNetworkServer interface for EVM exact payments (V2)
type ExactEvmScheme struct {
	moneyParsers []x402.MoneyParser
}

// NewExactEvmScheme creates a new ExactEvmScheme
func NewExactEvmScheme() *ExactEvmScheme {
	return &ExactEvmScheme{
		moneyParsers: []x402.MoneyParser{},
	}
}

// Scheme returns the scheme identifier
func (s *ExactEvmScheme) Scheme() string {
	return evm.SchemeExact
}

// RegisterMoneyParser registers a custom money parser in the parser chain.
// Multiple parsers can be registered - they will be tried in registration order.
// Each parser receives a decimal amount (e.g., 1.50 for $1.50).
// If a parser returns nil, the next parser in the chain will be tried.
// The default parser is always the final fallback.
//
// Args:
//
//	parser: Custom function to convert amount to AssetAmount (or nil to skip)
//
// Returns:
//
//	The server instance for chaining
//
// Example:
//
//	evmServer.RegisterMoneyParser(func(amount float64, network x402.Network) (*x402.AssetAmount, error) {
//	    // Use DAI for large amounts
//	    if amount > 100 {
//	        return &x402.AssetAmount{
//	            Amount: fmt.Sprintf("%.0f", amount * 1e18),
//	            Asset:  "0x6B175474E89094C44Da98b954EedeAC495271d0F", // DAI
//	            Extra:  map[string]interface{}{"token": "DAI"},
//	        }, nil
//	    }
//	    return nil, nil // Use next parser
//	})
func (s *ExactEvmScheme) RegisterMoneyParser(parser x402.MoneyParser) *ExactEvmScheme {
	s.moneyParsers = append(s.moneyParsers, parser)
	return s
}

// ParsePrice parses a price string and converts it to an asset amount (V2)
// If price is already an AssetAmount, returns it directly.
// If price is Money (string | number), parses to decimal and tries custom parsers.
// Falls back to default conversion if all custom parsers return nil.
//
// Args:
//
//	price: The price to parse (can be string, number, or AssetAmount map)
//	network: The network identifier
//
// Returns:
//
//	AssetAmount with amount, asset, and optional extra fields
func (s *ExactEvmScheme) ParsePrice(price x402.Price, network x402.Network) (x402.AssetAmount, error) {
	// If already an AssetAmount (map with "amount" and "asset"), return it directly
	if priceMap, ok := price.(map[string]interface{}); ok {
		if amountVal, hasAmount := priceMap["amount"]; hasAmount {
			amountStr, ok := amountVal.(string)
			if !ok {
				return x402.AssetAmount{}, errors.New(ErrAmountMustBeString)
			}

			asset := ""
			if assetVal, hasAsset := priceMap["asset"]; hasAsset {
				if assetStr, ok := assetVal.(string); ok {
					asset = assetStr
				}
			}

			if asset == "" {
				return x402.AssetAmount{}, errors.New(ErrAssetAddressRequired)
			}

			extra := make(map[string]interface{})
			if extraVal, hasExtra := priceMap["extra"]; hasExtra {
				if extraMap, ok := extraVal.(map[string]interface{}); ok {
					extra = extraMap
				}
			}

			return x402.AssetAmount{
				Amount: amountStr,
				Asset:  asset,
				Extra:  extra,
			}, nil
		}
	}

	// Parse Money to decimal number
	decimalAmount, err := s.parseMoneyToDecimal(price)
	if err != nil {
		return x402.AssetAmount{}, err
	}

	// Try each custom money parser in order
	for _, parser := range s.moneyParsers {
		result, err := parser(decimalAmount, network)
		if err != nil {
			// Parser returned an error, skip it
			continue
		}
		if result != nil {
			// Parser handled the conversion
			return *result, nil
		}
		// Parser returned nil, try next one
	}

	// All custom parsers returned nil, use default conversion
	return s.defaultMoneyConversion(decimalAmount, network)
}

// parseMoneyToDecimal converts Money (string | number) to decimal amount
func (s *ExactEvmScheme) parseMoneyToDecimal(price x402.Price) (float64, error) {
	switch v := price.(type) {
	case string:
		// Remove currency symbols
		cleanPrice := strings.TrimSpace(v)
		cleanPrice = strings.TrimPrefix(cleanPrice, "$")
		cleanPrice = strings.TrimSuffix(cleanPrice, " USD")
		cleanPrice = strings.TrimSuffix(cleanPrice, " USDC")
		cleanPrice = strings.TrimSpace(cleanPrice)

		// Parse as float
		amount, err := strconv.ParseFloat(cleanPrice, 64)
		if err != nil {
			return 0, fmt.Errorf(ErrFailedToParsePrice+": '%s': %w", v, err)
		}
		return amount, nil

	case float64:
		return v, nil

	case int:
		return float64(v), nil

	case int64:
		return float64(v), nil

	default:
		return 0, fmt.Errorf(ErrUnsupportedPriceType+": %T", price)
	}
}

// defaultMoneyConversion converts decimal amount to USDC AssetAmount
func (s *ExactEvmScheme) defaultMoneyConversion(amount float64, network x402.Network) (x402.AssetAmount, error) {
	networkStr := string(network)

	// Get network config to determine the asset
	config, err := evm.GetNetworkConfig(networkStr)
	if err != nil {
		return x402.AssetAmount{}, err
	}

	// Check if amount appears to already be in smallest unit
	// (e.g., 1500000 for $1.50 USDC is likely already in smallest unit, not $1.5M)
	oneUnit := float64(1)
	for i := 0; i < config.DefaultAsset.Decimals; i++ {
		oneUnit *= 10
	}

	// If amount is >= 1 unit AND is a whole number, it's likely already in smallest unit
	if amount >= oneUnit && amount == float64(int64(amount)) {
		return x402.AssetAmount{
			Asset:  config.DefaultAsset.Address,
			Amount: fmt.Sprintf("%.0f", amount),
			Extra:  make(map[string]interface{}),
		}, nil
	}

	// Convert decimal to smallest unit (e.g., $1.50 -> 1500000 for USDC with 6 decimals)
	amountStr := fmt.Sprintf("%.6f", amount)
	parsedAmount, err := evm.ParseAmount(amountStr, config.DefaultAsset.Decimals)
	if err != nil {
		return x402.AssetAmount{}, fmt.Errorf(ErrFailedToConvertAmount+": %w", err)
	}

	return x402.AssetAmount{
		Asset:  config.DefaultAsset.Address,
		Amount: parsedAmount.String(),
		Extra:  make(map[string]interface{}),
	}, nil
}

// EnhancePaymentRequirements adds scheme-specific enhancements to V2 payment requirements
func (s *ExactEvmScheme) EnhancePaymentRequirements(
	ctx context.Context,
	requirements types.PaymentRequirements,
	supportedKind types.SupportedKind,
	extensionKeys []string,
) (types.PaymentRequirements, error) {
	networkStr := string(requirements.Network)

	// Get asset info - if no asset specified, GetAssetInfo will try to use the default
	var assetInfo *evm.AssetInfo
	var err error
	if requirements.Asset != "" {
		assetInfo, err = evm.GetAssetInfo(networkStr, requirements.Asset)
		if err != nil {
			return requirements, err
		}
	} else {
		// Try to get default asset for this network
		assetInfo, err = evm.GetAssetInfo(networkStr, "")
		if err != nil {
			return requirements, fmt.Errorf(ErrNoAssetSpecified+": %w", err)
		}
		requirements.Asset = assetInfo.Address
	}

	// Ensure amount is in the correct format (smallest unit)
	if requirements.Amount != "" && strings.Contains(requirements.Amount, ".") {
		// Convert decimal to smallest unit
		amount, err := evm.ParseAmount(requirements.Amount, assetInfo.Decimals)
		if err != nil {
			return requirements, fmt.Errorf(ErrFailedToParseAmount+": %w", err)
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
func (s *ExactEvmScheme) GetDisplayAmount(amount string, network string, asset string) (string, error) {
	// Get asset info
	assetInfo, err := evm.GetAssetInfo(network, asset)
	if err != nil {
		return "", err
	}

	// Parse amount
	amountBig, ok := new(big.Int).SetString(amount, 10)
	if !ok {
		return "", fmt.Errorf("invalid amount: %s", amount)
	}

	// Format with decimals
	formatted := evm.FormatAmount(amountBig, assetInfo.Decimals)

	// Add currency symbol
	return "$" + formatted + " USDC", nil
}

// ValidatePaymentRequirements validates that requirements are valid for this scheme.
// All EVM networks are supported - this validates required fields only.
func (s *ExactEvmScheme) ValidatePaymentRequirements(requirements x402.PaymentRequirements) error {
	networkStr := string(requirements.Network)

	// Check PayTo is a valid address
	if !evm.IsValidAddress(requirements.PayTo) {
		return fmt.Errorf(ErrInvalidPayToAddress+": %s", requirements.PayTo)
	}

	// Check amount is valid
	if requirements.Amount == "" {
		return errors.New(ErrAmountRequired)
	}

	amount, ok := new(big.Int).SetString(requirements.Amount, 10)
	if !ok || amount.Sign() <= 0 {
		return fmt.Errorf(ErrInvalidAmount+": %s", requirements.Amount)
	}

	// Check asset is valid if specified
	if requirements.Asset != "" && !evm.IsValidAddress(requirements.Asset) {
		// Try to look it up (only works for networks with default assets)
		_, err := evm.GetAssetInfo(networkStr, requirements.Asset)
		if err != nil {
			return fmt.Errorf(ErrInvalidAsset+": %s", requirements.Asset)
		}
	}

	return nil
}

// ConvertToTokenAmount converts a decimal amount to token smallest unit
func (s *ExactEvmScheme) ConvertToTokenAmount(decimalAmount string, network string) (string, error) {
	config, err := evm.GetNetworkConfig(network)
	if err != nil {
		return "", err
	}

	amount, err := evm.ParseAmount(decimalAmount, config.DefaultAsset.Decimals)
	if err != nil {
		return "", err
	}

	return amount.String(), nil
}

// ConvertFromTokenAmount converts from token smallest unit to decimal
func (s *ExactEvmScheme) ConvertFromTokenAmount(tokenAmount string, network string) (string, error) {
	config, err := evm.GetNetworkConfig(network)
	if err != nil {
		return "", err
	}

	amount, ok := new(big.Int).SetString(tokenAmount, 10)
	if !ok {
		return "", fmt.Errorf(ErrInvalidTokenAmount+": %s", tokenAmount)
	}

	return evm.FormatAmount(amount, config.DefaultAsset.Decimals), nil
}

// GetSupportedNetworks returns the list of supported networks
func (s *ExactEvmScheme) GetSupportedNetworks() []string {
	networks := make([]string, 0, len(evm.NetworkConfigs))
	for network := range evm.NetworkConfigs {
		networks = append(networks, network)
	}
	return networks
}
