import { createAuthHeader } from "x402/shared";
import { CreateHeaders } from "x402/verify";

/**
 * Creates a CDP auth header for the facilitator service
 *
 * @param apiKeyId - The CDP API key ID
 * @param apiKeySecret - The CDP API key secret
 * @returns A function that returns the auth headers
 */
export function createCdpAuthHeaders(apiKeyId?: string, apiKeySecret?: string): CreateHeaders {
  apiKeyId = apiKeyId ?? process.env.CDP_API_KEY_ID;
  apiKeySecret = apiKeySecret ?? process.env.CDP_API_KEY_SECRET;

  if (!apiKeyId || !apiKeySecret) {
    throw new Error(
      "Missing environment variables: CDP_API_KEY_ID and CDP_API_KEY_SECRET must be set when using default facilitator",
    );
  }

  return async () => {
    return {
      verify: {
        Authorization: await createAuthHeader(
          apiKeyId,
          apiKeySecret,

          "cloud-api-dev.cbhq.net",
          "/platform/v2/x402/verify",
        ),
      },
      settle: {
        Authorization: await createAuthHeader(
          apiKeyId,
          apiKeySecret,

          "cloud-api-dev.cbhq.net",
          "/platform/v2/x402/settle",
        ),
      },
    };
  };
}
