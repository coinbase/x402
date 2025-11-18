package svm

import (
	"context"
	"fmt"
	"strconv"
	"strings"

	x402 "github.com/coinbase/x402/go"
)

// ExactEvmServer implements the SchemeNetworkServer interface for SVM (Solana) exact payments (V2)
type ExactEvmServer struct {
	moneyParsers []x402.MoneyParser
}

// NewExactEvmServer creates a new ExactEvmServer
func NewExactEvmServer() *ExactEvmServer {
	return &ExactEvmServer{
		moneyParsers: []x402.MoneyParser{},
	}
}

// Scheme returns the scheme identifier
func (s *ExactEvmServer) Scheme() string {
	return SchemeExact
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
//	svmServer.RegisterMoneyParser(func(amount float64, network x402.Network) (*x402.AssetAmount, error) {
//	    // Use custom token for large amounts
//	    if amount > 100 {
//	        return &x402.AssetAmount{
//	            Amount: fmt.Sprintf("%.0f", amount * 1e9),
//	            Asset:  "CustomTokenMint111111111111111111111",
//	            Extra:  map[string]interface{}{"token": "CUSTOM", "tier": "large"},
//	        }, nil
//	    }
//	    return nil, nil // Use next parser
//	})
func (s *ExactEvmServer) RegisterMoneyParser(parser x402.MoneyParser) *ExactEvmServer {
	s.moneyParsers = append(s.moneyParsers, parser)
	return s
}

// ParsePrice parses a price and converts it to an asset amount (V2)
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
func (s *ExactEvmServer) ParsePrice(price x402.Price, network x402.Network) (x402.AssetAmount, error) {
	networkStr := string(network)

	// Get network config to determine the default asset
	config, err := GetNetworkConfig(networkStr)
	if err != nil {
		return x402.AssetAmount{}, err
	}

	// Handle pre-parsed price object (with amount and asset)
	if priceMap, ok := price.(map[string]interface{}); ok {
		if amountVal, hasAmount := priceMap["amount"]; hasAmount {
			amountStr, ok := amountVal.(string)
			if !ok {
				return x402.AssetAmount{}, fmt.Errorf("amount must be a string")
			}

			asset := config.DefaultAsset.Address
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
	return s.defaultMoneyConversion(decimalAmount, network, config)
}

// parseMoneyToDecimal converts Money (string | number) to decimal amount
func (s *ExactEvmServer) parseMoneyToDecimal(price x402.Price) (float64, error) {
	// Handle string prices
	if priceStr, ok := price.(string); ok {
		// Remove $ sign and currency identifiers
		cleanPrice := strings.TrimSpace(priceStr)
		cleanPrice = strings.TrimPrefix(cleanPrice, "$")
		cleanPrice = strings.TrimSpace(cleanPrice)

		// Check if it contains a currency/asset identifier
		parts := strings.Fields(cleanPrice)
		if len(parts) >= 1 {
			// Use the first part as the amount
			amount, err := strconv.ParseFloat(parts[0], 64)
			if err != nil {
				return 0, fmt.Errorf("failed to parse price string '%s': %w", priceStr, err)
			}
			return amount, nil
		}
	}

	// Handle number input
	switch v := price.(type) {
	case float64:
		return v, nil
	case int:
		return float64(v), nil
	case int64:
		return float64(v), nil
	}

	return 0, fmt.Errorf("invalid price format: %v", price)
}

// defaultMoneyConversion converts decimal amount to USDC AssetAmount
func (s *ExactEvmServer) defaultMoneyConversion(amount float64, network x402.Network, config *NetworkConfig) (x402.AssetAmount, error) {
	// Convert decimal to smallest unit (e.g., $1.50 -> 1500000 for USDC with 6 decimals)
	amountStr := fmt.Sprintf("%.6f", amount)
	parsedAmount, err := ParseAmount(amountStr, config.DefaultAsset.Decimals)
	if err != nil {
		return x402.AssetAmount{}, fmt.Errorf("failed to convert amount: %w", err)
	}

	return x402.AssetAmount{
		Amount: strconv.FormatUint(parsedAmount, 10),
		Asset:  config.DefaultAsset.Address,
		Extra:  make(map[string]interface{}),
	}, nil
}

// EnhancePaymentRequirements adds scheme-specific enhancements to payment requirements (V2)
func (s *ExactEvmServer) EnhancePaymentRequirements(
	ctx context.Context,
	requirements x402.PaymentRequirements,
	supportedKind x402.SupportedKind,
	extensionKeys []string,
) (x402.PaymentRequirements, error) {
	// Mark unused parameter
	_ = ctx

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
		requirements.Amount = strconv.FormatUint(amount, 10)
	}

	// Initialize extra map if needed
	if requirements.Extra == nil {
		requirements.Extra = make(map[string]interface{})
	}

	// Add feePayer from supportedKind.extra to payment requirements
	// The facilitator provides its address as the fee payer for transaction fees
	if supportedKind.Extra != nil {
		if feePayer, ok := supportedKind.Extra["feePayer"]; ok {
			requirements.Extra["feePayer"] = feePayer
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
