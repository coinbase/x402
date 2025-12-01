import type { ResourceServerExtension } from "@x402/core/types";
import type { HTTPRequestContext } from "@x402/core/http";
import { BAZAAR } from "./types";

/**
 * Type guard to check if context is an HTTP request context.
 *
 * @param ctx - The context to check
 * @returns True if context is an HTTPRequestContext
 */
function isHTTPRequestContext(ctx: unknown): ctx is HTTPRequestContext {
  return ctx !== null && typeof ctx === "object" && "method" in ctx && "adapter" in ctx;
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
        required?: string[];
      };
    };
  };
}

export const bazaarResourceServerExtension: ResourceServerExtension = {
  key: BAZAAR,

  enrichDeclaration: (declaration, transportContext) => {
    if (!isHTTPRequestContext(transportContext)) {
      return declaration;
    }

    const extension = declaration as ExtensionDeclaration;
    const method = transportContext.method;

    return {
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
  },
};
