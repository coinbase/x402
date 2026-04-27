import { describe, it, expect } from "vitest";
import { x402HTTPClient } from "../../../src/http/x402HTTPClient";
import { x402Client } from "../../../src/client/x402Client";
import {
  encodePaymentRequiredHeader,
  encodePaymentResponseHeader,
  encodePaymentSignatureHeader as encodeSignatureHeader,
} from "../../../src/http";
import { buildPaymentPayload, buildPaymentRequired, buildSettleResponse } from "../../mocks";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeHttpClient(): x402HTTPClient {
  return new x402HTTPClient(new x402Client());
}

// ---------------------------------------------------------------------------
// encodePaymentSignatureHeader
// ---------------------------------------------------------------------------

describe("x402HTTPClient.encodePaymentSignatureHeader", () => {
  it("returns PAYMENT-SIGNATURE header for v2 payload", () => {
    const client = makeHttpClient();
    const payload = buildPaymentPayload({ x402Version: 2 });

    const headers = client.encodePaymentSignatureHeader(payload);

    expect(Object.keys(headers)).toHaveLength(1);
    expect(headers["PAYMENT-SIGNATURE"]).toBeDefined();
    // Round-trip: the encoded value should decode back to the original payload
    const raw = Buffer.from(headers["PAYMENT-SIGNATURE"]!, "base64").toString("utf8");
    expect(JSON.parse(raw)).toEqual(payload);
  });

  it("returns X-PAYMENT header for v1 payload", () => {
    const client = makeHttpClient();
    const payload = buildPaymentPayload({ x402Version: 1 });

    const headers = client.encodePaymentSignatureHeader(payload);

    expect(Object.keys(headers)).toHaveLength(1);
    expect(headers["X-PAYMENT"]).toBeDefined();
    const raw = Buffer.from(headers["X-PAYMENT"]!, "base64").toString("utf8");
    expect(JSON.parse(raw)).toEqual(payload);
  });

  it("throws for an unsupported x402Version", () => {
    const client = makeHttpClient();
    const payload = buildPaymentPayload({ x402Version: 99 as unknown as 2 });

    expect(() => client.encodePaymentSignatureHeader(payload)).toThrow(
      "Unsupported x402 version",
    );
  });

  it("v2 header name is distinct from v1 header name", () => {
    const client = makeHttpClient();
    const v2headers = client.encodePaymentSignatureHeader(buildPaymentPayload({ x402Version: 2 }));
    const v1headers = client.encodePaymentSignatureHeader(buildPaymentPayload({ x402Version: 1 }));

    expect(Object.keys(v2headers)[0]).toBe("PAYMENT-SIGNATURE");
    expect(Object.keys(v1headers)[0]).toBe("X-PAYMENT");
  });
});

// ---------------------------------------------------------------------------
// getPaymentRequiredResponse
// ---------------------------------------------------------------------------

describe("x402HTTPClient.getPaymentRequiredResponse", () => {
  it("reads PAYMENT-REQUIRED header for v2", () => {
    const client = makeHttpClient();
    const paymentRequired = buildPaymentRequired({ x402Version: 2 });
    const encoded = encodePaymentRequiredHeader(paymentRequired);
    const getHeader = (name: string) => (name === "PAYMENT-REQUIRED" ? encoded : null);

    const result = client.getPaymentRequiredResponse(getHeader);

    expect(result).toEqual(paymentRequired);
  });

  it("reads v1 payment required from body when header is absent", () => {
    const client = makeHttpClient();
    const paymentRequired = buildPaymentRequired({ x402Version: 1 });
    const getHeader = (_name: string) => null;

    const result = client.getPaymentRequiredResponse(getHeader, paymentRequired);

    expect(result).toEqual(paymentRequired);
  });

  it("ignores body when PAYMENT-REQUIRED header is present (prefers v2 header)", () => {
    const client = makeHttpClient();
    const v2PaymentRequired = buildPaymentRequired({ x402Version: 2 });
    const v1PaymentRequired = buildPaymentRequired({ x402Version: 1 });
    const encoded = encodePaymentRequiredHeader(v2PaymentRequired);
    const getHeader = (name: string) => (name === "PAYMENT-REQUIRED" ? encoded : null);

    const result = client.getPaymentRequiredResponse(getHeader, v1PaymentRequired);

    expect(result).toEqual(v2PaymentRequired);
  });

  it("throws when neither header nor valid body is present", () => {
    const client = makeHttpClient();
    const getHeader = (_name: string) => null;

    expect(() => client.getPaymentRequiredResponse(getHeader)).toThrow(
      "Invalid payment required response",
    );
  });

  it("throws when body is present but lacks x402Version", () => {
    const client = makeHttpClient();
    const getHeader = (_name: string) => null;

    expect(() => client.getPaymentRequiredResponse(getHeader, { someOtherField: true })).toThrow(
      "Invalid payment required response",
    );
  });

  it("throws when body x402Version is not 1", () => {
    const client = makeHttpClient();
    const getHeader = (_name: string) => null;
    // Body has x402Version: 2 but no PAYMENT-REQUIRED header — should throw, not use body
    const body = buildPaymentRequired({ x402Version: 2 });

    expect(() => client.getPaymentRequiredResponse(getHeader, body)).toThrow(
      "Invalid payment required response",
    );
  });

  it("getHeader receiving undefined is treated as absent", () => {
    const client = makeHttpClient();
    const getHeader = (_name: string): string | null | undefined => undefined;

    expect(() => client.getPaymentRequiredResponse(getHeader)).toThrow(
      "Invalid payment required response",
    );
  });
});

// ---------------------------------------------------------------------------
// getPaymentSettleResponse
// ---------------------------------------------------------------------------

describe("x402HTTPClient.getPaymentSettleResponse", () => {
  it("reads PAYMENT-RESPONSE header for v2", () => {
    const client = makeHttpClient();
    const settleResponse = buildSettleResponse({ success: true });
    const encoded = encodePaymentResponseHeader(settleResponse);
    const getHeader = (name: string) => (name === "PAYMENT-RESPONSE" ? encoded : null);

    const result = client.getPaymentSettleResponse(getHeader);

    expect(result).toEqual(settleResponse);
  });

  it("falls back to X-PAYMENT-RESPONSE header for v1", () => {
    const client = makeHttpClient();
    const settleResponse = buildSettleResponse({ success: false });
    const encoded = encodePaymentResponseHeader(settleResponse);
    const getHeader = (name: string) => (name === "X-PAYMENT-RESPONSE" ? encoded : null);

    const result = client.getPaymentSettleResponse(getHeader);

    expect(result).toEqual(settleResponse);
  });

  it("prefers PAYMENT-RESPONSE over X-PAYMENT-RESPONSE when both present", () => {
    const client = makeHttpClient();
    const v2Response = buildSettleResponse({ success: true });
    const v1Response = buildSettleResponse({ success: false });
    const encodedV2 = encodePaymentResponseHeader(v2Response);
    const encodedV1 = encodePaymentResponseHeader(v1Response);

    const getHeader = (name: string) => {
      if (name === "PAYMENT-RESPONSE") return encodedV2;
      if (name === "X-PAYMENT-RESPONSE") return encodedV1;
      return null;
    };

    const result = client.getPaymentSettleResponse(getHeader);

    expect(result).toEqual(v2Response);
  });

  it("throws when no payment response header is present", () => {
    const client = makeHttpClient();
    const getHeader = (_name: string) => null;

    expect(() => client.getPaymentSettleResponse(getHeader)).toThrow(
      "Payment response header not found",
    );
  });

  it("getHeader returning undefined is treated as absent", () => {
    const client = makeHttpClient();
    const getHeader = (_name: string): string | null | undefined => undefined;

    expect(() => client.getPaymentSettleResponse(getHeader)).toThrow(
      "Payment response header not found",
    );
  });

  it("returned settle response preserves all fields", () => {
    const client = makeHttpClient();
    const settleResponse = buildSettleResponse({
      success: true,
      transaction: "0xdeadbeef",
      network: "eip155:8453" as import("../../../src/types").Network,
    });
    const encoded = encodePaymentResponseHeader(settleResponse);
    const getHeader = (name: string) => (name === "PAYMENT-RESPONSE" ? encoded : null);

    const result = client.getPaymentSettleResponse(getHeader);

    expect(result.success).toBe(true);
    expect(result.transaction).toBe("0xdeadbeef");
    expect(result.network).toBe("eip155:8453");
  });
});

// ---------------------------------------------------------------------------
// createPaymentPayload (delegates to x402Client)
// ---------------------------------------------------------------------------

describe("x402HTTPClient.createPaymentPayload", () => {
  it("delegates to the underlying x402Client", async () => {
    // x402Client.createPaymentPayload requires a signer — without one it throws
    const underlyingClient = new x402Client();
    const httpClient = new x402HTTPClient(underlyingClient);
    const paymentRequired = buildPaymentRequired();

    // No signer attached → expect rejection (not a codec-level error)
    await expect(httpClient.createPaymentPayload(paymentRequired)).rejects.toThrow();
  });
});
