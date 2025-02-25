import { describe, it, expect } from "vitest";
import { paymentMiddleware } from "../../src/server/hono";
import { Hono } from "hono";
import { createPaymentHeader } from "../../src/client";
import { PaymentDetails, Resource } from "../../src/types";
import { getUsdcAddressForChain } from "../../src/shared/evm/usdc";
import { botWallet } from "../../src/shared/evm/wallet";
import { baseSepolia } from "viem/chains";

describe("paymentMiddleware", () => {
  const testAddress = "0x209693Bc6afc0C5328bA36FaF03C514EF312287C";
  const testResource = "http://localhost:4021/test" as Resource;

  // TODO: add proper testing for the middleware. Might require spinning up a facilitator server to run tests
  it("should return 402 when payment is invalid", async () => {
    expect(true).toBe(true);
  });
});
