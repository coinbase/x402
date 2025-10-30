/*
Package bazaar provides the Bazaar Discovery Extension for x402 v2 and v1.

Enables facilitators to automatically catalog and index x402-enabled resources
by following the server's provided discovery instructions.

# V2 Usage

The v2 extension follows a pattern where:
  - `info`: Contains the actual discovery data (the values)
  - `schema`: JSON Schema that validates the structure of `info`

# For Resource Servers (V2)

	import "github.com/coinbase/x402/go/extensions/bazaar"

	// Declare a GET endpoint
	extension, err := bazaar.DeclareDiscoveryExtension(
		bazaar.MethodGET,
		map[string]interface{}{"query": "example"},
		bazaar.JSONSchema{
			"properties": map[string]interface{}{
				"query": map[string]interface{}{"type": "string"},
			},
			"required": []string{"query"},
		},
		"",
		nil,
	)

	// Include in PaymentRequired response
	paymentRequired := x402.PaymentRequired{
		X402Version: 2,
		Resource: x402.Resource{...},
		Accepts: []x402.PaymentRequirements{...},
		Extensions: map[string]interface{}{
			bazaar.BAZAAR: extension,
		},
	}

# For Facilitators (V2 and V1)

	import "github.com/coinbase/x402/go/extensions/bazaar"

	// V2: Extensions are in PaymentPayload.Extensions (client copied from PaymentRequired)
	// V1: Discovery info is in PaymentRequirements.OutputSchema
	info, err := bazaar.ExtractDiscoveryInfo(
		paymentPayload,
		paymentRequirements,
		true, // validate
	)

	if info != nil {
		// Catalog info in Bazaar
	}

# V1 Support

V1 discovery information is stored in the `outputSchema` field of PaymentRequirements.
The `ExtractDiscoveryInfo` function automatically handles v1 format as a fallback.

	import v1 "github.com/coinbase/x402/go/extensions/bazaar/v1"

	// Direct v1 extraction
	infoV1, err := v1.ExtractDiscoveryInfoV1(paymentRequirementsV1)
*/
package bazaar



