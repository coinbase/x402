import { OnrampConfig, CreateSessionRequest, OnrampSession, OnrampError } from "./types";
import { OnrampAuth } from "./auth";

export class OnrampClient {
  private readonly auth: OnrampAuth;
  private readonly baseUrl: string;

  constructor(config: OnrampConfig) {
    this.auth = new OnrampAuth(config);
    this.baseUrl =
      config.environment === "development"
        ? "https://api.sandbox.coinbase.com/api/v3/onramp"
        : "https://api.coinbase.com/api/v3/onramp";
  }

  /**
   * Creates a new Onramp session
   */
  async createSession(request: CreateSessionRequest): Promise<OnrampSession> {
    const response = await this.request("POST", "/sessions", request);

    if (!response.ok) {
      const error = (await response.json()) as OnrampError;
      throw new Error(`Onramp API error: ${error.message}`);
    }

    return response.json();
  }

  /**
   * Gets an existing session by ID
   */
  async getSession(sessionId: string): Promise<OnrampSession> {
    const response = await this.request("GET", `/sessions/${sessionId}`);

    if (!response.ok) {
      const error = (await response.json()) as OnrampError;
      throw new Error(`Onramp API error: ${error.message}`);
    }

    return response.json();
  }

  /**
   * Makes an authenticated request to the Onramp API
   */
  private async request(
    method: string,
    path: string,
    body?: CreateSessionRequest | Record<string, unknown>,
  ): Promise<Response> {
    const token = this.auth.generateToken();

    const headers: HeadersInit = {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
      Accept: "application/json",
    };

    return fetch(`${this.baseUrl}${path}`, {
      method,
      headers,
      body: body ? JSON.stringify(body) : undefined,
    });
  }
}
