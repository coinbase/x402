package bazaar

import (
	"github.com/coinbase/x402/go/extensions/types"
)

// TransportContext abstracts the transport layer so bazaar doesn't depend on
// any concrete HTTP package.  Any type that exposes a TransportMethod() string
// (e.g. http.HTTPRequestContext) satisfies this interface via Go structural typing.
type TransportContext interface {
	TransportMethod() string
}

type bazaarResourceServerExtension struct{}

func (e *bazaarResourceServerExtension) Key() string {
	return types.BAZAAR
}

func (e *bazaarResourceServerExtension) EnrichDeclaration(
	declaration interface{},
	transportContext interface{},
) interface{} {
	tc, ok := transportContext.(TransportContext)
	if !ok {
		return declaration
	}

	extension, ok := declaration.(types.DiscoveryExtension)
	if !ok {
		return declaration
	}

	method := tc.TransportMethod()

	if queryInput, ok := extension.Info.Input.(types.QueryInput); ok {
		queryInput.Method = types.QueryParamMethods(method)
		extension.Info.Input = queryInput
	} else if bodyInput, ok := extension.Info.Input.(types.BodyInput); ok {
		bodyInput.Method = types.BodyMethods(method)
		extension.Info.Input = bodyInput
	}

	if inputSchema, ok := extension.Schema["properties"].(map[string]interface{}); ok {
		if input, ok := inputSchema["input"].(map[string]interface{}); ok {
			if required, ok := input["required"].([]string); ok {
				hasMethod := false
				for _, r := range required {
					if r == "method" {
						hasMethod = true
						break
					}
				}
				if !hasMethod {
					input["required"] = append(required, "method")
				}
			}
		}
	}

	return extension
}

var BazaarResourceServerExtension = &bazaarResourceServerExtension{}
