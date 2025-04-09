import { expect, test, describe } from "vitest";
import { baseSepolia } from "viem/chains";
import { Address, Hex } from "viem";
import { PaymentDetails, Resource } from "../../../../src/types/index.js";
import { createSignerSepolia } from "../../../../src/shared/evm/wallet.js";
import { createPayment } from "../../../../src/schemes/exact/evm/client.js";
import { getUsdcAddressForChain, getUSDCBalance } from "../../../../src/shared/evm/usdc.js";
import { settle, verify } from "../../../../src/schemes/exact/evm/facilitator.js";

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
