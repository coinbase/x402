import { generateJwt } from "@coinbase/cdp-sdk/auth";
import { FacilitatorConfig } from "@hyperpay/x402/types";
import { CreateHeaders } from "@hyperpay/x402/verify";

const COINBASE_FACILITATOR_BASE_URL = "https://api.cdp.coinbase.com";
const COINBASE_FACILITATOR_V2_ROUTE = "/platform/v2/x402";

const X402_SDK_VERSION = "0.7.3";
const CDP_SDK_VERSION = "1.29.0";

/**
 * Creates an authorization header for a request to the Coinbase API.
 *
 * @param apiKeyId - The api key ID
 * @param apiKeySecret - The api key secret
 * @param requestMethod - The method for the request (e.g. 'POST')
 * @param requestHost - The host for the request (e.g. 'https://x402.org/facilitator')
 * @param requestPath - The path for the request (e.g. '/verify')
 * @returns The authorization header string
 */
export async function createAuthHeader(
  apiKeyId: string,
  apiKeySecret: string,
  requestMethod: string,
  requestHost: string,
  requestPath: string,
) {
  const jwt = await generateJwt({
    apiKeyId,
    apiKeySecret,
    requestMethod,
    requestHost,
    requestPath,
  });
  return `Bearer ${jwt}`;
}

/**
 * Creates a correlation header for a request to the Coinbase API.
 *
 * @returns The correlation header string
 */
export function createCorrelationHeader(): string {
  const data: Record<string, string> = {
    sdk_version: CDP_SDK_VERSION,
    sdk_language: "typescript",
    source: "x402",
    source_version: X402_SDK_VERSION,
  };
  return Object.keys(data)
    .map(key => `${key}=${encodeURIComponent(data[key])}`)
    .join(",");
}

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

    const headers = {
      verify: {
        "Correlation-Context": createCorrelationHeader(),
      } as Record<string, string>,
      settle: {
        "Correlation-Context": createCorrelationHeader(),
      } as Record<string, string>,
      supported: {
        "Correlation-Context": createCorrelationHeader(),
      } as Record<string, string>,
      list: {
        "Correlation-Context": createCorrelationHeader(),
      },
    };

    if (apiKeyId && apiKeySecret) {
      headers.verify.Authorization = await createAuthHeader(
        apiKeyId,
        apiKeySecret,
        "POST",
        requestHost,
        `${COINBASE_FACILITATOR_V2_ROUTE}/verify`,
      );
      headers.settle.Authorization = await createAuthHeader(
        apiKeyId,
        apiKeySecret,
        "POST",
        requestHost,
        `${COINBASE_FACILITATOR_V2_ROUTE}/settle`,
      );
      headers.supported.Authorization = await createAuthHeader(
        apiKeyId,
        apiKeySecret,
        "GET",
        requestHost,
        `${COINBASE_FACILITATOR_V2_ROUTE}/supported`,
      );
    }

    return headers;
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
