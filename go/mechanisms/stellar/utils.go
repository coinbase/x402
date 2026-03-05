package stellar

import (
	"fmt"
	"math"
	"regexp"
	"strconv"
	"strings"
)

var (
	// Stellar address regex: G or C followed by 55 uppercase alphanumeric characters
	stellarAddressRegex = regexp.MustCompile(`^[GC][A-Z2-7]{55}$`)
)

// ValidateStellarAddress checks if a string is a valid Stellar address (G... or C... format)
func ValidateStellarAddress(address string) bool {
	return stellarAddressRegex.MatchString(address)
}

// IsValidNetwork checks if the network is a supported Stellar network
func IsValidNetwork(network string) bool {
	_, ok := NetworkConfigs[network]
	return ok
}

// GetNetworkConfig returns the configuration for a network
func GetNetworkConfig(network string) (*NetworkConfig, error) {
	config, ok := NetworkConfigs[network]
	if !ok {
		return nil, fmt.Errorf("unsupported Stellar network: %s", network)
	}
	return &config, nil
}

// GetAssetInfo returns information about an asset on a network
func GetAssetInfo(network string, assetCodeOrIdentifier string) (*AssetInfo, error) {
	config, err := GetNetworkConfig(network)
	if err != nil {
		return nil, err
	}

	// If empty or matches default, return default
	if assetCodeOrIdentifier == "" || assetCodeOrIdentifier == config.DefaultAsset.Code {
		return &config.DefaultAsset, nil
	}

	// Check for native XLM
	if assetCodeOrIdentifier == XLMNative || strings.EqualFold(assetCodeOrIdentifier, "XLM") {
		return &AssetInfo{
			Code:     "XLM",
			Issuer:   "",
			Decimals: DefaultDecimals,
			IsNative: true,
		}, nil
	}

	// For known USDC issuers, return USDC info
	if assetCodeOrIdentifier == USDCIssuerMainnet || assetCodeOrIdentifier == USDCIssuerTestnet {
		return &config.DefaultAsset, nil
	}

	// Default to the network's default asset
	return &config.DefaultAsset, nil
}

// FormatAssetIdentifier formats an asset as "CODE:ISSUER" or "native" for XLM
func FormatAssetIdentifier(asset AssetInfo) string {
	if asset.IsNative {
		return XLMNative
	}
	return asset.Code + ":" + asset.Issuer
}

// ParseAssetIdentifier parses "CODE:ISSUER" or "native" into an AssetInfo
func ParseAssetIdentifier(identifier string) (*AssetInfo, error) {
	if identifier == XLMNative {
		return &AssetInfo{
			Code:     "XLM",
			Issuer:   "",
			Decimals: DefaultDecimals,
			IsNative: true,
		}, nil
	}

	parts := strings.SplitN(identifier, ":", 2)
	if len(parts) == 2 && len(parts[0]) > 0 && ValidateStellarAddress(parts[1]) {
		return &AssetInfo{
			Code:     parts[0],
			Issuer:   parts[1],
			Decimals: DefaultDecimals,
		}, nil
	}

	return nil, fmt.Errorf("invalid asset identifier: %s (expected CODE:ISSUER or native)", identifier)
}

// ParseAmount converts a decimal string amount to Stellar stroops (7 decimal places)
func ParseAmount(amount string, decimals int) (uint64, error) {
	amount = strings.TrimSpace(amount)

	parts := strings.Split(amount, ".")
	if len(parts) > 2 {
		return 0, fmt.Errorf("invalid amount format: %s", amount)
	}

	intPart, err := strconv.ParseUint(parts[0], 10, 64)
	if err != nil {
		return 0, fmt.Errorf("invalid integer part: %s", parts[0])
	}

	decPart := uint64(0)
	if len(parts) == 2 && parts[1] != "" {
		decStr := parts[1]
		if len(decStr) > decimals {
			decStr = decStr[:decimals]
		} else {
			decStr += strings.Repeat("0", decimals-len(decStr))
		}

		decPart, err = strconv.ParseUint(decStr, 10, 64)
		if err != nil {
			return 0, fmt.Errorf("invalid decimal part: %s", parts[1])
		}
	}

	multiplier := uint64(math.Pow10(decimals))
	result := intPart*multiplier + decPart

	return result, nil
}

// FormatAmount converts an amount in stroops to a decimal string
func FormatAmount(amount uint64, decimals int) string {
	if amount == 0 {
		return "0"
	}

	divisor := uint64(math.Pow10(decimals))
	quotient := amount / divisor
	remainder := amount % divisor

	decStr := fmt.Sprintf("%0*d", decimals, remainder)
	decStr = strings.TrimRight(decStr, "0")

	if decStr == "" {
		return fmt.Sprintf("%d", quotient)
	}

	return fmt.Sprintf("%d.%s", quotient, decStr)
}
