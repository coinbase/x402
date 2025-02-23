import { expect, test, describe } from "vitest";
import { PaymentDetails, Resource } from "@/shared/types";
import { baseSepolia } from "viem/chains";
import { botWallet, facilitatorWallet } from "@/shared/evm/wallet";
import { Address } from "viem";
import { createPayment } from "@/client/exact/evm/client";
import { getUsdcAddressForChain, getUSDCBalance } from "@/shared/evm/usdc";
import { settle, verify } from "@/facilitator/exact/evm";

describe("settlePayment", () => {
  const wallet = botWallet;
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
    expect(finalBalance).toBe(
      initialBalance + paymentDetails.maxAmountRequired
    );
  });
}, 10000);
