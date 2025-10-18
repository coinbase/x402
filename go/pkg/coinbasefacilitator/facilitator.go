package coinbasefacilitator

import (
	"fmt"
	"os"

	"github.com/coinbase/x402/go/pkg/types"
)

const (
	CoinbaseFacilitatorBaseURL = "https://api.cdp.coinbase.com"
	CoinbaseFacilitatorV2Route = "/platform/v2/x402"
)

// CreateCdpAuthHeaders creates CDP auth headers
func CreateCdpAuthHeaders(apiKeyID, apiKeySecret string) func() (map[string]map[string]string, error) {
	return func() (map[string]map[string]string, error) {
		id := apiKeyID
		secret := apiKeySecret

		if id == "" {
			id = os.Getenv("CDP_API_KEY_ID")
		}
		if secret == "" {
			secret = os.Getenv("CDP_API_KEY_SECRET")
		}

		if id == "" || secret == "" {
			return nil, fmt.Errorf("missing credentials: CDP_API_KEY_ID and CDP_API_KEY_SECRET must be set")
		}

		verifyPath := fmt.Sprintf("%s/verify", CoinbaseFacilitatorV2Route)
		settlePath := fmt.Sprintf("%s/settle", CoinbaseFacilitatorV2Route)
		supportedPath := fmt.Sprintf("%s/supported", CoinbaseFacilitatorV2Route)
		discoveryPath := fmt.Sprintf("%s/discovery/resources", CoinbaseFacilitatorV2Route)

		verifyToken, err := CreateAuthHeader(id, secret, CoinbaseFacilitatorBaseURL, verifyPath, "POST")
		if err != nil {
			return nil, fmt.Errorf("failed to create verify auth header: %w", err)
		}

		settleToken, err := CreateAuthHeader(id, secret, CoinbaseFacilitatorBaseURL, settlePath, "POST")
		if err != nil {
			return nil, fmt.Errorf("failed to create settle auth header: %w", err)
		}

		supportedToken, err := CreateAuthHeader(id, secret, CoinbaseFacilitatorBaseURL, supportedPath, "GET")
		if err != nil {
			return nil, fmt.Errorf("failed to create supported auth header: %w", err)
		}

		discoveryToken, err := CreateAuthHeader(id, secret, CoinbaseFacilitatorBaseURL, discoveryPath, "GET")
		if err != nil {
			return nil, fmt.Errorf("failed to create discovery auth header: %w", err)
		}

		correlationHeader := CreateCorrelationHeader()

		return map[string]map[string]string{
			"verify":    {"Authorization": verifyToken, "Correlation-Context": correlationHeader},
			"settle":    {"Authorization": settleToken, "Correlation-Context": correlationHeader},
			"supported": {"Authorization": supportedToken, "Correlation-Context": correlationHeader},
			"list":      {"Authorization": discoveryToken, "Correlation-Context": correlationHeader},
		}, nil
	}
}

// CreateFacilitatorConfig creates a facilitator config for the Coinbase X402 facilitator
func CreateFacilitatorConfig(apiKeyID, apiKeySecret string) *types.FacilitatorConfig {
	return &types.FacilitatorConfig{
		URL:               fmt.Sprintf("%s%s", CoinbaseFacilitatorBaseURL, CoinbaseFacilitatorV2Route),
		CreateAuthHeaders: CreateCdpAuthHeaders(apiKeyID, apiKeySecret),
	}
}

// Default facilitator config
var Facilitator = CreateFacilitatorConfig("", "")
