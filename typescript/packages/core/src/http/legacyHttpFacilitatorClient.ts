import { PaymentPayload, PaymentRequirements } from "../types/payments";
import {
  VerifyResponse,
  SettleResponse,
  SupportedResponse,
  SupportedKind,
} from "../types/facilitator";
import { SupportedResponseV1 } from "../types/v1";
import { FacilitatorClient, FacilitatorConfig } from "./httpFacilitatorClient";

const DEFAULT_FACILITATOR_URL = "https://x402.org/facilitator";

/**
 * Legacy HTTP-based client for interacting with V1-only x402 facilitator services.
 * This adapter converts V1 facilitator responses to V2 format, enabling V1 facilitators
 * to work with V2 resource servers.
 *
 * Use this client when connecting to facilitators that:
 * - Only support x402 V1
 * - Return the old supported response format (array of kinds with x402Version field)
 * - Don't support extensions or signers
 */
export class LegacyHTTPFacilitatorClient implements FacilitatorClient {
  private readonly url: string;
  private readonly createAuthHeaders?: FacilitatorConfig["createAuthHeaders"];

  /**
   * Creates a new LegacyHTTPFacilitatorClient instance.
   *
   * @param config - Configuration options for the facilitator client
   */
  constructor(config?: FacilitatorConfig) {
    this.url = config?.url || DEFAULT_FACILITATOR_URL;
    this.createAuthHeaders = config?.createAuthHeaders;
  }

  /**
   * Verify a payment with the facilitator
   *
   * @param paymentPayload - The payment to verify
   * @param paymentRequirements - The requirements to verify against
   * @returns Verification response
   */
  async verify(
    paymentPayload: PaymentPayload,
    paymentRequirements: PaymentRequirements,
  ): Promise<VerifyResponse> {
    let headers: Record<string, string> = {
      "Content-Type": "application/json",
    };

    if (this.createAuthHeaders) {
      const authHeaders = await this.createAuthHeaders();
      headers = { ...headers, ...authHeaders.verify };
    }

    const response = await fetch(`${this.url}/verify`, {
      method: "POST",
      headers,
      body: JSON.stringify({
        x402Version: paymentPayload.x402Version,
        paymentPayload: this.toJsonSafe(paymentPayload),
        paymentRequirements: this.toJsonSafe(paymentRequirements),
      }),
    });

    if (!response.ok) {
      const errorText = await response.text().catch(() => response.statusText);
      throw new Error(`Legacy facilitator verify failed (${response.status}): ${errorText}`);
    }

    return (await response.json()) as VerifyResponse;
  }

  /**
   * Settle a payment with the facilitator
   *
   * @param paymentPayload - The payment to settle
   * @param paymentRequirements - The requirements for settlement
   * @returns Settlement response
   */
  async settle(
    paymentPayload: PaymentPayload,
    paymentRequirements: PaymentRequirements,
  ): Promise<SettleResponse> {
    let headers: Record<string, string> = {
      "Content-Type": "application/json",
    };

    if (this.createAuthHeaders) {
      const authHeaders = await this.createAuthHeaders();
      headers = { ...headers, ...authHeaders.settle };
    }

    const response = await fetch(`${this.url}/settle`, {
      method: "POST",
      headers,
      body: JSON.stringify({
        x402Version: paymentPayload.x402Version,
        paymentPayload: this.toJsonSafe(paymentPayload),
        paymentRequirements: this.toJsonSafe(paymentRequirements),
      }),
    });

    if (!response.ok) {
      const errorText = await response.text().catch(() => response.statusText);
      throw new Error(`Legacy facilitator settle failed (${response.status}): ${errorText}`);
    }

    return (await response.json()) as SettleResponse;
  }

  /**
   * Get supported payment kinds and extensions from the facilitator.
   * Converts V1 response format (array with x402Version in each kind) to V2 format
   * (map grouped by version, with extensions and signers).
   *
   * @returns Supported payment kinds in V2 format
   */
  async getSupported(): Promise<SupportedResponse> {
    let headers: Record<string, string> = {
      "Content-Type": "application/json",
    };

    if (this.createAuthHeaders) {
      const authHeaders = await this.createAuthHeaders();
      headers = { ...headers, ...authHeaders.supported };
    }

    const response = await fetch(`${this.url}/supported`, {
      method: "GET",
      headers,
    });

    if (!response.ok) {
      const errorText = await response.text().catch(() => response.statusText);
      throw new Error(`Legacy facilitator getSupported failed (${response.status}): ${errorText}`);
    }

    const v1Response: SupportedResponseV1 = await response.json();

    // Convert V1 format to V2 format
    return this.convertV1ToV2(v1Response);
  }

  /**
   * Converts V1 supported response format to V2 format.
   * Groups kinds by version and adds empty extensions and signers.
   *
   * @param v1Response - The V1 supported response
   * @returns The V2 supported response
   */
  private convertV1ToV2(v1Response: SupportedResponseV1): SupportedResponse {
    const kindsByVersion: Record<string, SupportedKind[]> = {};

    // Group kinds by version
    for (const v1Kind of v1Response.kinds) {
      const versionKey = v1Kind.x402Version.toString();

      if (!kindsByVersion[versionKey]) {
        kindsByVersion[versionKey] = [];
      }

      // Create V2 kind (without x402Version field)
      const v2Kind: SupportedKind = {
        scheme: v1Kind.scheme,
        network: v1Kind.network,
      };

      // Include extra if present
      if (v1Kind.extra) {
        v2Kind.extra = v1Kind.extra;
      }

      kindsByVersion[versionKey].push(v2Kind);
    }

    return {
      kinds: kindsByVersion,
      extensions: [], // V1 facilitators don't support extensions
      signers: {}, // V1 facilitators don't provide signer information
    };
  }

  /**
   * Helper to convert objects to JSON-safe format.
   * Handles BigInt and other non-JSON types.
   *
   * @param obj - The object to convert
   * @returns The JSON-safe representation of the object
   */
  private toJsonSafe(obj: unknown): unknown {
    return JSON.parse(
      JSON.stringify(obj, (_, value) => (typeof value === "bigint" ? value.toString() : value)),
    );
  }
}
