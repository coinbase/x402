import { describe, test, expect } from "vitest";
import { paymentMiddleware } from "../../src/express/index";
import { createSignerSepolia } from "../../src/shared/evm/wallet";
import { createPaymentHeader } from "../../src/schemes/exact/evm/client";
import { getUsdcAddressForChain } from "../../src/shared/evm/usdc";
import { moneySchema, PaymentDetails } from "../../src/types";
import { Address, Hex } from "viem";

// Helpers to simulate Express req, res, and next.
const createReq = (headers: Record<string, string>, originalUrl = "/integration-test") => {
  return {
    header: (name: string) => headers[name],
    originalUrl,
  } as any;
};

const createRes = () => {
  const res: any = {};
  res.status = (code: number) => {
    res.statusCode = code;
    return res;
  };
  res.send = (body: any) => {
    res.body = body;
    return res;
  };
  res.json = (body: any) => {
    res.body = body;
    return res;
  };
  res.setHeader = (key: string, value: string) => {
    res.headers = res.headers || {};
    res.headers[key] = value;
  };
  res.headersSent = false;
  return res;
};

const next = async () => Promise.resolve();

// Create a Sepolia signer using client private key.
const wallet = createSignerSepolia(process.env.PRIVATE_KEY as Hex);

// Pay to resource address.
const payToAddress = process.env.RESOURCE_WALLET_ADDRESS as Address;

// Using managed facilitator wallet for testing
const facilitatorUrl = "https://x402.org/facilitator";

// Define test parameters that match what the middleware will compute.
const testAmount = "$0.001"; 
const testDescription = "Integration Test Payment";
const testMimeType = "application/json";
const testDeadline = 60; // seconds
const testResource = "https://x402.org/protected"; // Example resource URL - should his be changed?

// Helper to build PaymentDetails exactly as the middleware will
const buildPaymentDetails = (reqUrl: `${string}://${string}`, testnet: boolean): PaymentDetails => {
  const parsed = moneySchema.safeParse(testAmount);
  if (!parsed.success) {
    throw new Error(`Invalid amount in test: ${testAmount}`);
  }
  return {
    scheme: "exact",
    networkId: testnet ? "84532" : "8453",
    maxAmountRequired: BigInt(parsed.data * 10 ** 6),
    resource: reqUrl,
    description: testDescription,
    mimeType: testMimeType,
    payToAddress: payToAddress,
    requiredDeadlineSeconds: testDeadline,
    usdcAddress: getUsdcAddressForChain(testnet ? 84532 : 8453),
    outputSchema: null,
    extra: null,
  };
};

describe("paymentMiddleware integration tests (live Sepolia)", () => {
  // Increase timeout for live network interactions.
  test("returns 402 with paywall HTML for browser requests without X-PAYMENT header", async () => {
    const middleware = paymentMiddleware(testAmount, payToAddress, {
      description: testDescription,
      mimeType: testMimeType,
      maxDeadlineSeconds: testDeadline,
      facilitatorUrl,
      testnet: true,
      customPaywallHtml: "<html>Custom Paywall Integration</html>",
      resource: testResource,
    });
    // Simulate a browser request (Accept contains text/html and a Mozilla UA)
    const req = createReq({
      "Accept": "text/html,application/xhtml+xml",
      "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64)",
    });
    const res = createRes();

    await middleware(req, res, next);
    expect(res.statusCode).toBe(402);
    expect(res.body).toBe("<html>Custom Paywall Integration</html>");
  }, 30000);

  test("returns 402 with JSON error for non-browser requests without X-PAYMENT header", async () => {
    const middleware = paymentMiddleware(testAmount, payToAddress, {
      description: testDescription,
      mimeType: testMimeType,
      maxDeadlineSeconds: testDeadline,
      facilitatorUrl,
      testnet: true,
      resource: testResource,
    });
    // Simulate a non-browser request (JSON accept header)
    const req = createReq({
      "Accept": "application/json",
      "User-Agent": "axios/0.27.2",
    });
    const res = createRes();

    await middleware(req, res, next);
    expect(res.statusCode).toBe(402);
    expect(res.body.error).toBe("X-PAYMENT header is required");
    expect(res.body.paymentDetails).toBeDefined();
  }, 30000);

  test("proceeds when valid X-PAYMENT header is provided (valid payment)", async () => {
    // Build the payment details exactly as middleware would.
    const reqUrl = testResource;
    const paymentDetails = buildPaymentDetails(reqUrl, true);
    // Use createPaymentHeader (live) to generate a valid payment token.
    const paymentToken = await createPaymentHeader(wallet, paymentDetails);

    const middleware = paymentMiddleware(testAmount, payToAddress, {
      description: testDescription,
      mimeType: testMimeType,
      maxDeadlineSeconds: testDeadline,
      facilitatorUrl,
      testnet: true,
      resource: reqUrl,
    });

    // Simulate a non-browser request with valid X-PAYMENT header.
    const req = createReq({
      "X-PAYMENT": paymentToken,
      "Accept": "application/json",
      "User-Agent": "axios/0.27.2",
    }, reqUrl);
    const res = createRes();

    await middleware(req, res, next);
    // If the payment was valid, middleware should have called next() and then attempted settlement.
    // Settlement response header should be set.
    expect(res.headers).toBeDefined();
    expect(res.headers["X-PAYMENT-RESPONSE"]).toBeDefined();
  }, 60000);

  test("returns 402 when an invalid (corrupted) payment token is provided", async () => {
    // Build payment details and generate a valid token.
    const reqUrl = testResource;
    // Corrupt the token (for example, change a character).
    const invalidToken = "invalid-token-12345";

    const middleware = paymentMiddleware(testAmount, payToAddress, {
      description: testDescription,
      mimeType: testMimeType,
      maxDeadlineSeconds: testDeadline,
      facilitatorUrl,
      testnet: true,
      resource: reqUrl,
    });

    const req = createReq({
      "X-PAYMENT": invalidToken,
      "Accept": "application/json",
      "User-Agent": "axios/0.27.2",
    }, reqUrl);
    const res = createRes();

    await middleware(req, res, next);
    expect(res.statusCode).toBe(402);
    // The error message may vary based on the live verification logic.
    expect(res.body.error).toBeDefined();
  }, 60000);
});
