package tokenmetadata

import (
	"context"
	"encoding/json"
	"fmt"
	"net/http"
	"strings"
	"time"
)

// DefaultBaseURL is the default URL for the token metadata API
const DefaultBaseURL = "https://tokens.anyspend.com"

// DefaultTimeout is the default HTTP client timeout
const DefaultTimeout = 10 * time.Second

// TokenMetadata represents the response from the token metadata API
type TokenMetadata struct {
	ChainID        int    `json:"chainId"`
	TokenAddress   string `json:"tokenAddress"`
	Name           string `json:"name"`
	Symbol         string `json:"symbol"`
	Decimals       int    `json:"decimals"`
	LogoURL        string `json:"logoUrl"`
	SupportsEip2612 bool   `json:"supportsEip2612"`
	SupportsEip3009 bool   `json:"supportsEip3009"`
	Version        string `json:"version,omitempty"`
}

// Config contains configuration for the token metadata client
type Config struct {
	// BaseURL is the base URL of the token metadata service
	// Defaults to tokens.anyspend.com if not set
	BaseURL string
	// Timeout is the HTTP client timeout
	// Defaults to 10 seconds if not set
	Timeout time.Duration
}

// Client is HTTP client for the token metadata API (tokens.anyspend.com)
type Client struct {
	baseURL    string
	httpClient *http.Client
}

// NewClient creates a new token metadata client
func NewClient(config Config) *Client {
	baseURL := config.BaseURL
	if baseURL == "" {
		baseURL = DefaultBaseURL
	}

	timeout := config.Timeout
	if timeout == 0 {
		timeout = DefaultTimeout
	}

	return &Client{
		baseURL: strings.TrimSuffix(baseURL, "/"),
		httpClient: &http.Client{
			Timeout: timeout,
		},
	}
}

// networkToChainName converts network name to the API's chain name
func networkToChainName(network string) string {
	// Network names are already in the format the API expects
	switch network {
	case "ethereum", "base", "base-sepolia", "polygon", "arbitrum", "optimism", "bsc", "avalanche", "abstract", "b3":
		return network
	default:
		return network
	}
}

// chainIDToChainName converts chain ID to the API's chain name
func chainIDToChainName(chainID int) string {
	switch chainID {
	case 1:
		return "ethereum"
	case 10:
		return "optimism"
	case 56:
		return "bsc"
	case 137:
		return "polygon"
	case 2741:
		return "abstract"
	case 8333:
		return "b3"
	case 8453:
		return "base"
	case 84532:
		return "base-sepolia"
	case 42161:
		return "arbitrum"
	case 43114:
		return "avalanche"
	default:
		return ""
	}
}

// GetMetadata fetches token metadata by network name and token address
func (c *Client) GetMetadata(ctx context.Context, network string, tokenAddress string) (*TokenMetadata, error) {
	chainName := networkToChainName(network)
	if chainName == "" {
		return nil, fmt.Errorf("unsupported network: %s", network)
	}

	return c.fetchMetadata(ctx, chainName, tokenAddress)
}

// GetMetadataByChainID fetches token metadata by chain ID and token address
func (c *Client) GetMetadataByChainID(ctx context.Context, chainID int, tokenAddress string) (*TokenMetadata, error) {
	chainName := chainIDToChainName(chainID)
	if chainName == "" {
		return nil, fmt.Errorf("unsupported chain ID: %d", chainID)
	}

	return c.fetchMetadata(ctx, chainName, tokenAddress)
}

// fetchMetadata makes the actual API request
func (c *Client) fetchMetadata(ctx context.Context, chainName string, tokenAddress string) (*TokenMetadata, error) {
	url := fmt.Sprintf("%s/metadata/%s/%s", c.baseURL, chainName, strings.ToLower(tokenAddress))

	req, err := http.NewRequestWithContext(ctx, http.MethodGet, url, nil)
	if err != nil {
		return nil, fmt.Errorf("failed to create request: %w", err)
	}
	req.Header.Set("Accept", "application/json")

	resp, err := c.httpClient.Do(req)
	if err != nil {
		return nil, fmt.Errorf("failed to fetch token metadata: %w", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode == http.StatusNotFound {
		return nil, fmt.Errorf("token not found: %s on %s", tokenAddress, chainName)
	}

	if resp.StatusCode != http.StatusOK {
		return nil, fmt.Errorf("token metadata API returned status %d", resp.StatusCode)
	}

	var metadata TokenMetadata
	if err := json.NewDecoder(resp.Body).Decode(&metadata); err != nil {
		return nil, fmt.Errorf("failed to decode token metadata: %w", err)
	}

	// Default version to "2" if not provided (standard for EIP-3009/EIP-2612 tokens)
	if metadata.Version == "" {
		metadata.Version = "2"
	}

	return &metadata, nil
}
