package v1

import (
	"context"
	"fmt"
	"math/big"
	"strings"
	"time"

	x402 "github.com/coinbase/x402/go"
	"github.com/coinbase/x402/go/mechanisms/evm"
)

// ExactEvmServerV1 implements the SchemeNetworkServer interface for EVM exact payments (V1)
type ExactEvmServerV1 struct{}

// NewExactEvmServerV1 creates a new ExactEvmServerV1
func NewExactEvmServerV1() *ExactEvmServerV1 {
	return &ExactEvmServerV1{}
}

// Scheme returns the scheme identifier
func (s *ExactEvmServerV1) Scheme() string {
	return evm.SchemeExact
}

// ParsePrice parses a price into an AssetAmount (V1)
func (s *ExactEvmServerV1) ParsePrice(price x402.Price, network x402.Network) (x402.AssetAmount, error) {
	// Get network configuration
	networkStr := string(network)
	config, err := evm.GetNetworkConfig(networkStr)
	if err != nil {
		return x402.AssetAmount{}, err
	}

	// V1 specific: Default to USDC for the network
	defaultAsset := fmt.Sprintf("erc20:0x%s", strings.ToLower(config.DefaultAsset.Address))

	// Handle different price types
	switch p := price.(type) {
	case string:
		// Parse string format: "amount asset"
		parts := strings.Fields(p)
		if len(parts) == 1 {
			// Just amount, use default asset
			amount, err := evm.ParseAmount(parts[0], 6) // USDC has 6 decimals
			if err != nil {
				return x402.AssetAmount{}, fmt.Errorf("invalid amount: %w", err)
			}
			return x402.AssetAmount{
				Asset:  defaultAsset,
				Amount: amount.String(),
			}, nil
		} else if len(parts) == 2 {
			// amount and asset
			assetInfo, err := evm.GetAssetInfo(networkStr, parts[1])
			if err != nil {
				return x402.AssetAmount{}, err
			}
			amount, err := evm.ParseAmount(parts[0], assetInfo.Decimals)
			if err != nil {
				return x402.AssetAmount{}, fmt.Errorf("invalid amount: %w", err)
			}
			return x402.AssetAmount{
				Asset:  fmt.Sprintf("erc20:0x%s", strings.ToLower(assetInfo.Address)),
				Amount: amount.String(),
			}, nil
		}
		return x402.AssetAmount{}, fmt.Errorf("invalid price format: %s", p)

	case float64:
		// V1 specific: Treat as USD amount in USDC
		amount, err := evm.ParseAmount(fmt.Sprintf("%.6f", p), 6)
		if err != nil {
			return x402.AssetAmount{}, fmt.Errorf("invalid amount: %w", err)
		}
		return x402.AssetAmount{
			Asset:  defaultAsset,
			Amount: amount.String(),
		}, nil

	case int:
		// V1 specific: Treat as USD amount in USDC
		amount, err := evm.ParseAmount(fmt.Sprintf("%d", p), 6)
		if err != nil {
			return x402.AssetAmount{}, fmt.Errorf("invalid amount: %w", err)
		}
		return x402.AssetAmount{
			Asset:  defaultAsset,
			Amount: amount.String(),
		}, nil

	case map[string]interface{}:
		// Handle object format: {asset: string, amount: string}
		assetStr, ok := p["asset"].(string)
		if !ok {
			assetStr = defaultAsset
		}
		amountStr, ok := p["amount"].(string)
		if !ok {
			return x402.AssetAmount{}, fmt.Errorf("missing amount in price object")
		}

		// Parse asset info to get decimals
		assetInfo, err := evm.GetAssetInfo(networkStr, assetStr)
		if err != nil {
			return x402.AssetAmount{}, err
		}

		amount, err := evm.ParseAmount(amountStr, assetInfo.Decimals)
		if err != nil {
			return x402.AssetAmount{}, fmt.Errorf("invalid amount: %w", err)
		}

		return x402.AssetAmount{
			Asset:  fmt.Sprintf("erc20:0x%s", strings.ToLower(assetInfo.Address)),
			Amount: amount.String(),
		}, nil

	default:
		return x402.AssetAmount{}, fmt.Errorf("unsupported price type: %T", price)
	}
}

// EnhancePaymentRequirements enhances payment requirements with EVM-specific details (V1)
func (s *ExactEvmServerV1) EnhancePaymentRequirements(
	ctx context.Context,
	requirements x402.PaymentRequirements,
	supportedKind x402.SupportedKind,
	extensionKeys []string,
) (x402.PaymentRequirements, error) {
	// V1 specific: only handle version 1
	if supportedKind.X402Version != 1 {
		return requirements, fmt.Errorf("v1 only supports x402 version 1")
	}

	// Ensure extra map exists
	if requirements.Extra == nil {
		requirements.Extra = make(map[string]interface{})
	}

	// Get network configuration
	networkStr := string(requirements.Network)
	config, err := evm.GetNetworkConfig(networkStr)
	if err != nil {
		return requirements, err
	}

	// Get asset info
	assetInfo, err := evm.GetAssetInfo(networkStr, requirements.Asset)
	if err != nil {
		return requirements, err
	}

	// V1 specific: Set EIP-712 domain parameters
	requirements.Extra["name"] = assetInfo.Name
	requirements.Extra["version"] = assetInfo.Version
	requirements.Extra["chainId"] = config.ChainID.String()
	requirements.Extra["verifyingContract"] = assetInfo.Address

	// V1 specific: Add 10-minute validity window hint
	now := time.Now().Unix()
	requirements.Extra["validAfter"] = fmt.Sprintf("%d", now-600)  // 10 minutes ago
	requirements.Extra["validBefore"] = fmt.Sprintf("%d", now+600) // 10 minutes from now

	// Add display amount for UI
	amount, _ := new(big.Int).SetString(requirements.Amount, 10)
	displayAmount := evm.FormatAmount(amount, assetInfo.Decimals)
	requirements.Extra["displayAmount"] = fmt.Sprintf("%s %s", displayAmount, assetInfo.Name)

	return requirements, nil
}
