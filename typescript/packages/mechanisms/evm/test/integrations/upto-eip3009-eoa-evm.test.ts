import { PaymentPayload, PaymentRequirements } from "@x402/core/types";
import { createPublicClient, createWalletClient, http } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { baseSepolia } from "viem/chains";
import { describe, expect, it } from "vitest";
import { toFacilitatorEvmSigner } from "../../src";
import { UptoEvmScheme as UptoEvmClient } from "../../src/upto/client/scheme";
import { UptoEvmScheme as UptoEvmFacilitator } from "../../src/upto/facilitator/scheme";
import { eip3009ABI } from "../../src/constants";

const CLIENT_PRIVATE_KEY = process.env.CLIENT_PRIVATE_KEY as `0x${string}`;
const FACILITATOR_PRIVATE_KEY = process.env.FACILITATOR_PRIVATE_KEY as `0x${string}`;

if (!CLIENT_PRIVATE_KEY || !FACILITATOR_PRIVATE_KEY) {
  throw new Error(
    "CLIENT_PRIVATE_KEY and FACILITATOR_PRIVATE_KEY environment variables must be set for integration tests",
  );
}

describe("upto ERC-3009 EOA integration", () => {
  it("verifies and partially settles Base Sepolia USDC", { timeout: 60_000 }, async () => {
    const payer = privateKeyToAccount(CLIENT_PRIVATE_KEY);
    const settler = privateKeyToAccount(FACILITATOR_PRIVATE_KEY);
    const publicClient = createPublicClient({ chain: baseSepolia, transport: http() });
    const walletClient = createWalletClient({
      account: settler,
      chain: baseSepolia,
      transport: http(),
    });
    const facilitatorSigner = toFacilitatorEvmSigner({
      address: settler.address,
      readContract: args => publicClient.readContract({ ...args, args: args.args ?? [] } as never),
      verifyTypedData: args => publicClient.verifyTypedData(args as never),
      writeContract: args =>
        walletClient.writeContract({ ...args, args: args.args ?? [] } as never),
      sendTransaction: args => walletClient.sendTransaction(args),
      waitForTransactionReceipt: args => publicClient.waitForTransactionReceipt(args),
      getCode: args => publicClient.getCode(args),
    });

    const maximum = "1000";
    const actual = "500";
    const requirements: PaymentRequirements = {
      scheme: "upto",
      network: "eip155:84532",
      asset: "0x036CbD53842c5426634e7929541eC2318f3dCF7e",
      amount: maximum,
      payTo: settler.address,
      maxTimeoutSeconds: 3600,
      extra: {
        assetTransferMethod: "eip3009",
        name: "USDC",
        version: "2",
        settlerAddress: settler.address,
      },
    };

    const client = new UptoEvmClient(payer);
    const signed = await client.createPaymentPayload(2, requirements);
    const payload = {
      ...signed,
      accepted: { scheme: "upto", network: "eip155:84532" },
    } as PaymentPayload;
    const facilitator = new UptoEvmFacilitator(facilitatorSigner);

    const verification = await facilitator.verify(payload, requirements);
    expect(verification).toEqual(expect.objectContaining({ isValid: true, payer: payer.address }));

    const [payerBefore, merchantBefore] = await Promise.all([
      publicClient.readContract({
        address: requirements.asset as `0x${string}`,
        abi: eip3009ABI,
        functionName: "balanceOf",
        args: [payer.address],
      }),
      publicClient.readContract({
        address: requirements.asset as `0x${string}`,
        abi: eip3009ABI,
        functionName: "balanceOf",
        args: [settler.address],
      }),
    ]);
    const settlement = await facilitator.settle(payload, {
      ...requirements,
      amount: actual,
    });
    expect(settlement).toEqual(
      expect.objectContaining({
        success: true,
        payer: payer.address,
        amount: actual,
        network: "eip155:84532",
      }),
    );
    expect(settlement.transaction).toMatch(/^0x[0-9a-f]{64}$/i);

    const [payerAfter, merchantAfter] = await Promise.all([
      publicClient.readContract({
        address: requirements.asset as `0x${string}`,
        abi: eip3009ABI,
        functionName: "balanceOf",
        args: [payer.address],
      }),
      publicClient.readContract({
        address: requirements.asset as `0x${string}`,
        abi: eip3009ABI,
        functionName: "balanceOf",
        args: [settler.address],
      }),
    ]);
    expect(payerBefore - payerAfter).toBe(BigInt(actual));
    expect(merchantAfter - merchantBefore).toBe(BigInt(actual));
  });
});
