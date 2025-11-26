import { PaymentRequired, PaymentPayload, PaymentRequirements } from "../../../src/types/payments";
import { VerifyResponse, SettleResponse, SupportedResponse } from "../../../src/types/facilitator";
import { Network } from "../../../src/types";

/**
 * Test data builders for creating test fixtures.
 */

/**
 *
 * @param overrides
 */
export function buildPaymentRequirements(
  overrides?: Partial<PaymentRequirements>,
): PaymentRequirements {
  return {
    scheme: "test-scheme",
    network: "test:network" as Network,
    amount: "1000000",
    asset: "TEST_ASSET",
    payTo: "test_recipient",
    maxTimeoutSeconds: 300,
    extra: {},
    ...overrides,
  };
}

/**
 *
 * @param overrides
 */
export function buildPaymentRequired(overrides?: Partial<PaymentRequired>): PaymentRequired {
  return {
    x402Version: 2,
    resource: {
      url: "https://example.com/resource",
      description: "Test resource",
      mimeType: "application/json",
    },
    accepts: [buildPaymentRequirements()],
    ...overrides,
  };
}

/**
 *
 * @param overrides
 */
export function buildPaymentPayload(overrides?: Partial<PaymentPayload>): PaymentPayload {
  return {
    x402Version: 2,
    payload: {
      signature: "test_signature",
      from: "test_sender",
    },
    accepted: buildPaymentRequirements(),
    resource: {
      url: "https://example.com/resource",
      description: "Test resource",
      mimeType: "application/json",
    },
    ...overrides,
  };
}

/**
 *
 * @param overrides
 */
export function buildVerifyResponse(overrides?: Partial<VerifyResponse>): VerifyResponse {
  return {
    isValid: true,
    ...overrides,
  };
}

/**
 *
 * @param overrides
 */
export function buildSettleResponse(overrides?: Partial<SettleResponse>): SettleResponse {
  return {
    success: true,
    transaction: "0xTestTransaction",
    network: "test:network" as Network,
    ...overrides,
  };
}

/**
 * Builds a V2 supported response for testing.
 * The new V2 format groups kinds by version string and includes signers.
 *
 * For backward compatibility with tests, this function can also accept the old format
 * in overrides.kinds (array with x402Version) and will convert it to the new format.
 *
 * Args:
 *   overrides: Partial overrides for the supported response
 *
 * Returns:
 *   A complete SupportedResponse object with test defaults
 */
export function buildSupportedResponse(
  overrides?: Partial<SupportedResponse> & {
    kinds?: any; // Allow old or new format
  },
): SupportedResponse {
  const base: SupportedResponse = {
    kinds: {
      "2": [
        {
          scheme: "test-scheme",
          network: "test:network" as Network,
          extra: {},
        },
      ],
    },
    extensions: [],
    signers: {},
  };

  // If overrides are provided, merge them
  if (overrides) {
    // Handle kinds specially - convert old format to new if needed
    if (overrides.kinds) {
      if (Array.isArray(overrides.kinds)) {
        // Old format: convert array to grouped format
        const kindsByVersion: Record<
          string,
          Array<{
            scheme: string;
            network: Network;
            extra?: Record<string, unknown>;
          }>
        > = {};

        for (const kind of overrides.kinds) {
          const versionKey = (kind as any).x402Version?.toString() || "2";
          if (!kindsByVersion[versionKey]) {
            kindsByVersion[versionKey] = [];
          }
          kindsByVersion[versionKey].push({
            scheme: kind.scheme,
            network: kind.network,
            ...(kind.extra && { extra: kind.extra }),
          });
        }

        base.kinds = kindsByVersion;
      } else {
        // New format: use as is
        base.kinds = overrides.kinds;
      }
    }

    // Merge other fields
    if (overrides.extensions !== undefined) {
      base.extensions = overrides.extensions;
    }
    if (overrides.signers !== undefined) {
      base.signers = overrides.signers;
    }
  }

  return base;
}
