/**
 * Shared startup-time validation utilities for bazaar extensions in route configs.
 *
 * Used by middleware packages (Express, Hono, Next) to validate bazaar extensions
 * at server startup without duplicating the iteration and warning logic.
 */

import type { RoutesConfig } from "@x402/core/server";
import type { DiscoveryExtension } from "./types";
import { validateDiscoveryExtension, validateDiscoveryExtensionSpec } from "./facilitator";

/**
 * Check if any routes in the configuration declare bazaar extensions.
 *
 * @param routes - Route configuration
 * @returns True if any route has extensions.bazaar defined
 */
export function checkIfBazaarNeeded(routes: RoutesConfig): boolean {
  if ("accepts" in routes) {
    return !!(routes.extensions && "bazaar" in routes.extensions);
  }

  return Object.values(routes).some(routeConfig => {
    return !!(routeConfig.extensions && "bazaar" in routeConfig.extensions);
  });
}

/**
 * Validate bazaar extensions on all routes using JSON-schema validation.
 * Emits console warnings for invalid extensions but does not throw.
 *
 * @param routes - Route configuration to scan for bazaar extensions
 */
export function validateBazaarRouteExtensions(routes: RoutesConfig): void {
  const entries: [string, { extensions?: Record<string, unknown> }][] =
    "accepts" in routes ? [["*", routes]] : Object.entries(routes);

  for (const [pattern, config] of entries) {
    const bazaarExt = config.extensions?.["bazaar"];
    if (
      bazaarExt &&
      typeof bazaarExt === "object" &&
      "info" in (bazaarExt as Record<string, unknown>) &&
      "schema" in (bazaarExt as Record<string, unknown>)
    ) {
      const specResult = validateDiscoveryExtensionSpec(bazaarExt as Record<string, unknown>);
      if (!specResult.valid) {
        console.warn(
          `x402: Route "${pattern}" has an invalid bazaar extension: ${specResult.errors?.join(", ")}`,
        );
        continue;
      }
      const schemaResult = validateDiscoveryExtension(bazaarExt as DiscoveryExtension);
      if (!schemaResult.valid) {
        console.warn(
          `x402: Route "${pattern}" has an invalid bazaar extension: ${schemaResult.errors?.join(", ")}`,
        );
      }
    }
  }
}
