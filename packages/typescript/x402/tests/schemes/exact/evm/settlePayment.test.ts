import { expect, test, describe } from "vitest";
import { PaymentDetails, Resource } from "../../../../src/types";
import { baseSepolia } from "viem/chains";
import { createSignerSepolia } from "../../../../src/shared/evm/wallet";
import { Address, Hex } from "viem";
import { createPayment } from "../../../../src/schemes/exact/evm/client";
import { getUsdcAddressForChain, getUSDCBalance } from "../../../../src/shared/evm/usdc";
import { settle, verify } from "../../../../src/schemes/exact/evm/facilitator";

describe("settlePayment", () => {
  const wallet = createSignerSepolia(process.env.PRIVATE_KEY as Hex);
  const facilitatorWallet = createSignerSepolia(process.env.FACILITATOR_WALLET_PRIVATE_KEY as Hex);
  const resourceAddress = process.env.RESOURCE_WALLET_ADDRESS as Address;

  test("happy path", async () => {
    const initialBalance = await getUSDCBalance(wallet, resourceAddress);
    const paymentDetails: PaymentDetails = {
      scheme: "exact",
      networkId: baseSepolia.id.toString(),
      maxAmountRequired: BigInt(0.01 * 10 ** 6), // 0.01 USDC
      resource: "https://example.com" as Resource,
      description: "example",
      mimeType: "text/plain",
      payToAddress: resourceAddress,
      requiredDeadlineSeconds: 10,
      usdcAddress: getUsdcAddressForChain(baseSepolia.id),
      outputSchema: null,
      extra: null,
    };
    const payment = await createPayment(wallet, paymentDetails);
    const valid = await verify(wallet, payment, paymentDetails);
    expect(valid.isValid).toBe(true);
    const result = await settle(facilitatorWallet, payment, paymentDetails);
    expect(result.success).toBe(true);
    const finalBalance = await getUSDCBalance(wallet, resourceAddress);
    expect(finalBalance).toBe(initialBalance + paymentDetails.maxAmountRequired);
  });
}, 10000);
