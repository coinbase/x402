package bazaar

import (
	"github.com/coinbase/x402/go/extensions/types"
	"github.com/coinbase/x402/go/http"
)

type bazaarResourceServerExtension struct{}

func (e *bazaarResourceServerExtension) Key() string {
	return types.BAZAAR
}

func (e *bazaarResourceServerExtension) EnrichDeclaration(
	declaration interface{},
	transportContext interface{},
) interface{} {
	httpContext, ok := transportContext.(http.HTTPRequestContext)
	if !ok {
		return declaration
	}

	extension, ok := declaration.(types.DiscoveryExtension)
	if !ok {
		return declaration
	}

	method := httpContext.Method

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
