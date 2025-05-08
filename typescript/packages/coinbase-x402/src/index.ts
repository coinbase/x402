import { createAuthHeader, createCorrelationHeader } from "x402/shared";
import { FacilitatorConfig } from "x402/types";
import { CreateHeaders } from "x402/verify";

const COINBASE_FACILITATOR_BASE_URL = "https://api.cdp.coinbase.com";
const COINBASE_FACILITATOR_V2_ROUTE = "/platform/v2/x402";

/**
 * Creates a CDP auth header for the facilitator service
 *
 * @param apiKeyId - The CDP API key ID
 * @param apiKeySecret - The CDP API key secret
 * @returns A function that returns the auth headers
 */
export function createCdpAuthHeaders(apiKeyId?: string, apiKeySecret?: string): CreateHeaders {
  const requestHost = COINBASE_FACILITATOR_BASE_URL.replace("https://", "");

  return async () => {
    apiKeyId = apiKeyId ?? process.env.CDP_API_KEY_ID;
    apiKeySecret = apiKeySecret ?? process.env.CDP_API_KEY_SECRET;

    if (!apiKeyId || !apiKeySecret) {
      throw new Error(
        "Missing environment variables: CDP_API_KEY_ID and CDP_API_KEY_SECRET must be set when using default facilitator",
      );
    }

    return {
      verify: {
        Authorization: await createAuthHeader(
          apiKeyId,
          apiKeySecret,
          requestHost,
          `${COINBASE_FACILITATOR_V2_ROUTE}/verify`,
        ),
        "Correlation-Context": createCorrelationHeader(),
      },
      settle: {
        Authorization: await createAuthHeader(
          apiKeyId,
          apiKeySecret,
          requestHost,
          `${COINBASE_FACILITATOR_V2_ROUTE}/settle`,
        ),
        "Correlation-Context": createCorrelationHeader(),
      },
    };
  };
}

/**
 * Creates a facilitator config for the Coinbase X402 facilitator
 *
 * @param apiKeyId - The CDP API key ID
 * @param apiKeySecret - The CDP API key secret
 * @returns A facilitator config
 */
export function createFacilitatorConfig(
  apiKeyId?: string,
  apiKeySecret?: string,
): FacilitatorConfig {
  return {
    url: `${COINBASE_FACILITATOR_BASE_URL}${COINBASE_FACILITATOR_V2_ROUTE}`,
    createAuthHeaders: createCdpAuthHeaders(apiKeyId, apiKeySecret),
  };
}

export const facilitator = createFacilitatorConfig();
