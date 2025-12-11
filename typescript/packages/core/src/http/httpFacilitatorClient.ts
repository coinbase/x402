import { PaymentPayload, PaymentRequirements } from "../types/payments";
import { VerifyResponse, SettleResponse, SupportedResponse } from "../types/facilitator";

const DEFAULT_FACILITATOR_URL = "https://x402.org/facilitator";

export interface FacilitatorConfig {
  url?: string;
  createAuthHeaders?: () => Promise<{
    verify: Record<string, string>;
    settle: Record<string, string>;
    supported: Record<string, string>;
  }>;
}

/**
 * Interface for facilitator clients
 * Can be implemented for HTTP-based or local facilitators
 */
export interface FacilitatorClient {
  /**
   * Verify a payment with the facilitator
   *
   * @param paymentPayload - The payment to verify
   * @param paymentRequirements - The requirements to verify against
   * @returns Verification response
   */
  verify(
    paymentPayload: PaymentPayload,
    paymentRequirements: PaymentRequirements,
  ): Promise<VerifyResponse>;

  /**
   * Settle a payment with the facilitator
   *
   * @param paymentPayload - The payment to settle
   * @param paymentRequirements - The requirements for settlement
   * @returns Settlement response
   */
  settle(
    paymentPayload: PaymentPayload,
    paymentRequirements: PaymentRequirements,
  ): Promise<SettleResponse>;

  /**
   * Get supported payment kinds and extensions from the facilitator
   *
   * @returns Supported payment kinds and extensions
   */
  getSupported(): Promise<SupportedResponse>;
}

/**
 * HTTP-based client for interacting with x402 facilitator services
 * Handles HTTP communication with facilitator endpoints
 */
export class HTTPFacilitatorClient implements FacilitatorClient {
  readonly url: string;
  private readonly _createAuthHeaders?: FacilitatorConfig["createAuthHeaders"];

  /**
   * Creates a new HTTPFacilitatorClient instance.
   *
   * @param config - Configuration options for the facilitator client
   */
  constructor(config?: FacilitatorConfig) {
    this.url = config?.url || DEFAULT_FACILITATOR_URL;
    this._createAuthHeaders = config?.createAuthHeaders;
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

    if (this._createAuthHeaders) {
      const authHeaders = await this.createAuthHeaders("verify");
      headers = { ...headers, ...authHeaders.headers };
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
      throw new Error(`Facilitator verify failed (${response.status}): ${errorText}`);
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

    if (this._createAuthHeaders) {
      const authHeaders = await this.createAuthHeaders("settle");
      headers = { ...headers, ...authHeaders.headers };
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
      throw new Error(`Facilitator settle failed (${response.status}): ${errorText}`);
    }

    return (await response.json()) as SettleResponse;
  }

  /**
   * Get supported payment kinds and extensions from the facilitator
   *
   * @returns Supported payment kinds and extensions
   */
  async getSupported(): Promise<SupportedResponse> {
    let headers: Record<string, string> = {
      "Content-Type": "application/json",
    };

    if (this._createAuthHeaders) {
      const authHeaders = await this.createAuthHeaders("supported");
      headers = { ...headers, ...authHeaders.headers };
    }

    const response = await fetch(`${this.url}/supported`, {
      method: "GET",
      headers,
    });

    if (!response.ok) {
      const errorText = await response.text().catch(() => response.statusText);
      throw new Error(`Facilitator getSupported failed (${response.status}): ${errorText}`);
    }

    return (await response.json()) as SupportedResponse;
  }

  /**
   * Creates authentication headers for a specific path.
   *
   * @param path - The path to create authentication headers for (e.g., "verify", "settle", "supported")
   * @returns An object containing the authentication headers for the specified path
   */
  async createAuthHeaders(path: string): Promise<{
    headers: Record<string, string>;
  }> {
    if (this._createAuthHeaders) {
      const authHeaders = (await this._createAuthHeaders()) as Record<
        string,
        Record<string, string>
      >;
      return {
        headers: authHeaders[path] ?? {},
      };
    }
    return {
      headers: {},
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
