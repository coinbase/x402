package svm

import (
	"context"
	"fmt"
	"strconv"
	"strings"

	x402 "github.com/coinbase/x402/go"
)

// ExactSvmService implements the SchemeNetworkService interface for SVM (Solana) exact payments (V2)
type ExactSvmService struct{}

// NewExactSvmService creates a new ExactSvmService
func NewExactSvmService() *ExactSvmService {
	return &ExactSvmService{}
}

// Scheme returns the scheme identifier
func (s *ExactSvmService) Scheme() string {
	return SchemeExact
}

// ParsePrice parses a price and converts it to an asset amount (V2)
func (s *ExactSvmService) ParsePrice(price x402.Price, network x402.Network) (x402.AssetAmount, error) {
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

	// Handle string prices
	if priceStr, ok := price.(string); ok {
		return s.parseStringPrice(priceStr, config)
	}

	// Handle number input - assume USDC
	switch v := price.(type) {
	case float64:
		amountStr := fmt.Sprintf("%.6f", v)
		amount, err := ParseAmount(amountStr, config.DefaultAsset.Decimals)
		if err != nil {
			return x402.AssetAmount{}, err
		}
		return x402.AssetAmount{
			Amount: strconv.FormatUint(amount, 10),
			Asset:  config.DefaultAsset.Address,
			Extra:  make(map[string]interface{}),
		}, nil

	case int:
		amountStr := strconv.Itoa(v)
		amount, err := ParseAmount(amountStr, config.DefaultAsset.Decimals)
		if err != nil {
			return x402.AssetAmount{}, err
		}
		return x402.AssetAmount{
			Amount: strconv.FormatUint(amount, 10),
			Asset:  config.DefaultAsset.Address,
			Extra:  make(map[string]interface{}),
		}, nil

	case int64:
		amountStr := strconv.FormatInt(v, 10)
		amount, err := ParseAmount(amountStr, config.DefaultAsset.Decimals)
		if err != nil {
			return x402.AssetAmount{}, err
		}
		return x402.AssetAmount{
			Amount: strconv.FormatUint(amount, 10),
			Asset:  config.DefaultAsset.Address,
			Extra:  make(map[string]interface{}),
		}, nil
	}

	return x402.AssetAmount{}, fmt.Errorf("invalid price format: %v", price)
}

// parseStringPrice parses string prices in various formats
func (s *ExactSvmService) parseStringPrice(priceStr string, config *NetworkConfig) (x402.AssetAmount, error) {
	// Remove $ sign if present
	cleanPrice := strings.TrimSpace(strings.TrimPrefix(priceStr, "$"))

	// Check if it contains a currency/asset identifier
	parts := strings.Fields(cleanPrice)

	if len(parts) == 2 {
		// Format: "0.10 USDC"
		amountStr := parts[0]
		symbol := strings.ToUpper(parts[1])

		// Determine asset based on symbol
		var assetInfo *AssetInfo
		if symbol == "USDC" || symbol == "USD" {
			assetInfo = &config.DefaultAsset
		} else {
			// Try to look up asset by symbol
			asset, err := GetAssetInfo(config.CAIP2, symbol)
			if err != nil {
				return x402.AssetAmount{}, fmt.Errorf("unsupported asset: %s on network %s", symbol, config.CAIP2)
			}
			assetInfo = asset
		}

		amount, err := ParseAmount(amountStr, assetInfo.Decimals)
		if err != nil {
			return x402.AssetAmount{}, err
		}

		return x402.AssetAmount{
			Amount: strconv.FormatUint(amount, 10),
			Asset:  assetInfo.Address,
			Extra:  make(map[string]interface{}),
		}, nil
	}

	if len(parts) == 1 {
		// Simple number format like "0.10" - assume USDC
		amount, err := ParseAmount(parts[0], config.DefaultAsset.Decimals)
		if err != nil {
			return x402.AssetAmount{}, err
		}

		return x402.AssetAmount{
			Amount: strconv.FormatUint(amount, 10),
			Asset:  config.DefaultAsset.Address,
			Extra:  make(map[string]interface{}),
		}, nil
	}

	return x402.AssetAmount{}, fmt.Errorf(
		"invalid price format: %s. Must specify currency (e.g., \"0.10 USDC\") or use simple number format",
		priceStr,
	)
}

// EnhancePaymentRequirements adds scheme-specific enhancements to payment requirements (V2)
func (s *ExactSvmService) EnhancePaymentRequirements(
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

