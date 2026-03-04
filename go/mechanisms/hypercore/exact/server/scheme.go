package server

import (
	"context"
	"fmt"
	"math"
	"regexp"
	"strconv"

	x402 "github.com/coinbase/x402/go"
	"github.com/coinbase/x402/go/mechanisms/hypercore"
	"github.com/coinbase/x402/go/types"
)

// Ensure ExactHypercoreScheme implements SchemeNetworkServer
var _ x402.SchemeNetworkServer = (*ExactHypercoreScheme)(nil)

type MoneyParser func(amount float64, network string) (*x402.AssetAmount, error)

type ExactHypercoreScheme struct {
	moneyParsers []MoneyParser
}

func NewExactHypercoreScheme() *ExactHypercoreScheme {
	return &ExactHypercoreScheme{
		moneyParsers: []MoneyParser{},
	}
}

func (s *ExactHypercoreScheme) RegisterMoneyParser(parser MoneyParser) *ExactHypercoreScheme {
	s.moneyParsers = append(s.moneyParsers, parser)
	return s
}

func (s *ExactHypercoreScheme) Scheme() string {
	return hypercore.SchemeExact
}

func (s *ExactHypercoreScheme) ParsePrice(
	price x402.Price,
	network x402.Network,
) (x402.AssetAmount, error) {
	// If already AssetAmount, return it
	if assetAmount, ok := price.(x402.AssetAmount); ok {
		if assetAmount.Asset == "" {
			return x402.AssetAmount{}, fmt.Errorf("asset required for AssetAmount on %s", network)
		}
		return assetAmount, nil
	}

	// Parse to decimal
	decimalAmount, err := s.parseMoneyToDecimal(price)
	if err != nil {
		return x402.AssetAmount{}, err
	}

	// Try custom parsers
	for _, parser := range s.moneyParsers {
		result, err := parser(decimalAmount, string(network))
		if err == nil && result != nil {
			return *result, nil
		}
	}

	// Default conversion
	return s.defaultMoneyConversion(decimalAmount, string(network))
}

func (s *ExactHypercoreScheme) parseMoneyToDecimal(price x402.Price) (float64, error) {
	priceStr := fmt.Sprintf("%v", price)
	re := regexp.MustCompile(`[\d.]+`)
	matches := re.FindString(priceStr)
	if matches == "" {
		return 0, fmt.Errorf("invalid price format: %s", priceStr)
	}
	return strconv.ParseFloat(matches, 64)
}

func (s *ExactHypercoreScheme) defaultMoneyConversion(amount float64, network string) (x402.AssetAmount, error) {
	config, ok := hypercore.NetworkConfigs[network]
	if !ok {
		return x402.AssetAmount{}, fmt.Errorf("no default asset for network %s", network)
	}

	asset := config.DefaultAsset
	tokenAmount := int64(amount * math.Pow10(asset.Decimals))

	return x402.AssetAmount{
		Amount: strconv.FormatInt(tokenAmount, 10),
		Asset:  asset.Token,
		Extra: map[string]interface{}{
			"name": asset.Name,
		},
	}, nil
}

// Adds Hypercore-specific metadata to payment requirements
func (s *ExactHypercoreScheme) EnhancePaymentRequirements(
	ctx context.Context,
	requirements types.PaymentRequirements,
	supportedKind types.SupportedKind,
	facilitatorExtensions []string,
) (types.PaymentRequirements, error) {
	if requirements.Extra == nil {
		requirements.Extra = make(map[string]interface{})
	}

	requirements.Extra["signatureChainId"] = hypercore.SignatureChainID
	requirements.Extra["isMainnet"] = supportedKind.Network == hypercore.NetworkMainnet

	return requirements, nil
}
