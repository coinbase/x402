/**
 * Client extensions for querying Bazaar discovery resources
 */

import { HTTPFacilitatorClient } from "@x402/core/http";
import { WithExtensions } from "../types";

/**
 * Parameters for listing discovery resources.
 * All parameters are optional and used for filtering/pagination.
 */
export interface ListDiscoveryResourcesParams {
  /**
   * Filter by protocol type (e.g., "http", "mcp").
   * Currently, the only supported protocol type is "http".
   */
  type?: string;

  /**
   * The number of discovered x402 resources to return per page.
   */
  limit?: number;

  /**
   * The offset of the first discovered x402 resource to return.
   */
  offset?: number;
}

/**
 * A discovered x402 resource from the bazaar.
 */
export interface DiscoveryResource {
  /** The URL of the discovered resource */
  url: string;
  /** The protocol type of the resource */
  type: string;
  /** Additional metadata about the resource */
  metadata?: Record<string, unknown>;
}

/**
 * Response from listing discovery resources.
 */
export interface DiscoveryResourcesResponse {
  /** The list of discovered resources */
  resources: DiscoveryResource[];
  /** Total count of resources matching the query */
  total?: number;
  /** The limit used for this query */
  limit?: number;
  /** The offset used for this query */
  offset?: number;
}

/**
 * Bazaar client extension interface providing discovery query functionality.
 */
export interface BazaarClientExtension {
  discovery: {
    /**
     * List x402 discovery resources from the bazaar.
     *
     * @param params - Optional filtering and pagination parameters
     * @returns A promise resolving to the discovery resources response
     */
    listResources(params?: ListDiscoveryResourcesParams): Promise<DiscoveryResourcesResponse>;
  };
}

/**
 * Extends a facilitator client with Bazaar discovery query functionality.
 * Preserves and merges with any existing extensions from prior chaining.
 *
 * @param client - The facilitator client to extend
 * @returns The client extended with bazaar discovery capabilities
 *
 * @example
 * ```ts
 * // Basic usage
 * const client = withBazaar(new HTTPFacilitatorClient());
 * const resources = await client.extensions.discovery.listResources({ type: "http" });
 *
 * // Chaining with other extensions
 * const client = withBazaar(withOtherExtension(new HTTPFacilitatorClient()));
 * await client.extensions.other.someMethod();
 * await client.extensions.discovery.listResources();
 * ```
 */
export function withBazaar<T extends HTTPFacilitatorClient>(
  client: T,
): WithExtensions<T, BazaarClientExtension> {
  // Preserve any existing extensions from prior chaining
  const existingExtensions =
    (client as T & { extensions?: Record<string, unknown> }).extensions ?? {};

  const extended = client as WithExtensions<T, BazaarClientExtension>;

  extended.extensions = {
    ...existingExtensions,
    discovery: {
      async listResources(
        params?: ListDiscoveryResourcesParams,
      ): Promise<DiscoveryResourcesResponse> {
        let headers: Record<string, string> = {
          "Content-Type": "application/json",
        };

        const authHeaders = await client.createAuthHeaders("discovery");
        headers = { ...headers, ...authHeaders.headers };

        const queryParams = new URLSearchParams();
        if (params?.type !== undefined) {
          queryParams.set("type", params.type);
        }
        if (params?.limit !== undefined) {
          queryParams.set("limit", params.limit.toString());
        }
        if (params?.offset !== undefined) {
          queryParams.set("offset", params.offset.toString());
        }

        const queryString = queryParams.toString();
        const endpoint = `${client.url}/discovery/resources${queryString ? `?${queryString}` : ""}`;

        const response = await fetch(endpoint, {
          method: "GET",
          headers,
        });

        if (!response.ok) {
          const errorText = await response.text().catch(() => response.statusText);
          throw new Error(
            `Facilitator listDiscoveryResources failed (${response.status}): ${errorText}`,
          );
        }

        return (await response.json()) as DiscoveryResourcesResponse;
      },
    },
  } as WithExtensions<T, BazaarClientExtension>["extensions"];

  return extended;
}
