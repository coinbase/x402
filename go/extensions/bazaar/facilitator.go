package bazaar

import (
	"encoding/json"
	"fmt"

	x402 "github.com/coinbase/x402/go"
	"github.com/coinbase/x402/go/extensions/types"
	v1 "github.com/coinbase/x402/go/extensions/v1"
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

func ExtractDiscoveryInfo(
	paymentPayload x402.PaymentPayload,
	paymentRequirements interface{},
	validate bool,
) (*DiscoveredResource, error) {
	var discoveryInfo *types.DiscoveryInfo
	var resourceURL string

	if paymentPayload.X402Version == 2 {
		resourceURL = ""
		if paymentPayload.Resource != nil {
			resourceURL = paymentPayload.Resource.URL
		}

		if paymentPayload.Extensions != nil {
			if bazaarExt, ok := paymentPayload.Extensions[types.BAZAAR]; ok {
				extensionJSON, err := json.Marshal(bazaarExt)
				if err != nil {
					return nil, fmt.Errorf("failed to marshal bazaar extension: %w", err)
				}

				var extension types.DiscoveryExtension
				if err := json.Unmarshal(extensionJSON, &extension); err != nil {
					fmt.Printf("Warning: V2 discovery extension extraction failed: %v\n", err)
				} else {
					if validate {
						result := ValidateDiscoveryExtension(extension)
						if !result.Valid {
							fmt.Printf("Warning: V2 discovery extension validation failed: %v\n", result.Errors)
						} else {
							discoveryInfo = &extension.Info
						}
					} else {
						discoveryInfo = &extension.Info
					}
				}
			}
		}
	} else if paymentPayload.X402Version == 1 {
		metadata := v1.ExtractResourceMetadataV1(paymentRequirements)
		if url, ok := metadata["url"]; ok {
			resourceURL = url
		}

		infoV1, err := v1.ExtractDiscoveryInfoV1(paymentRequirements)
		if err != nil {
			return nil, err
		}
		discoveryInfo = infoV1
	} else {
		return nil, nil
	}

	if discoveryInfo == nil {
		return nil, nil
	}

	method := "UNKNOWN"
	switch input := discoveryInfo.Input.(type) {
	case types.QueryInput:
		method = string(input.Method)
	case types.BodyInput:
		method = string(input.Method)
	}

	return &DiscoveredResource{
		ResourceURL:   resourceURL,
		Method:        method,
		X402Version:   paymentPayload.X402Version,
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
