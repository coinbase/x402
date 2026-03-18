import type { ResourceServerExtension } from "@x402/core/types";
import type { HTTPRequestContext } from "@x402/core/http";
import { BAZAAR } from "./types";

// Non-global: safe for test/split (no stateful lastIndex side-effects).
const BRACKET_PARAM_REGEX = /\[([^\]]+)\]/;
// Global variant required for String.replace to substitute ALL occurrences.
// JS String.replace with a non-global regex replaces only the first match.
// (String.replaceAll with a non-global regex would work in ES2021+, but the
// target lib is ES2020 — keep this separate constant to avoid that constraint.)
const BRACKET_PARAM_REGEX_ALL = /\[([^\]]+)\]/g;

/**
 * Type guard to check if context is an HTTP request context.
 *
 * @param ctx - The context to check
 * @returns True if context is an HTTPRequestContext
 */
function isHTTPRequestContext(ctx: unknown): ctx is HTTPRequestContext {
  return ctx !== null && typeof ctx === "object" && "method" in ctx && "adapter" in ctx;
}

/**
 * Converts a [param]-style route pattern into a :param template and extracts concrete
 * param values from the URL path in a single call.
 *
 * @param routePattern - Route pattern with [paramName] segments (e.g. "/users/[userId]")
 * @param urlPath - Concrete URL path (e.g. "/users/123")
 * @returns Object with routeTemplate (empty string if no params) and pathParams, or null if no params
 */
function extractDynamicRouteInfo(
  routePattern: string,
  urlPath: string,
): { routeTemplate: string; pathParams: Record<string, string> } | null {
  if (!BRACKET_PARAM_REGEX.test(routePattern)) {
    return null;
  }
  const routeTemplate = routePattern.replace(BRACKET_PARAM_REGEX_ALL, ":$1");
  const pathParams = extractPathParams(routePattern, urlPath);
  return { routeTemplate, pathParams };
}

/**
 * Extracts concrete path parameter values by matching a URL path against a route pattern.
 *
 * @param routePattern - Route pattern with [paramName] segments (e.g. "/users/[userId]")
 * @param urlPath - Concrete URL path (e.g. "/users/123")
 * @returns Record mapping param names to their values
 */
function extractPathParams(routePattern: string, urlPath: string): Record<string, string> {
  const paramNames: string[] = [];
  // Split on [param] markers first so literal segments can be regex-escaped independently.
  // Without escaping, a route like /api/v1.0/[id] would produce a regex where '.' matches
  // any character (e.g. /api/v1X0/123 would incorrectly match).
  const parts = routePattern.split(BRACKET_PARAM_REGEX);
  const regexParts: string[] = [];
  parts.forEach((part, i) => {
    if (i % 2 === 0) {
      // Literal segment – escape all regex metacharacters
      regexParts.push(part.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"));
    } else {
      // Param name
      paramNames.push(part);
      regexParts.push("([^/]+)");
    }
  });

  const regex = new RegExp(`^${regexParts.join("")}$`);
  const match = urlPath.match(regex);

  if (!match) return {};

  const result: Record<string, string> = {};
  paramNames.forEach((name, idx) => {
    result[name] = match[idx + 1];
  });
  return result;
}

interface ExtensionDeclaration {
  [key: string]: unknown;
  info?: {
    [key: string]: unknown;
    input?: Record<string, unknown>;
  };
  schema?: {
    [key: string]: unknown;
    properties?: {
      [key: string]: unknown;
      input?: {
        [key: string]: unknown;
        properties?: {
          [key: string]: unknown;
          method?: Record<string, unknown>;
        };
        required?: string[];
      };
    };
  };
}

export const bazaarResourceServerExtension: ResourceServerExtension = {
  key: BAZAAR.key,

  enrichDeclaration: (declaration, transportContext) => {
    if (!isHTTPRequestContext(transportContext)) {
      return declaration;
    }

    const extension = declaration as ExtensionDeclaration;

    // MCP extensions don't need HTTP method enrichment
    if (extension.info?.input?.type === "mcp") {
      return declaration;
    }

    const method = transportContext.method;

    // At declaration time, the schema uses a broad enum (["GET", "HEAD", "DELETE"] or ["POST", "PUT", "PATCH"])
    // because the method isn't known until the HTTP context is available.
    // Here we narrow it to the actual method for precise schema validation.
    const existingInputProps = extension.schema?.properties?.input?.properties || {};
    const updatedInputProps = {
      ...existingInputProps,
      method: {
        type: "string",
        enum: [method],
      },
    };

    const enrichedResult = {
      ...extension,
      info: {
        ...(extension.info || {}),
        input: {
          ...(extension.info?.input || {}),
          method,
        },
      },
      schema: {
        ...(extension.schema || {}),
        properties: {
          ...(extension.schema?.properties || {}),
          input: {
            ...(extension.schema?.properties?.input || {}),
            properties: updatedInputProps,
            required: [
              ...(extension.schema?.properties?.input?.required || []),
              ...(!(extension.schema?.properties?.input?.required || []).includes("method")
                ? ["method"]
                : []),
            ],
          },
        },
      },
    };

    // Dynamic routes: translate [param] → :param for the routeTemplate catalog key;
    // pathParams carries runtime values (distinct from pathParamsSchema in the declaration).
    const routePattern = (transportContext as HTTPRequestContext).routePattern;
    const dynamicRoute = routePattern
      ? extractDynamicRouteInfo(routePattern, transportContext.adapter.getPath())
      : null;
    if (dynamicRoute) {
      return {
        ...enrichedResult,
        routeTemplate: dynamicRoute.routeTemplate,
        info: {
          ...enrichedResult.info,
          input: { ...enrichedResult.info.input, pathParams: dynamicRoute.pathParams },
        },
      };
    }

    return enrichedResult;
  },
};
