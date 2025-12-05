package bazaar

import (
	"encoding/json"
	"fmt"

	x402 "github.com/coinbase/x402/go"
	"github.com/coinbase/x402/go/extensions/types"
	v1 "github.com/coinbase/x402/go/extensions/v1"
	x402types "github.com/coinbase/x402/go/types"
	"github.com/xeipuuv/gojsonschema"
)

// ValidationResult represents the result of validating a discovery extension
type ValidationResult struct {
	Valid  bool
	Errors []string
}

// ValidateDiscoveryExtension validates a discovery extension's info against its schema
//
// Args:
//   - extension: The discovery extension containing info and schema
//
// Returns:
//   - ValidationResult indicating if the info matches the schema
//
// Example:
//
//	extension, _ := bazaar.DeclareDiscoveryExtension(...)
//	result := bazaar.ValidateDiscoveryExtension(extension)
//
//	if result.Valid {
//	    fmt.Println("Extension is valid")
//	} else {
//	    fmt.Println("Validation errors:", result.Errors)
//	}
func ValidateDiscoveryExtension(extension types.DiscoveryExtension) ValidationResult {
	// Convert schema to JSON
	schemaJSON, err := json.Marshal(extension.Schema)
	if err != nil {
		return ValidationResult{
			Valid:  false,
			Errors: []string{fmt.Sprintf("Failed to marshal schema: %v", err)},
		}
	}

	// Convert info to JSON
	infoJSON, err := json.Marshal(extension.Info)
	if err != nil {
		return ValidationResult{
			Valid:  false,
			Errors: []string{fmt.Sprintf("Failed to marshal info: %v", err)},
		}
	}

	// Create schema loader
	schemaLoader := gojsonschema.NewBytesLoader(schemaJSON)

	// Create document loader
	documentLoader := gojsonschema.NewBytesLoader(infoJSON)

	// Validate
	result, err := gojsonschema.Validate(schemaLoader, documentLoader)
	if err != nil {
		return ValidationResult{
			Valid:  false,
			Errors: []string{fmt.Sprintf("Schema validation failed: %v", err)},
		}
	}

	if result.Valid() {
		return ValidationResult{Valid: true}
	}

	// Collect errors
	var errors []string
	for _, desc := range result.Errors() {
		errors = append(errors, fmt.Sprintf("%s: %s", desc.Context().String(), desc.Description()))
	}

	return ValidationResult{
		Valid:  false,
		Errors: errors,
	}
}

type DiscoveredResource struct {
	ResourceURL   string
	Method        string
	X402Version   int
	DiscoveryInfo *types.DiscoveryInfo
}

// ExtractDiscoveryInfo extracts discovery information from payment payload and requirements bytes.
// This is the recommended function for facilitators to use in their hooks.
//
// Args:
//   - payloadBytes: Raw JSON bytes of the payment payload
//   - requirementsBytes: Raw JSON bytes of the payment requirements
//   - validate: Whether to validate the discovery info against the schema (default: true)
//
// Returns:
//   - DiscoveredResource with URL, method, version and discovery data, or nil if not found
//   - Error if extraction or validation fails
//
// Example:
//
//	discovered, err := bazaar.ExtractDiscoveryInfo(
//	    ctx.PayloadBytes,
//	    ctx.RequirementsBytes,
//	    true, // validate
//	)
//	if err != nil {
//	    log.Printf("Failed to extract discovery info: %v", err)
//	    return nil
//	}
//	if discovered != nil {
//	    // Catalog the discovered resource
//	}
func ExtractDiscoveryInfo(
	payloadBytes []byte,
	requirementsBytes []byte,
	validate bool,
) (*DiscoveredResource, error) {
	// First detect version to know how to unmarshal
	var versionCheck struct {
		X402Version int `json:"x402Version"`
	}
	if err := json.Unmarshal(payloadBytes, &versionCheck); err != nil {
		return nil, fmt.Errorf("failed to parse version: %w", err)
	}

	var discoveryInfo *types.DiscoveryInfo
	var resourceURL string
	version := versionCheck.X402Version

	if version == 2 {
		// V2: Unmarshal full payload to access extensions and resource
		var payload x402.PaymentPayload
		if err := json.Unmarshal(payloadBytes, &payload); err != nil {
			return nil, fmt.Errorf("failed to unmarshal v2 payload: %w", err)
		}

		// Extract resource URL
		if payload.Resource != nil {
			resourceURL = payload.Resource.URL
		}

		// Extract discovery info from extensions
		if payload.Extensions != nil {
			if bazaarExt, ok := payload.Extensions[types.BAZAAR]; ok {
				extensionJSON, err := json.Marshal(bazaarExt)
				if err != nil {
					return nil, fmt.Errorf("failed to marshal bazaar extension: %w", err)
				}

				var extension types.DiscoveryExtension
				if err := json.Unmarshal(extensionJSON, &extension); err != nil {
					return nil, fmt.Errorf("v2 discovery extension extraction failed: %w", err)
				}

				if validate {
					result := ValidateDiscoveryExtension(extension)
					if !result.Valid {
						return nil, fmt.Errorf("v2 discovery extension validation failed: %s", result.Errors)
					}
				}
				discoveryInfo = &extension.Info
			}
		}
	} else if version == 1 {
		// V1: Unmarshal requirements to access outputSchema
		var requirementsV1 x402types.PaymentRequirementsV1
		if err := json.Unmarshal(requirementsBytes, &requirementsV1); err != nil {
			return nil, fmt.Errorf("failed to unmarshal v1 requirements: %w", err)
		}

		// Extract resource URL from requirements
		resourceURL = requirementsV1.Resource

		// Extract discovery info from outputSchema
		infoV1, err := v1.ExtractDiscoveryInfoV1(requirementsV1)
		if err != nil {
			return nil, fmt.Errorf("v1 discovery extraction failed: %w", err)
		}
		discoveryInfo = infoV1
	} else {
		return nil, fmt.Errorf("unsupported version: %d", version)
	}

	// No discovery info found (not an error, just not discoverable)
	if discoveryInfo == nil {
		return nil, nil
	}

	// Extract method from discovery info
	method := "UNKNOWN"
	switch input := discoveryInfo.Input.(type) {
	case types.QueryInput:
		method = string(input.Method)
	case types.BodyInput:
		method = string(input.Method)
	}

	if method == "UNKNOWN" {
		return nil, fmt.Errorf("failed to extract method from discovery info")
	}

	return &DiscoveredResource{
		ResourceURL:   resourceURL,
		Method:        method,
		X402Version:   version,
		DiscoveryInfo: discoveryInfo,
	}, nil
}

// ExtractDiscoveryInfoFromExtension extracts discovery info from a v2 extension directly
//
// This is a lower-level function for when you already have the extension object.
// For general use, prefer the main ExtractDiscoveryInfo function.
//
// Args:
//   - extension: The discovery extension to extract info from
//   - validate: Whether to validate before extracting (default: true)
//
// Returns:
//   - The discovery info if valid
//   - Error if validation fails and validate is true
func ExtractDiscoveryInfoFromExtension(
	extension types.DiscoveryExtension,
	validate bool,
) (*types.DiscoveryInfo, error) {
	if validate {
		result := ValidateDiscoveryExtension(extension)
		if !result.Valid {
			errorMsg := "Unknown error"
			if len(result.Errors) > 0 {
				errorMsg = result.Errors[0]
				for i := 1; i < len(result.Errors); i++ {
					errorMsg += ", " + result.Errors[i]
				}
			}
			return nil, fmt.Errorf("invalid discovery extension: %s", errorMsg)
		}
	}

	return &extension.Info, nil
}

// ValidateAndExtract validates and extracts discovery info in one step
//
// This is a convenience function that combines validation and extraction,
// returning both the validation result and the info if valid.
//
// Args:
//   - extension: The discovery extension to validate and extract
//
// Returns:
//   - ValidationResult with the discovery info if valid
//
// Example:
//
//	extension, _ := bazaar.DeclareDiscoveryExtension(...)
//	result := bazaar.ValidateAndExtract(extension)
//
//	if result.Valid {
//	    // Use result.Info
//	} else {
//	    fmt.Println("Validation errors:", result.Errors)
//	}
func ValidateAndExtract(extension types.DiscoveryExtension) struct {
	Valid  bool
	Info   *types.DiscoveryInfo
	Errors []string
} {
	result := ValidateDiscoveryExtension(extension)

	if result.Valid {
		return struct {
			Valid  bool
			Info   *types.DiscoveryInfo
			Errors []string
		}{
			Valid: true,
			Info:  &extension.Info,
		}
	}

	return struct {
		Valid  bool
		Info   *types.DiscoveryInfo
		Errors []string
	}{
		Valid:  false,
		Errors: result.Errors,
	}
}
