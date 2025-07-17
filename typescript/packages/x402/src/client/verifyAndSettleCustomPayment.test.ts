import { describe, it, expect, beforeEach, vi } from "vitest";

vi.mock("../types", async () => {
  const actual = await vi.importActual<any>("../types");
  return {
    ...actual,
    settleResponseHeader: vi.fn(() => "responseHeader"),
  };
});

import { verifyAndSettleCustomPayment } from "./verifyAndSettleCustomPayment";
import { useFacilitator } from "../verify";
import { processPriceToAtomicAmount } from "../shared";
import { exact } from "../schemes";

vi.mock("../verify");
vi.mock("../shared");
vi.mock("../schemes");

describe("verifyAndSettleCustomPayment", () => {
  const facilitator = { url: "http://facilitator" } as any;
  const address = "0xRecipient";
  const network = "testnet" as any;
  const resource = "test://resource" as `${string}://${string}`;
  const paymentHeader = "header123";

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("should return success on valid verification and settlement", async () => {
    (processPriceToAtomicAmount as any).mockReturnValue({
      maxAmountRequired: "1000",
      asset: { address: "0xAsset", eip712: {} },
    });
    (exact.evm.decodePayment as any).mockReturnValue("decodedPayment");
    (useFacilitator as any).mockReturnValue({
      verify: vi.fn().mockResolvedValue({ isValid: true }),
      settle: vi.fn().mockResolvedValue("settlement"),
    });

    const result = await verifyAndSettleCustomPayment("$10.00", address, facilitator, {
      paymentHeader,
      resource,
      network,
    });
    expect(result.success).toBe(true);
    expect(result.responseHeader).toBe("responseHeader");
    expect(result.message).toBe("Payment settled successfully");
  });

  it("should return failure if verification fails", async () => {
    (processPriceToAtomicAmount as any).mockReturnValue({
      maxAmountRequired: "1000",
      asset: { address: "0xAsset", eip712: {} },
    });
    (exact.evm.decodePayment as any).mockReturnValue("decodedPayment");
    (useFacilitator as any).mockReturnValue({
      verify: vi.fn().mockResolvedValue({ isValid: false, invalidReason: "Invalid payment" }),
      settle: vi.fn(),
    });

    const result = await verifyAndSettleCustomPayment("$10.00", address, facilitator, {
      paymentHeader,
      resource,
      network,
    });
    expect(result.success).toBe(false);
    expect(result.message).toBe("Invalid payment");
    expect(result.responseHeader).toBe("");
  });

  it("should return failure if verification throws", async () => {
    (processPriceToAtomicAmount as any).mockReturnValue({
      maxAmountRequired: "1000",
      asset: { address: "0xAsset", eip712: {} },
    });
    (exact.evm.decodePayment as any).mockReturnValue("decodedPayment");
    (useFacilitator as any).mockReturnValue({
      verify: vi.fn().mockRejectedValue(new Error("verify error")),
      settle: vi.fn(),
    });

    const result = await verifyAndSettleCustomPayment("$10.00", address, facilitator, {
      paymentHeader,
      resource,
      network,
    });
    expect(result.success).toBe(false);
    expect(result.message).toBe("Error during payment verification");
    expect(result.error).toBe("verify error");
    expect(result.responseHeader).toBe("");
  });

  it("should return failure if settlement throws", async () => {
    (processPriceToAtomicAmount as any).mockReturnValue({
      maxAmountRequired: "1000",
      asset: { address: "0xAsset", eip712: {} },
    });
    (exact.evm.decodePayment as any).mockReturnValue("decodedPayment");
    (useFacilitator as any).mockReturnValue({
      verify: vi.fn().mockResolvedValue({ isValid: true }),
      settle: vi.fn().mockRejectedValue({ response: { data: "settle error" } }),
    });

    const result = await verifyAndSettleCustomPayment("$10.00", address, facilitator, {
      paymentHeader,
      resource,
      network,
    });
    expect(result.success).toBe(false);
    expect(result.message).toBe("Settlement failed");
    expect(result.error).toBe("settle error");
    expect(result.responseHeader).toBe("");
  });

  it("should return failure if processPriceToAtomicAmount returns error", async () => {
    (processPriceToAtomicAmount as any).mockReturnValue({ error: "bad amount" });
    const result = await verifyAndSettleCustomPayment("$10.00", address, facilitator, {
      paymentHeader,
      resource,
      network,
    });
    expect(result.success).toBe(false);
    expect(result.message).toMatch(/bad amount/);
    expect(result.responseHeader).toBe("");
  });

  it("should return failure if paymentHeader is missing", async () => {
    const result = await verifyAndSettleCustomPayment("$10.00", address, facilitator, {
      paymentHeader: "",
      resource,
      network,
    });
    expect(result.success).toBe(false);
    expect(result.message).toMatch(/No payment header found/);
    expect(result.responseHeader).toBe("");
  });
});
