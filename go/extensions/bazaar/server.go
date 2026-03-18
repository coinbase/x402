package bazaar

import (
	"regexp"
	"strings"

	"github.com/coinbase/x402/go/extensions/types"
	"github.com/coinbase/x402/go/http"
)

// bracketParamRegex matches [paramName] route segments.
// Compiled once at package init to avoid per-request allocation.
var bracketParamRegex = regexp.MustCompile(`\[([^\]]+)\]`)

type bazaarResourceServerExtension struct{}

func (e *bazaarResourceServerExtension) Key() string {
	return types.BAZAAR.Key()
}

// extractDynamicRouteInfo converts a [param]-style route pattern into a :param template
// and extracts concrete param values from the URL path in a single call.
// Returns an empty routeTemplate and nil pathParams when routePattern contains no [param] segments.
func extractDynamicRouteInfo(routePattern, urlPath string) (routeTemplate string, pathParams map[string]string) {
	matches := bracketParamRegex.FindAllStringSubmatch(routePattern, -1)
	if len(matches) == 0 {
		return "", nil
	}
	routeTemplate = bracketParamRegex.ReplaceAllString(routePattern, ":$1")
	pathParams = extractPathParams(routePattern, urlPath)
	return
}

// extractPathParams extracts concrete path parameter values by matching a URL path
// against a route pattern containing [paramName] segments.
func extractPathParams(routePattern, urlPath string) map[string]string {
	matches := bracketParamRegex.FindAllStringSubmatch(routePattern, -1)

	paramNames := make([]string, 0, len(matches))
	for _, m := range matches {
		paramNames = append(paramNames, m[1])
	}

	// Split the pattern on [paramName] segments, escape each literal part,
	// then join with capture groups to build the matching regex.
	parts := bracketParamRegex.Split(routePattern, -1)
	regexParts := make([]string, 0, len(parts)+len(paramNames))
	for i, part := range parts {
		regexParts = append(regexParts, regexp.QuoteMeta(part))
		if i < len(paramNames) {
			regexParts = append(regexParts, "([^/]+)")
		}
	}
	captureRegex, err := regexp.Compile("^" + strings.Join(regexParts, "") + "$")
	if err != nil {
		return map[string]string{}
	}

	submatches := captureRegex.FindStringSubmatch(urlPath)
	if submatches == nil {
		return map[string]string{}
	}

	result := make(map[string]string, len(paramNames))
	for i, name := range paramNames {
		if i+1 < len(submatches) {
			result[name] = submatches[i+1]
		}
	}
	return result
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

	// Dynamic routes: translate [param] → :param for the routeTemplate catalog key;
	// pathParams carries runtime values (distinct from pathParamsSchema in the declaration).
	var urlPath string
	if httpContext.Adapter != nil {
		urlPath = httpContext.Adapter.GetPath()
	}
	routeTemplate, pathParams := extractDynamicRouteInfo(httpContext.RoutePattern, urlPath)
	if routeTemplate != "" {
		// Widen map[string]string to map[string]interface{} for the wire-level PathParams field
		pathParamsIface := make(map[string]interface{}, len(pathParams))
		for k, v := range pathParams {
			pathParamsIface[k] = v
		}

		// Update input with pathParams
		if queryInput, ok := extension.Info.Input.(types.QueryInput); ok {
			queryInput.PathParams = pathParamsIface
			extension.Info.Input = queryInput
		} else if bodyInput, ok := extension.Info.Input.(types.BodyInput); ok {
			bodyInput.PathParams = pathParamsIface
			extension.Info.Input = bodyInput
		}

		extension.RouteTemplate = routeTemplate
		return extension
	}

	return extension
}

var BazaarResourceServerExtension = &bazaarResourceServerExtension{}
