import { generateJwt } from "@coinbase/cdp-sdk/auth";

/**
 * Creates an authorization header for a request to the Coinbase API.
 *
 * @param apiKeyId - The api key ID
 * @param apiKeySecret - The api key secret
 * @param requestHost - The host for the request (e.g. 'https://x402.org/facilitator')
 * @param requestPath - The path for the request (e.g. '/verify')
 * @returns The authorization header string
 */
export async function createAuthHeader(
  apiKeyId: string,
  apiKeySecret: string,
  requestHost: string,
  requestPath: string,
) {
  const jwt = await generateJwt({
    apiKeyId,
    apiKeySecret,
    requestMethod: "POST",
    requestHost,
    requestPath,
  });
  return `Bearer ${jwt}`;
}
