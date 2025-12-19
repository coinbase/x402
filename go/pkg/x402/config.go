package x402

import "github.com/coinbase/x402/go/pkg/types"

// Config represents the x402 payment configuration for a protected resource.
// This is what workflow creators configure when setting up x402 payment gating.
type Config struct {
	// Required - payment destination
	// Price is the amount in the smallest unit of the token (e.g., 1000000 for 1 USDC)
	Price string `json:"price"`
	// Token is the ERC20 token contract address that seller wants to receive
	Token string `json:"token"`
	// ChainID is the chain ID where payment should be made (e.g., 8453 for Base)
	ChainID int `json:"chainId"`
	// Recipient is the address that will receive the payment
	Recipient string `json:"recipient"`

	// Optional - display/response customization
	// Description is shown in the 402 response to explain what the resource does
	Description string `json:"description,omitempty"`
	// MimeType is the content type of the protected resource
	MimeType string `json:"mimeType,omitempty"`
	// MaxTimeoutSeconds is how long the payment signature is valid (default: 60)
	MaxTimeoutSeconds int `json:"maxTimeoutSeconds,omitempty"`

	// Optional - Bazaar discovery
	// Discoverable controls whether this resource appears in the discovery catalog
	Discoverable bool `json:"discoverable,omitempty"`
	// DiscoveryInput describes the expected input schema for documentation
	DiscoveryInput *types.DiscoverySchemaDefinition `json:"discoveryInput,omitempty"`
	// DiscoveryOutput describes the expected output schema for documentation
	DiscoveryOutput *types.DiscoverySchemaDefinition `json:"discoveryOutput,omitempty"`
	// DiscoveryMetadata contains additional metadata for the discovery catalog
	DiscoveryMetadata *types.DiscoveryMetadata `json:"discoveryMetadata,omitempty"`
}

// DefaultMaxTimeoutSeconds is the default payment signature validity window
// 300 seconds (5 minutes) to account for network delays and multi-step testing
const DefaultMaxTimeoutSeconds = 300

// Validate checks if the config has all required fields
func (c *Config) Validate() error {
	if c.Price == "" {
		return ErrMissingPrice
	}
	if c.Token == "" {
		return ErrMissingToken
	}
	if c.ChainID == 0 {
		return ErrMissingChainID
	}
	if c.Recipient == "" {
		return ErrMissingRecipient
	}
	return nil
}

// GetMaxTimeoutSeconds returns the max timeout seconds, defaulting to 60 if not set
func (c *Config) GetMaxTimeoutSeconds() int {
	if c.MaxTimeoutSeconds <= 0 {
		return DefaultMaxTimeoutSeconds
	}
	return c.MaxTimeoutSeconds
}
