package types

// =============================================================================
// Discovery Types (Bazaar extension)
// Matches TypeScript SDK: types/shared/middleware.ts
// =============================================================================

// DiscoveryMetadata contains metadata for the Bazaar discovery catalog.
// This information helps users discover and understand available paid endpoints.
type DiscoveryMetadata struct {
	// Name is the display name for the resource
	Name string `json:"name,omitempty"`
	// Description provides details about what the resource does
	Description string `json:"description,omitempty"`
	// Category groups resources (e.g., "data", "automation", "ai")
	Category string `json:"category,omitempty"`
	// Tags for searchable keywords
	Tags []string `json:"tags,omitempty"`
	// Documentation URL for additional documentation
	Documentation string `json:"documentation,omitempty"`
	// Logo URL for the resource/provider logo
	Logo string `json:"logo,omitempty"`
	// Provider is the name of the entity providing this resource
	Provider string `json:"provider,omitempty"`
}

// DiscoverySchemaDefinition defines input/output schema for discovery.
// Used to document what the endpoint expects and returns.
type DiscoverySchemaDefinition struct {
	// Example provides a sample value for documentation and testing
	Example any `json:"example,omitempty"`
	// Schema is a JSON Schema definition for validation
	Schema map[string]any `json:"schema,omitempty"`
}

// DiscoveryResource represents a discovered resource from the facilitator.
// Returned by GET /x402/discovery/resources
type DiscoveryResource struct {
	// Resource is the URL of the x402-protected endpoint
	Resource string `json:"resource"`
	// Type is the resource type (currently only "http")
	Type string `json:"type"`
	// X402Version is the protocol version
	X402Version int `json:"x402Version"`
	// Accepts contains the payment requirements for this resource
	Accepts []PaymentRequirements `json:"accepts"`
	// LastUpdated is when this resource was last registered/updated
	LastUpdated string `json:"lastUpdated"`
	// Metadata contains optional discovery metadata
	Metadata *DiscoveryMetadata `json:"metadata,omitempty"`
}

// DiscoveryListResponse represents the response from discovery list endpoint.
// GET /x402/discovery/resources
type DiscoveryListResponse struct {
	X402Version int                 `json:"x402Version"`
	Items       []DiscoveryResource `json:"items"`
	Pagination  DiscoveryPagination `json:"pagination"`
}

// DiscoveryPagination contains pagination info for discovery list.
type DiscoveryPagination struct {
	Limit  int `json:"limit"`
	Offset int `json:"offset"`
	Total  int `json:"total"`
}

// DiscoveryRegisterRequest represents the request to register a resource.
// POST /x402/discovery/resources (internal API - may require auth)
type DiscoveryRegisterRequest struct {
	Resource string                `json:"resource"`
	Type     string                `json:"type"` // "http"
	Accepts  []PaymentRequirements `json:"accepts"`
	Metadata *DiscoveryMetadata    `json:"metadata,omitempty"`
}

// ListResourcesOptions contains options for listing discovery resources.
type ListResourcesOptions struct {
	// Type filters by resource type (e.g., "http")
	Type string
	// Limit is the maximum number of items to return
	Limit int
	// Offset is the number of items to skip
	Offset int
}
