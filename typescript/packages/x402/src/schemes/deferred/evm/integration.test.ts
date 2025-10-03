import { describe, expect, it, vi, beforeAll, afterAll } from "vitest";
import { createSigner, SignerWallet } from "../../../types/shared/evm";
import {
  DeferredPaymentPayload,
  DeferredPaymentRequirements,
  DEFERRRED_SCHEME,
} from "../../../types/verify/schemes/deferred";
import { createPayment, createPaymentHeader } from "./client";
import { decodePayment } from "./utils/paymentUtils";
import { settle, verify } from "./facilitator";
import { InMemoryVoucherStore } from "./store.mock";
import { getPaymentRequirementsExtra } from "./server";
import { Chain, Log, TransactionReceipt, Transport } from "viem";

describe("Deferred Payment Integration Tests", () => {
  const sellerAddress = "0x1234567890123456789012345678901234567890";
  const escrowAddress = "0xffffff12345678901234567890123456789fffff";
  const assetAddress = "0x1111111111111111111111111111111111111111";

  const baseVoucher = {
    id: "0x9dce748efdc0ac6ce5875ae50b7cb8aff28d14e4f335b4f6393c2ed3866bc361",
    buyer: "0x05159b6100E8c7A3BbaE174A94c32E1E2e37059b",
    seller: "0x1234567890123456789012345678901234567890",
    valueAggregate: "1017",
    asset: "0x1111111111111111111111111111111111111111",
    timestamp: 1756313313,
    nonce: 0,
    escrow: "0xffFfFf12345678901234567890123456789fffFF",
    chainId: 84532,
    expiry: 1758905313,
    signature:
      "0x3921aa078a4d02b2c7f65614a87636a7e62f9d3990842204cf778c92a7721dba54831c2269df2ef84231d79680f844a81b7aba33a8482dfa7e97a71cf613c66f1b",
  };
  const basePaymentRequirements = {
    scheme: DEFERRRED_SCHEME,
    network: "base-sepolia",
    maxAmountRequired: "1017",
    resource: "https://example.com/resource",
    description: "payment",
    mimeType: "application/json",
    payTo: sellerAddress,
    maxTimeoutSeconds: 300,
    asset: assetAddress,
  };

  beforeAll(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(baseVoucher.timestamp * 1000 + 1000));
  });

  afterAll(() => {
    vi.useRealTimers();
  });

  describe("End-to-end x402 payment flow: /verify, /settle", () => {
    it("should handle complete payment lifecycle with client initiating with buyer address and no previous history", async () => {
      // Initialize facilitator -- we use in memory voucher store but blockchain interactions are mocked
      const voucherStore = new InMemoryVoucherStore();
      const facilitatorWallet = {
        chain: { id: 84532 },
        readContract: vi.fn(),
        writeContract: vi.fn(),
        waitForTransactionReceipt: vi.fn(),
      } as unknown as SignerWallet<Chain, Transport>;

      // * Step 1: Payment requirements generation
      // Buyer client requests access to a resource specifying their address via X-BUYER header
      const buyer = createSigner(
        "base-sepolia",
        "0xcb160425c35458024591e64638d6f7720dac915a0fb035c5964f6d51de0987d9",
      );

      // Seller middleware decodes X-BUYER header and generates payment requirements
      const buyerAddress = buyer.account.address;
      const paymentRequirements = {
        ...basePaymentRequirements,
        extra: await getPaymentRequirementsExtra(
          undefined, // no X-PAYMENT header -- client initiates with X-BUYER header
          buyerAddress,
          sellerAddress,
          escrowAddress,
          (buyer, seller) => voucherStore.getAvailableVoucher(buyer, seller),
        ),
      } as DeferredPaymentRequirements;

      expect(paymentRequirements.extra.type).toBe("new");

      // * Step 2: Payment payload generation
      // Buyer creates a new signed voucher, encodes it as X-PAYMENT header and sends it to the seller
      const paymentPayload = await createPaymentHeader(buyer, 1, paymentRequirements);

      // * Step 3: Seller decodes and verifies the payment payload, then stores the voucher in the store - mock blockchain interactions
      const decodedPaymentPayload = decodePayment(paymentPayload) as DeferredPaymentPayload;
      mockBlockchainInteractionsVerify(facilitatorWallet);
      const verifyResponse = await verify(
        facilitatorWallet,
        decodedPaymentPayload,
        paymentRequirements,
        {
          deferred: { voucherStore },
        },
      );
      expect(verifyResponse.isValid).toBe(true);

      const signedVoucher = {
        ...decodedPaymentPayload.payload.voucher,
        signature: decodedPaymentPayload.payload.signature,
      };
      voucherStore.storeVoucher(signedVoucher);
      const storedVoucher = await voucherStore.getVoucher(
        decodedPaymentPayload.payload.voucher.id,
        decodedPaymentPayload.payload.voucher.nonce,
      );
      expect(voucherStore.vouchers.length).toBe(1);
      expect(signedVoucher).toEqual(storedVoucher);

      // * Step 4: Seller does work
      // -- Nothing to do here --

      // * Step 5: Seller settles the voucher -- mock blockchain interactions
      mockBlockchainInteractionsSettle(facilitatorWallet);
      const settleResponse = await settle(
        facilitatorWallet,
        decodedPaymentPayload,
        paymentRequirements,
        { deferred: { voucherStore } },
      );
      expect(settleResponse.success).toBe(true);

      const voucherCollections = await voucherStore.getVoucherCollections(
        {
          id: decodedPaymentPayload.payload.voucher.id,
          nonce: decodedPaymentPayload.payload.voucher.nonce,
        },
        {},
      );
      expect(voucherCollections.length).toBe(1);
      expect(voucherCollections[0]).toEqual({
        voucherId: decodedPaymentPayload.payload.voucher.id,
        voucherNonce: decodedPaymentPayload.payload.voucher.nonce,
        chainId: decodedPaymentPayload.payload.voucher.chainId,
        transactionHash: settleResponse.transaction,
        collectedAmount: decodedPaymentPayload.payload.voucher.valueAggregate,
        asset: decodedPaymentPayload.payload.voucher.asset,
        collectedAt: expect.any(Number),
      });
    });

    it("should handle complete payment lifecycle with client initiating with buyer address and previous history", async () => {
      // Initialize facilitator -- we use in memory voucher store but blockchain interactions are mocked
      const voucherStore = new InMemoryVoucherStore();
      voucherStore.storeVoucher(baseVoucher);
      const facilitatorWallet = {
        chain: { id: 84532 },
        readContract: vi.fn(),
        writeContract: vi.fn(),
        waitForTransactionReceipt: vi.fn(),
      } as unknown as SignerWallet<Chain, Transport>;

      // * Step 1: Payment requirements generation
      // Buyer client requests access to a resource specifying their address via X-BUYER header
      const buyer = createSigner(
        "base-sepolia",
        "0xcb160425c35458024591e64638d6f7720dac915a0fb035c5964f6d51de0987d9",
      );

      // Seller middleware decodes X-BUYER header and generates payment requirements
      const buyerAddress = buyer.account.address;
      const paymentRequirements = {
        ...basePaymentRequirements,
        extra: await getPaymentRequirementsExtra(
          undefined, // no X-PAYMENT header -- client initiates with X-BUYER header
          buyerAddress,
          sellerAddress,
          escrowAddress,
          (buyer, seller) => voucherStore.getAvailableVoucher(buyer, seller),
        ),
      } as DeferredPaymentRequirements;

      expect(paymentRequirements.extra.type).toBe("aggregation");

      // * Step 2: Payment payload generation
      // Buyer creates a new signed voucher, encodes it as X-PAYMENT header and sends it to the seller
      const paymentPayload = await createPaymentHeader(buyer, 1, paymentRequirements);

      // * Step 3: Seller decodes and verifies the payment payload, then stores the voucher in the store - mock blockchain interactions
      const decodedPaymentPayload = decodePayment(paymentPayload) as DeferredPaymentPayload;
      mockBlockchainInteractionsVerify(facilitatorWallet);
      const verifyResponse = await verify(
        facilitatorWallet,
        decodedPaymentPayload,
        paymentRequirements,
        {
          deferred: { voucherStore },
        },
      );
      expect(verifyResponse.isValid).toBe(true);

      voucherStore.storeVoucher({
        ...decodedPaymentPayload.payload.voucher,
        signature: decodedPaymentPayload.payload.signature,
      });
      expect(voucherStore.vouchers.length).toBe(2);
      expect(
        await voucherStore.getVoucher(
          decodedPaymentPayload.payload.voucher.id,
          decodedPaymentPayload.payload.voucher.nonce,
        ),
      ).toEqual({
        ...decodedPaymentPayload.payload.voucher,
        signature: decodedPaymentPayload.payload.signature,
      });

      // * Step 4: Seller does work
      // -- Nothing to do here --

      // * Step 5: Seller settles the voucher -- mock blockchain interactions
      mockBlockchainInteractionsSettle(facilitatorWallet);
      const settleResponse = await settle(
        facilitatorWallet,
        decodedPaymentPayload,
        paymentRequirements,
        { deferred: { voucherStore } },
      );
      expect(settleResponse.success).toBe(true);

      const voucherCollections = await voucherStore.getVoucherCollections(
        {
          id: decodedPaymentPayload.payload.voucher.id,
          nonce: decodedPaymentPayload.payload.voucher.nonce,
        },
        {},
      );
      expect(voucherCollections.length).toBe(1);
      expect(voucherCollections[0]).toEqual({
        voucherId: decodedPaymentPayload.payload.voucher.id,
        voucherNonce: decodedPaymentPayload.payload.voucher.nonce,
        chainId: decodedPaymentPayload.payload.voucher.chainId,
        transactionHash: settleResponse.transaction,
        collectedAmount: baseVoucher.valueAggregate, // mocked transaction data uses the base voucher valueAggregate
        asset: decodedPaymentPayload.payload.voucher.asset,
        collectedAt: expect.any(Number),
      });
    });

    it("should handle complete payment lifecycle with client initiating with payment payload and previous history", async () => {
      // Initialize facilitator -- we use in memory voucher store but blockchain interactions are mocked
      const voucherStore = new InMemoryVoucherStore();
      voucherStore.storeVoucher(baseVoucher);
      const facilitatorWallet = {
        chain: { id: 84532 },
        readContract: vi.fn(),
        writeContract: vi.fn(),
        waitForTransactionReceipt: vi.fn(),
      } as unknown as SignerWallet<Chain, Transport>;

      // * Step 0: Payment payload generation
      // Buyer has the previous payment requirements so they can generate the new ones directly, skipping the X-BUYER header
      const buyer = createSigner(
        "base-sepolia",
        "0xcb160425c35458024591e64638d6f7720dac915a0fb035c5964f6d51de0987d9",
      );
      const buyerAddress = buyer.account.address;
      const originalPaymentRequirements = {
        ...basePaymentRequirements,
        extra: await getPaymentRequirementsExtra(
          undefined, // no X-PAYMENT header -- client initiates with X-BUYER header
          buyerAddress,
          sellerAddress,
          escrowAddress,
          (buyer, seller) => voucherStore.getAvailableVoucher(buyer, seller),
        ),
      } as DeferredPaymentRequirements;
      const originalPaymentPayload = await createPaymentHeader(
        buyer,
        1,
        originalPaymentRequirements,
      );

      // * Step 1: Payment requirements generation
      // Seller middleware decodes X-PAYMENT header and generates payment requirements
      const paymentRequirements = {
        ...basePaymentRequirements,
        extra: await getPaymentRequirementsExtra(
          originalPaymentPayload, // X-PAYMENT present! -- client initiates with X-PAYMENT header
          undefined, // no X-BUYER header
          sellerAddress,
          escrowAddress,
          (buyer, seller) => voucherStore.getAvailableVoucher(buyer, seller),
        ),
      } as DeferredPaymentRequirements;

      expect(paymentRequirements.extra.type).toBe("aggregation");

      // * Step 2: Payment payload generation
      // Buyer creates a new signed voucher, encodes it as X-PAYMENT header and sends it to the seller
      const paymentPayload = await createPaymentHeader(buyer, 1, paymentRequirements);

      // * Step 3: Seller decodes and verifies the payment payload, then stores the voucher in the store - mock blockchain interactions
      const decodedPaymentPayload = decodePayment(paymentPayload) as DeferredPaymentPayload;
      mockBlockchainInteractionsVerify(facilitatorWallet);
      const verifyResponse = await verify(
        facilitatorWallet,
        decodedPaymentPayload,
        paymentRequirements,
        {
          deferred: { voucherStore },
        },
      );
      expect(verifyResponse.isValid).toBe(true);

      voucherStore.storeVoucher({
        ...decodedPaymentPayload.payload.voucher,
        signature: decodedPaymentPayload.payload.signature,
      });
      expect(voucherStore.vouchers.length).toBe(2);
      expect(
        await voucherStore.getVoucher(
          decodedPaymentPayload.payload.voucher.id,
          decodedPaymentPayload.payload.voucher.nonce,
        ),
      ).toEqual({
        ...decodedPaymentPayload.payload.voucher,
        signature: decodedPaymentPayload.payload.signature,
      });

      // * Step 4: Seller does work
      // -- Nothing to do here --

      // * Step 5: Seller settles the voucher -- mock blockchain interactions
      mockBlockchainInteractionsSettle(facilitatorWallet);
      const settleResponse = await settle(
        facilitatorWallet,
        decodedPaymentPayload,
        paymentRequirements,
        { deferred: { voucherStore } },
      );
      expect(settleResponse.success).toBe(true);

      const voucherCollections = await voucherStore.getVoucherCollections(
        {
          id: decodedPaymentPayload.payload.voucher.id,
          nonce: decodedPaymentPayload.payload.voucher.nonce,
        },
        {},
      );
      expect(voucherCollections.length).toBe(1);
      expect(voucherCollections[0]).toEqual({
        voucherId: decodedPaymentPayload.payload.voucher.id,
        voucherNonce: decodedPaymentPayload.payload.voucher.nonce,
        chainId: decodedPaymentPayload.payload.voucher.chainId,
        transactionHash: settleResponse.transaction,
        collectedAmount: baseVoucher.valueAggregate, // mocked transaction data uses the base voucher valueAggregate
        asset: decodedPaymentPayload.payload.voucher.asset,
        collectedAt: expect.any(Number),
      });
    });
  });

  describe("Multi-round voucher aggregation", () => {
    it("should support multiple rounds of aggregation", async () => {
      const voucherStore = new InMemoryVoucherStore();
      const facilitatorWallet = {
        chain: { id: 84532 },
        readContract: vi.fn(),
        writeContract: vi.fn(),
        waitForTransactionReceipt: vi.fn(),
      } as unknown as SignerWallet<Chain, Transport>;

      const buyer = createSigner(
        "base-sepolia",
        "0xcb160425c35458024591e64638d6f7720dac915a0fb035c5964f6d51de0987d9",
      );
      const paymentRequirements = {
        ...basePaymentRequirements,
        maxAmountRequired: "100000",
        extra: {
          type: "new",
          voucher: baseVoucher,
        },
      } as DeferredPaymentRequirements;
      const firstPaymentPayload = (await createPayment(
        buyer,
        1,
        paymentRequirements,
      )) as DeferredPaymentPayload;
      voucherStore.storeVoucher({
        ...firstPaymentPayload.payload.voucher,
        signature: firstPaymentPayload.payload.signature,
      });

      mockBlockchainInteractionsVerify(facilitatorWallet);
      const valid = await verify(facilitatorWallet, firstPaymentPayload, paymentRequirements, {
        deferred: {
          voucherStore,
        },
      });
      expect(valid.isValid).toBe(true);

      // Aggregate multiple times
      let currentPayment = firstPaymentPayload;
      for (let i = 1; i <= 10; i++) {
        const requirements = {
          ...paymentRequirements,
          maxAmountRequired: "50000",
          description: `payment round ${i}`,
          extra: {
            type: "aggregation",
            signature: currentPayment.payload.signature,
            voucher: currentPayment.payload.voucher,
          },
        } as DeferredPaymentRequirements;

        currentPayment = (await createPayment(buyer, 1, requirements)) as DeferredPaymentPayload;
        expect(currentPayment.payload.voucher.nonce).toBe(i);
        expect(currentPayment.payload.voucher.valueAggregate).toBe((100000 + i * 50000).toString());
      }

      // Final voucher should have correct accumulated value
      expect(currentPayment.payload.voucher.valueAggregate).toBe("600000"); // 100k + 10*50k
      expect(currentPayment.payload.voucher.nonce).toBe(10);
    });
  });
});

/**
 * Mock blockchain interactions for settle facilitator calls
 *
 * @param wallet - The wallet to mock blockchain interactions for
 */
function mockBlockchainInteractionsSettle(wallet: SignerWallet<Chain, Transport>) {
  vi.mocked(wallet.readContract)
    .mockResolvedValueOnce([BigInt(1_000_000)])
    .mockResolvedValueOnce({
      balance: BigInt(10_000_000),
    })
    .mockResolvedValueOnce([BigInt(1_000_000)])
    .mockResolvedValueOnce({
      balance: BigInt(10_000_000),
    });
  vi.mocked(wallet.writeContract).mockResolvedValue("0x1234567890abcdef");
  vi.mocked(wallet.waitForTransactionReceipt).mockResolvedValue({
    status: "success",
    logs: [
      {
        data: "0x000000000000000000000000036cbd53842c5426634e7929541ec2318f3dcf7e00000000000000000000000000000000000000000000000000000000000003f900000000000000000000000000000000000000000000000000000000000003f90000000000000000000000000000000000000000000000000000000000000000",
        topics: [
          "0x70696cf682404a5a47c0a00d3253721b5c093ff0a4c8a13374f53712fc481d77",
          "0x198e73e1cecf59db4fbf8ca10000000000000000000000000000000000000000",
          "0x00000000000000000000000080cdf1957ebb7a2df22dd8913753a4423ff4272e",
          "0x000000000000000000000000c93d37ad45c907ee1b27a02b2e1bd823ba9d379c",
        ],
      } as unknown as Log<bigint, number, false>,
    ],
  } as TransactionReceipt);
}

/**
 * Mock blockchain interactions for verify facilitator calls
 *
 * @param wallet - The wallet to mock blockchain interactions for
 */
function mockBlockchainInteractionsVerify(wallet: SignerWallet<Chain, Transport>) {
  vi.mocked(wallet.readContract)
    .mockResolvedValueOnce([BigInt(1_000_000)])
    .mockResolvedValueOnce({
      balance: BigInt(10_000_000),
    });
}
