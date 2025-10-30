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

// ExtractDiscoveryInfo extracts the discovery info from payment payload and requirements
//
// This function handles both v2 (extensions) and v1 (outputSchema) formats.
//
// For v2: Discovery info is in PaymentPayload.Extensions (client copied it from PaymentRequired)
// For v1: Discovery info is in PaymentRequirements.OutputSchema
//
// V1 data is automatically transformed to v2 DiscoveryInfo format.
//
// Args:
//   - paymentPayload: The payment payload containing extensions (v2) and version info
//   - paymentRequirements: The payment requirements (contains outputSchema for v1)
//   - validate: Whether to validate v2 extensions before extracting (default: true)
//
// Returns:
//   - The discovery info in v2 format if present, or nil if not discoverable
//
// Example:
//
//	// V2 - extensions are in PaymentPayload
//	info, err := bazaar.ExtractDiscoveryInfo(paymentPayload, paymentRequirements, true)
//
//	// V1 - discovery info is in PaymentRequirements.OutputSchema
//	info, err := bazaar.ExtractDiscoveryInfo(paymentPayloadV1, paymentRequirementsV1, true)
//
//	if info != nil {
//	    // Both v1 and v2 return the same DiscoveryInfo structure
//	    fmt.Printf("Method: %v\n", info.Input)
//	}
func ExtractDiscoveryInfo(
	paymentPayload x402.PaymentPayload,
	paymentRequirements interface{}, // Can be PaymentRequirements or PaymentRequirementsV1
	validate bool,
) (*types.DiscoveryInfo, error) {
	// Try v2 first - extensions are in PaymentPayload (client copied from PaymentRequired)
	if paymentPayload.X402Version == 2 && paymentPayload.Extensions != nil {
		if bazaarExt, ok := paymentPayload.Extensions[types.BAZAAR]; ok {
			// Convert to DiscoveryExtension
			extensionJSON, err := json.Marshal(bazaarExt)
			if err != nil {
				return nil, fmt.Errorf("failed to marshal bazaar extension: %w", err)
			}

			var extension types.DiscoveryExtension
			if err := json.Unmarshal(extensionJSON, &extension); err != nil {
				// V2 extraction failed, fall through to try v1
				fmt.Printf("Warning: V2 discovery extension extraction failed: %v\n", err)
			} else {
				if validate {
					result := ValidateDiscoveryExtension(extension)
					if !result.Valid {
						// V2 validation failed, fall through to try v1
						fmt.Printf("Warning: V2 discovery extension validation failed: %v\n", result.Errors)
					} else {
						return &extension.Info, nil
					}
				} else {
					return &extension.Info, nil
				}
			}
		}
	}

	// Try v1 format - discovery info is in PaymentRequirements.OutputSchema
	if paymentPayload.X402Version == 1 || paymentPayload.X402Version == 2 {
		// Try to extract v1 info
		infoV1, err := v1.ExtractDiscoveryInfoV1(paymentRequirements)
		if err != nil {
			return nil, err
		}
		if infoV1 != nil {
			return infoV1, nil
		}
	}

	// No discovery info found
	return nil, nil
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
