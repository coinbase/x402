package server

import (
	"context"
	"errors"
	"fmt"
	"strconv"
	"strings"

	x402 "github.com/coinbase/x402/go"
	"github.com/coinbase/x402/go/mechanisms/stellar"
	"github.com/coinbase/x402/go/types"
)

// ExactStellarScheme implements the SchemeNetworkServer interface for Stellar exact payments (V2)
type ExactStellarScheme struct {
	moneyParsers []x402.MoneyParser
}

// NewExactStellarScheme creates a new ExactStellarScheme
func NewExactStellarScheme() *ExactStellarScheme {
	return &ExactStellarScheme{
		moneyParsers: []x402.MoneyParser{},
	}
}

// Scheme returns the scheme identifier
func (s *ExactStellarScheme) Scheme() string {
	return stellar.SchemeExact
}

// RegisterMoneyParser registers a custom money parser in the parser chain.
// Multiple parsers can be registered - they will be tried in registration order.
// Each parser receives a decimal amount (e.g., 1.50 for $1.50).
// If a parser returns nil, the next parser in the chain will be tried.
// The default parser is always the final fallback.
func (s *ExactStellarScheme) RegisterMoneyParser(parser x402.MoneyParser) *ExactStellarScheme {
	s.moneyParsers = append(s.moneyParsers, parser)
	return s
}

// ParsePrice parses a price and converts it to an asset amount (V2)
// If price is already an AssetAmount, returns it directly.
// If price is Money (string | number), parses to decimal and tries custom parsers.
// Falls back to default conversion if all custom parsers return nil.
func (s *ExactStellarScheme) ParsePrice(price x402.Price, network x402.Network) (x402.AssetAmount, error) {
	networkStr := string(network)

	config, err := stellar.GetNetworkConfig(networkStr)
	if err != nil {
		return x402.AssetAmount{}, err
	}

	// Handle pre-parsed price object (with amount and asset)
	if priceMap, ok := price.(map[string]interface{}); ok {
		if amountVal, hasAmount := priceMap["amount"]; hasAmount {
			amountStr, ok := amountVal.(string)
			if !ok {
				return x402.AssetAmount{}, errors.New(ErrAmountMustBeString)
			}

			// Default to the network's default asset identifier
			asset := stellar.FormatAssetIdentifier(config.DefaultAsset)
			if assetVal, hasAsset := priceMap["asset"]; hasAsset {
				if assetStr, ok := assetVal.(string); ok {
					asset = assetStr
				}
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
			continue
		}
		if result != nil {
			return *result, nil
		}
	}

	// All custom parsers returned nil, use default conversion
	return s.defaultMoneyConversion(decimalAmount, config)
}

// parseMoneyToDecimal converts Money (string | number) to decimal amount
func (s *ExactStellarScheme) parseMoneyToDecimal(price x402.Price) (float64, error) {
	if priceStr, ok := price.(string); ok {
		cleanPrice := strings.TrimSpace(priceStr)
		cleanPrice = strings.TrimPrefix(cleanPrice, "$")
		cleanPrice = strings.TrimSpace(cleanPrice)

		parts := strings.Fields(cleanPrice)
		if len(parts) >= 1 {
			amount, err := strconv.ParseFloat(parts[0], 64)
			if err != nil {
				return 0, fmt.Errorf(ErrFailedToParsePrice+": '%s': %w", priceStr, err)
			}
			return amount, nil
		}
	}

	switch v := price.(type) {
	case float64:
		return v, nil
	case int:
		return float64(v), nil
	case int64:
		return float64(v), nil
	}

	return 0, fmt.Errorf(ErrInvalidPriceFormat+": %v", price)
}

// defaultMoneyConversion converts decimal amount to USDC AssetAmount on Stellar
func (s *ExactStellarScheme) defaultMoneyConversion(amount float64, config *stellar.NetworkConfig) (x402.AssetAmount, error) {
	// Convert decimal to smallest unit (e.g., $1.50 -> 15000000 for USDC with 7 decimals)
	amountStr := fmt.Sprintf("%.7f", amount)
	parsedAmount, err := stellar.ParseAmount(amountStr, config.DefaultAsset.Decimals)
	if err != nil {
		return x402.AssetAmount{}, fmt.Errorf(ErrFailedToConvertAmount+": %w", err)
	}

	return x402.AssetAmount{
		Amount: strconv.FormatUint(parsedAmount, 10),
		Asset:  stellar.FormatAssetIdentifier(config.DefaultAsset),
		Extra:  make(map[string]interface{}),
	}, nil
}

// EnhancePaymentRequirements adds Stellar-specific enhancements to V2 payment requirements
func (s *ExactStellarScheme) EnhancePaymentRequirements(
	ctx context.Context,
	requirements types.PaymentRequirements,
	supportedKind types.SupportedKind,
	extensionKeys []string,
) (types.PaymentRequirements, error) {
	_ = ctx

	networkStr := string(requirements.Network)
	config, err := stellar.GetNetworkConfig(networkStr)
	if err != nil {
		return requirements, err
	}

	// If no asset specified, use the default
	if requirements.Asset == "" {
		requirements.Asset = stellar.FormatAssetIdentifier(config.DefaultAsset)
	}

	// Ensure amount is in the correct format (smallest unit / stroops)
	if requirements.Amount != "" && strings.Contains(requirements.Amount, ".") {
		assetInfo, err := stellar.ParseAssetIdentifier(requirements.Asset)
		if err != nil {
			// Fall back to default decimals
			assetInfo = &config.DefaultAsset
		}
		parsedAmount, err := stellar.ParseAmount(requirements.Amount, assetInfo.Decimals)
		if err != nil {
			return requirements, fmt.Errorf(ErrFailedToParseAmount+": %w", err)
		}
		requirements.Amount = strconv.FormatUint(parsedAmount, 10)
	}

	// Initialize extra map if needed
	if requirements.Extra == nil {
		requirements.Extra = make(map[string]interface{})
	}

	// Add Stellar-specific fields
	if _, ok := requirements.Extra["horizonURL"]; !ok {
		requirements.Extra["horizonURL"] = config.HorizonURL
	}
	if _, ok := requirements.Extra["networkPassphrase"]; !ok {
		requirements.Extra["networkPassphrase"] = config.Passphrase
	}

	// Indicate fee sponsorship availability from facilitator
	if supportedKind.Extra != nil {
		if areFeesSponsored, ok := supportedKind.Extra["areFeesSponsored"]; ok {
			requirements.Extra["areFeesSponsored"] = areFeesSponsored
		}
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
