import { OnrampConfig } from "./types";
import { createHmac } from "crypto";

export class OnrampAuth {
  private readonly config: OnrampConfig;

  constructor(config: OnrampConfig) {
    this.config = config;
  }

  /**
   * Generates a JWT token for Coinbase Onramp API authentication
   * @returns JWT token string
   */
  generateToken(): string {
    const header = {
      alg: "HS256",
      typ: "JWT",
    };

    const payload = {
      sub: this.config.apiKeyId,
      iat: Math.floor(Date.now() / 1000),
      exp: Math.floor(Date.now() / 1000) + 60, // Token expires in 1 minute
    };

    const encodedHeader = this.base64UrlEncode(JSON.stringify(header));
    const encodedPayload = this.base64UrlEncode(JSON.stringify(payload));

    const signature = this.sign(`${encodedHeader}.${encodedPayload}`);
    return `${encodedHeader}.${encodedPayload}.${signature}`;
  }

  /**
   * Signs the JWT data using HMAC SHA-256
   */
  private sign(data: string): string {
    const signature = createHmac("sha256", this.config.apiSecretKey).update(data).digest("base64");
    return this.base64UrlEncode(signature);
  }

  /**
   * Encodes data in URL-safe base64
   */
  private base64UrlEncode(data: string | Buffer): string {
    const base64 = Buffer.isBuffer(data)
      ? data.toString("base64")
      : Buffer.from(data).toString("base64");

    return base64.replace(/=/g, "").replace(/\+/g, "-").replace(/\//g, "_");
  }
}
