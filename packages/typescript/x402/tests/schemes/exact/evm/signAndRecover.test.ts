import { expect, test, describe } from "vitest";
import { baseSepolia } from "viem/chains";
import { Address, Hex } from "viem";
import { createPayment } from "../../../../src/schemes/exact/evm/client.js";
import { verify } from "../../../../src/schemes/exact/evm/facilitator.js";
import { Resource, PaymentDetails } from "../../../../src/types/index.js";
import { getUsdcAddressForChain } from "../../../../src/shared/evm/usdc.js";
import { createSignerSepolia, createClientSepolia } from "../../../../src/shared/evm/wallet.js";

describe("sign and recover", () => {
  const wallet = createSignerSepolia(process.env.PRIVATE_KEY as Hex);
  const client = createClientSepolia();

  test("happy path sign and recover", async () => {
    const paymentDetails: PaymentDetails = {
      scheme: "exact",
      networkId: baseSepolia.id.toString(),
      maxAmountRequired: BigInt(1 * 10 ** 6),
      resource: "https://example.com" as Resource,
      description: "example",
      mimeType: "text/plain",
      outputSchema: null,
      payToAddress: "0x0000000000000000000000000000000000000000" as Address,
      requiredDeadlineSeconds: 30,
      usdcAddress: getUsdcAddressForChain(wallet.chain?.id as number),
      extra: null,
    };

    const payment = await createPayment(wallet, paymentDetails);

    console.log(payment);

    const valid = await verify(client, payment, paymentDetails);
    console.log("valid", valid);
    expect(valid.isValid).toBe(true);
  });

  test("rejects incompatible payload version", async () => {
    const paymentDetails: PaymentDetails = {
      scheme: "exact",
      networkId: baseSepolia.id.toString(),
      maxAmountRequired: BigInt(1 * 10 ** 6),
      resource: "https://example.com" as Resource,
      description: "example",
      mimeType: "text/plain",
      payToAddress: "0x0000000000000000000000000000000000000000" as Address,
      outputSchema: null,
      requiredDeadlineSeconds: 60,
      usdcAddress: getUsdcAddressForChain(wallet.chain?.id as number),
      extra: null,
    };

    const payment = await createPayment(
      wallet,
      { ...paymentDetails, scheme: "invalid" }, // Create payment with v1 but verify against v2
    );

    const valid = await verify(wallet, payment, paymentDetails);
    expect(valid.isValid).toBe(false);
    expect(valid.invalidReason).toContain(
      "Incompatible payload scheme. payload: invalid, paymentDetails: exact, supported: exact",
    );
  });

  test("rejects invalid USDC address", async () => {
    const paymentDetails: PaymentDetails = {
      scheme: "exact",
      networkId: baseSepolia.id.toString(),
      maxAmountRequired: BigInt(1 * 10 ** 6),
      resource: "https://example.com" as Resource,
      description: "example",
      mimeType: "text/plain",
      payToAddress: "0x0000000000000000000000000000000000000000" as Address,
      requiredDeadlineSeconds: 60,
      outputSchema: null,
      usdcAddress: "0x1234567890123456789012345678901234567890" as Address, // Wrong address
      extra: null,
    };

    const payment = await createPayment(wallet, paymentDetails);

    const valid = await verify(wallet, payment, paymentDetails);
    expect(valid.isValid).toBe(false);
    expect(valid.invalidReason).toBe("Invalid usdc address");
  });

  test("rejects invalid permit signature", async () => {
    const paymentDetails: PaymentDetails = {
      scheme: "exact",
      networkId: baseSepolia.id.toString(),
      maxAmountRequired: BigInt(1 * 10 ** 6),
      resource: "https://example.com" as Resource,
      description: "example",
      mimeType: "text/plain",
      payToAddress: "0x0000000000000000000000000000000000000000" as Address,
      requiredDeadlineSeconds: 60,
      usdcAddress: getUsdcAddressForChain(wallet.chain?.id as number),
      outputSchema: null,
      extra: null,
    };

    const payment = await createPayment(wallet, paymentDetails);

    // Corrupt the signature
    const corruptedPayment = {
      ...payment,
      payload: {
        ...payment.payload,
        signature:
          "0xf3f303070867dd381e0859de4ec39fb590c25ead665eaa3c3053d4aacb46d23a0d862ce6256d01549196317e120dd685efa4d1777f0849f4b6a05a4609f319cc1c" as `0x${string}`,
      },
    };

    const valid = await verify(wallet, corruptedPayment, paymentDetails);
    expect(valid.isValid).toBe(false);
    expect(valid.invalidReason).toBe("Invalid permit signature");
  });

  test("rejects expired deadline", async () => {
    const paymentDetails: PaymentDetails = {
      scheme: "exact",
      networkId: baseSepolia.id.toString(),
      maxAmountRequired: BigInt(1 * 10 ** 6),
      resource: "https://example.com" as Resource,
      description: "example",
      mimeType: "text/plain",
      payToAddress: "0x0000000000000000000000000000000000000000" as Address,
      requiredDeadlineSeconds: 1,
      usdcAddress: getUsdcAddressForChain(wallet.chain?.id as number),
      outputSchema: null,
      extra: null,
    };

    const payment = await createPayment(wallet, paymentDetails);

    const valid = await verify(wallet, payment, paymentDetails);
    expect(valid.isValid).toBe(false);
    expect(valid.invalidReason).toBe("Deadline on permit isn't far enough in the future");
  });

  test("rejects insufficient funds", async () => {
    const paymentDetails: PaymentDetails = {
      scheme: "exact",
      networkId: baseSepolia.id.toString(),
      maxAmountRequired: BigInt(99999999999 * 10 ** 6), // Very large amount, greater than balance of wallet
      resource: "https://example.com" as Resource,
      description: "example",
      mimeType: "text/plain",
      payToAddress: "0x0000000000000000000000000000000000000000" as Address,
      requiredDeadlineSeconds: 10,
      usdcAddress: getUsdcAddressForChain(wallet.chain?.id),
      outputSchema: null,
      extra: null,
    };

    const payment = await createPayment(wallet, paymentDetails);

    const valid = await verify(wallet, payment, paymentDetails);
    expect(valid.isValid).toBe(false);
    expect(valid.invalidReason).toBe("Client does not have enough funds");
  });

  test("rejects insufficient value in payload", async () => {
    const paymentDetails: PaymentDetails = {
      scheme: "exact",
      networkId: baseSepolia.id.toString(),
      maxAmountRequired: BigInt(2 * 10 ** 6),
      resource: "https://example.com" as Resource,
      description: "example",
      mimeType: "text/plain",
      payToAddress: "0x0000000000000000000000000000000000000000" as Address,
      requiredDeadlineSeconds: 10,
      usdcAddress: getUsdcAddressForChain(wallet.chain?.id as number),
      outputSchema: null,
      extra: null,
    };

    const payment = await createPayment(
      wallet,
      { ...paymentDetails, maxAmountRequired: BigInt(1 * 10 ** 6) }, // Create with lower amount
    );

    const valid = await verify(wallet, payment, paymentDetails);
    expect(valid.isValid).toBe(false);
    expect(valid.invalidReason).toBe(
      "Value in payload is not enough to cover paymentDetails.maxAmountRequired",
    );
  });
});
