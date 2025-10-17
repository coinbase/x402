import { describe, expect, it, vi, beforeAll, afterAll } from "vitest";
import { createSigner, SignerWallet } from "../../../types/shared/evm";
import {
  DeferredPaymentPayload,
  DeferredPaymentRequirements,
  DEFERRRED_SCHEME,
  DeferredEscrowDepositAuthorization,
} from "../../../types/verify/schemes/deferred";
import { createPayment, createPaymentExtraPayload } from "./client";
import { decodePayment } from "./utils/paymentUtils";
import { settle, verify } from "./facilitator";
import { InMemoryVoucherStore } from "./store.mock";
import { getPaymentRequirementsExtra } from "./server";
import { Chain, Log, TransactionReceipt, Transport } from "viem";
import { signPermit, signDepositAuthorizationInner } from "./sign";
import { createPaymentHeader } from "../../../client";

vi.mock("../../../verify/useDeferred", () => ({
  useDeferredFacilitator: vi.fn().mockReturnValue({
    getBuyerData: vi.fn().mockResolvedValue({
      balance: "10000000",
      assetAllowance: "1000000",
      assetPermitNonce: "0",
    }),
  }),
}));

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
          assetAddress,
          84532,
          { url: "https://facilitator.x402.io" },
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
          assetAddress,
          84532,
          { url: "https://facilitator.x402.io" },
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
          assetAddress,
          84532,
          { url: "https://facilitator.x402.io" },
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
          assetAddress,
          84532,
          { url: "https://facilitator.x402.io" },
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

    it("should handle payment lifecycle with depositAuthorization", async () => {
      // Initialize facilitator
      const voucherStore = new InMemoryVoucherStore();
      const facilitatorWallet = {
        chain: { id: 84532 },
        readContract: vi.fn(),
        writeContract: vi.fn(),
        waitForTransactionReceipt: vi.fn(),
      } as unknown as SignerWallet<Chain, Transport>;

      // Create buyer
      const buyer = createSigner(
        "base-sepolia",
        "0xcb160425c35458024591e64638d6f7720dac915a0fb035c5964f6d51de0987d9",
      );
      const buyerAddress = buyer.account.address;

      // Create deposit authorization (permit + depositAuth)
      const now = Math.floor(Date.now() / 1000);
      const oneWeek = 604800;
      const depositAmount = "5000";

      const permit = {
        owner: buyerAddress,
        spender: escrowAddress,
        value: depositAmount,
        nonce: "0",
        deadline: now + oneWeek * 2,
        domain: {
          name: "USD Coin",
          version: "2",
        },
      };

      const permitSignature = await signPermit(buyer, permit, 84532, assetAddress);

      const depositAuthInner = {
        buyer: buyerAddress,
        seller: sellerAddress,
        asset: assetAddress,
        amount: depositAmount,
        nonce: "0x0000000000000000000000000000000000000000000000000000000000000001",
        expiry: now + oneWeek * 2,
      };

      const depositAuthSignature = await signDepositAuthorizationInner(
        buyer,
        depositAuthInner,
        84532,
        escrowAddress,
      );

      const depositAuthorization: DeferredEscrowDepositAuthorization = {
        permit: {
          ...permit,
          signature: permitSignature.signature,
        },
        depositAuthorization: {
          ...depositAuthInner,
          signature: depositAuthSignature.signature,
        },
      };

      // * Step 1: Payment requirements generation
      const paymentRequirements = {
        ...basePaymentRequirements,
        extra: await getPaymentRequirementsExtra(
          undefined,
          buyerAddress,
          sellerAddress,
          escrowAddress,
          assetAddress,
          84532,
          { url: "https://facilitator.x402.io" },
          (buyer, seller) => voucherStore.getAvailableVoucher(buyer, seller),
        ),
      } as DeferredPaymentRequirements;

      expect(paymentRequirements.extra.type).toBe("new");

      // * Step 2: Create payment with deposit authorization
      const paymentPayload = (await createPayment(
        buyer,
        1,
        paymentRequirements,
      )) as DeferredPaymentPayload;

      // Manually add depositAuthorization to the payload
      const payloadWithAuth: DeferredPaymentPayload = {
        ...paymentPayload,
        payload: {
          ...paymentPayload.payload,
          depositAuthorization,
        },
      };

      // * Step 3: Verify payment with deposit authorization
      mockBlockchainInteractionsVerify(facilitatorWallet);
      const verifyResponse = await verify(facilitatorWallet, payloadWithAuth, paymentRequirements, {
        deferred: { voucherStore },
      });
      expect(verifyResponse.isValid).toBe(true);

      // * Step 4: Store voucher
      voucherStore.storeVoucher({
        ...payloadWithAuth.payload.voucher,
        signature: payloadWithAuth.payload.signature,
      });

      // * Step 5: Settle with deposit authorization
      mockBlockchainInteractionsSettle(facilitatorWallet);
      const settleResponse = await settle(facilitatorWallet, payloadWithAuth, paymentRequirements, {
        deferred: { voucherStore },
      });
      expect(settleResponse.success).toBe(true);

      const voucherCollections = await voucherStore.getVoucherCollections(
        {
          id: payloadWithAuth.payload.voucher.id,
          nonce: payloadWithAuth.payload.voucher.nonce,
        },
        {},
      );
      expect(voucherCollections.length).toBe(1);
      expect(voucherCollections[0]).toEqual({
        voucherId: payloadWithAuth.payload.voucher.id,
        voucherNonce: payloadWithAuth.payload.voucher.nonce,
        chainId: payloadWithAuth.payload.voucher.chainId,
        transactionHash: settleResponse.transaction,
        collectedAmount: payloadWithAuth.payload.voucher.valueAggregate,
        asset: payloadWithAuth.payload.voucher.asset,
        collectedAt: expect.any(Number),
      });
    });

    it("should handle complete payment lifecycle with createPaymentExtraPayload generating depositAuthorization", async () => {
      // Initialize facilitator
      const voucherStore = new InMemoryVoucherStore();
      const facilitatorWallet = {
        chain: { id: 84532 },
        readContract: vi.fn(),
        writeContract: vi.fn(),
        waitForTransactionReceipt: vi.fn(),
      } as unknown as SignerWallet<Chain, Transport>;

      // Create buyer
      const buyer = createSigner(
        "base-sepolia",
        "0xcb160425c35458024591e64638d6f7720dac915a0fb035c5964f6d51de0987d9",
      );
      const buyerAddress = buyer.account.address;

      // * Step 1: Payment requirements generation with account details indicating low balance
      const paymentRequirements = {
        ...basePaymentRequirements,
        extra: {
          type: "new",
          voucher: {
            id: "0x9dce748efdc0ac6ce5875ae50b7cb8aff28d14e4f335b4f6393c2ed3866bc361",
            escrow: escrowAddress,
          },
          account: {
            balance: "500", // Low balance - below threshold
            assetAllowance: "0", // No allowance
            assetPermitNonce: "0",
            facilitator: "https://facilitator.x402.io",
          },
        },
      } as DeferredPaymentRequirements;

      // Mock facilitator getBuyerData call
      const { useDeferredFacilitator } = await import("../../../verify/useDeferred");
      const mockGetBuyerData = vi.fn().mockResolvedValue({
        balance: "500", // Confirm low balance
        assetAllowance: "0",
        assetPermitNonce: "0",
      });
      (useDeferredFacilitator as ReturnType<typeof vi.fn>).mockReturnValue({
        getBuyerData: mockGetBuyerData,
      });

      // * Step 2: Client automatically generates deposit authorization using createPaymentExtraPayload
      const depositConfig = {
        asset: assetAddress,
        assetDomain: {
          name: "USD Coin",
          version: "2",
        },
        threshold: "10000",
        amount: "1000000",
      };

      const extraPayload = await createPaymentExtraPayload(buyer, paymentRequirements, [
        depositConfig,
      ]);

      expect(extraPayload).toBeDefined();
      expect(extraPayload?.permit).toBeDefined();
      expect(extraPayload?.depositAuthorization).toBeDefined();

      // Verify facilitator was called to check balance
      expect(mockGetBuyerData).toHaveBeenCalledWith(
        buyerAddress,
        sellerAddress,
        assetAddress,
        escrowAddress,
        84532,
      );

      // * Step 3: Create payment with the deposit authorization
      const paymentPayload = (await createPayment(
        buyer,
        1,
        paymentRequirements,
        extraPayload,
      )) as DeferredPaymentPayload;

      expect(paymentPayload.payload.depositAuthorization).toBeDefined();
      expect(paymentPayload.payload.depositAuthorization?.permit).toBeDefined();
      expect(paymentPayload.payload.depositAuthorization?.depositAuthorization).toBeDefined();

      // * Step 4: Verify payment with deposit authorization (mock blockchain)
      mockBlockchainInteractionsVerify(facilitatorWallet);
      const verifyResponse = await verify(facilitatorWallet, paymentPayload, paymentRequirements, {
        deferred: { voucherStore },
      });
      expect(verifyResponse.isValid).toBe(true);

      // * Step 5: Store voucher
      voucherStore.storeVoucher({
        ...paymentPayload.payload.voucher,
        signature: paymentPayload.payload.signature,
      });

      // * Step 6: Settle with deposit authorization (mock blockchain)
      mockBlockchainInteractionsSettleWithDepositAuth(facilitatorWallet);
      const settleResponse = await settle(facilitatorWallet, paymentPayload, paymentRequirements, {
        deferred: { voucherStore },
      });
      expect(settleResponse.success).toBe(true);

      // Verify writeContract was called for permit, depositWithAuthorization, and collect
      expect(facilitatorWallet.writeContract).toHaveBeenCalledTimes(3);

      // First call should be permit
      const permitCall = vi.mocked(facilitatorWallet.writeContract).mock.calls[0][0];
      expect(permitCall).toMatchObject({
        functionName: "permit",
        address: assetAddress,
      });

      // Second call should be depositWithAuthorization
      const depositCall = vi.mocked(facilitatorWallet.writeContract).mock.calls[1][0];
      expect(depositCall.functionName).toBe("depositWithAuthorization");
      expect(depositCall.address.toLowerCase()).toBe(escrowAddress.toLowerCase());

      // Third call should be collect
      const collectCall = vi.mocked(facilitatorWallet.writeContract).mock.calls[2][0];
      expect(collectCall.functionName).toBe("collect");
      expect(collectCall.address.toLowerCase()).toBe(escrowAddress.toLowerCase());

      // * Step 7: Verify voucher collection
      const voucherCollections = await voucherStore.getVoucherCollections(
        {
          id: paymentPayload.payload.voucher.id,
          nonce: paymentPayload.payload.voucher.nonce,
        },
        {},
      );
      expect(voucherCollections.length).toBe(1);
      expect(voucherCollections[0]).toEqual({
        voucherId: paymentPayload.payload.voucher.id,
        voucherNonce: paymentPayload.payload.voucher.nonce,
        chainId: paymentPayload.payload.voucher.chainId,
        transactionHash: settleResponse.transaction,
        collectedAmount: paymentPayload.payload.voucher.valueAggregate,
        asset: paymentPayload.payload.voucher.asset,
        collectedAt: expect.any(Number),
      });
    });

    it("should handle payment lifecycle without depositAuthorization when balance is sufficient", async () => {
      // Initialize facilitator
      const voucherStore = new InMemoryVoucherStore();
      const facilitatorWallet = {
        chain: { id: 84532 },
        readContract: vi.fn(),
        writeContract: vi.fn(),
        waitForTransactionReceipt: vi.fn(),
      } as unknown as SignerWallet<Chain, Transport>;

      // Create buyer
      const buyer = createSigner(
        "base-sepolia",
        "0xcb160425c35458024591e64638d6f7720dac915a0fb035c5964f6d51de0987d9",
      );

      // * Step 1: Payment requirements generation with account details indicating sufficient balance
      const paymentRequirements = {
        ...basePaymentRequirements,
        extra: {
          type: "new",
          voucher: {
            id: "0x9dce748efdc0ac6ce5875ae50b7cb8aff28d14e4f335b4f6393c2ed3866bc361",
            escrow: escrowAddress,
          },
          account: {
            balance: "10000000", // High balance - above threshold
            assetAllowance: "1000000",
            assetPermitNonce: "0",
            facilitator: "https://facilitator.x402.io",
          },
        },
      } as DeferredPaymentRequirements;

      // * Step 2: Client checks balance and decides no deposit needed
      const depositConfig = {
        asset: assetAddress,
        assetDomain: {
          name: "USD Coin",
          version: "2",
        },
        threshold: "10000",
        amount: "1000000",
      };

      const extraPayload = await createPaymentExtraPayload(buyer, paymentRequirements, [
        depositConfig,
      ]);

      // Should return undefined when balance is sufficient
      expect(extraPayload).toBeUndefined();

      // * Step 3: Create payment without deposit authorization
      const paymentPayload = (await createPayment(
        buyer,
        1,
        paymentRequirements,
      )) as DeferredPaymentPayload;

      expect(paymentPayload.payload.depositAuthorization).toBeUndefined();

      // * Step 4: Verify and settle normally (mock blockchain)
      mockBlockchainInteractionsVerify(facilitatorWallet);
      const verifyResponse = await verify(facilitatorWallet, paymentPayload, paymentRequirements, {
        deferred: { voucherStore },
      });
      expect(verifyResponse.isValid).toBe(true);

      voucherStore.storeVoucher({
        ...paymentPayload.payload.voucher,
        signature: paymentPayload.payload.signature,
      });

      mockBlockchainInteractionsSettle(facilitatorWallet);
      const settleResponse = await settle(facilitatorWallet, paymentPayload, paymentRequirements, {
        deferred: { voucherStore },
      });
      expect(settleResponse.success).toBe(true);

      // Should only call writeContract once (for voucher collection, not for deposit)
      expect(facilitatorWallet.writeContract).toHaveBeenCalledTimes(1);
    });

    it("should handle payment lifecycle with depositAuthorization but no permit when allowance is sufficient", async () => {
      // Initialize facilitator
      const voucherStore = new InMemoryVoucherStore();
      const facilitatorWallet = {
        chain: { id: 84532 },
        readContract: vi.fn(),
        writeContract: vi.fn(),
        waitForTransactionReceipt: vi.fn(),
      } as unknown as SignerWallet<Chain, Transport>;

      // Create buyer
      const buyer = createSigner(
        "base-sepolia",
        "0xcb160425c35458024591e64638d6f7720dac915a0fb035c5964f6d51de0987d9",
      );

      // * Step 1: Payment requirements with low balance but sufficient allowance
      const paymentRequirements = {
        ...basePaymentRequirements,
        extra: {
          type: "new",
          voucher: {
            id: "0x9dce748efdc0ac6ce5875ae50b7cb8aff28d14e4f335b4f6393c2ed3866bc361",
            escrow: escrowAddress,
          },
          account: {
            balance: "500", // Low balance
            assetAllowance: "2000000", // Sufficient allowance - no permit needed
            assetPermitNonce: "0",
            facilitator: "https://facilitator.x402.io",
          },
        },
      } as DeferredPaymentRequirements;

      // Mock facilitator call
      const { useDeferredFacilitator } = await import("../../../verify/useDeferred");
      const mockGetBuyerData = vi.fn().mockResolvedValue({
        balance: "500",
        assetAllowance: "2000000",
        assetPermitNonce: "0",
      });
      (useDeferredFacilitator as ReturnType<typeof vi.fn>).mockReturnValue({
        getBuyerData: mockGetBuyerData,
      });

      // * Step 2: Generate deposit authorization without permit
      const depositConfig = {
        asset: assetAddress,
        assetDomain: {
          name: "USD Coin",
          version: "2",
        },
        threshold: "10000",
        amount: "1000000",
      };

      const extraPayload = await createPaymentExtraPayload(buyer, paymentRequirements, [
        depositConfig,
      ]);

      expect(extraPayload).toBeDefined();
      expect(extraPayload?.permit).toBeUndefined(); // No permit needed
      expect(extraPayload?.depositAuthorization).toBeDefined();

      // * Step 3: Create and verify payment
      const paymentPayload = (await createPayment(
        buyer,
        1,
        paymentRequirements,
        extraPayload,
      )) as DeferredPaymentPayload;

      mockBlockchainInteractionsVerify(facilitatorWallet);
      const verifyResponse = await verify(facilitatorWallet, paymentPayload, paymentRequirements, {
        deferred: { voucherStore },
      });
      expect(verifyResponse.isValid).toBe(true);

      voucherStore.storeVoucher({
        ...paymentPayload.payload.voucher,
        signature: paymentPayload.payload.signature,
      });

      // * Step 4: Settle without permit transaction
      mockBlockchainInteractionsSettleWithDepositAuthNoPermit(facilitatorWallet);
      const settleResponse = await settle(facilitatorWallet, paymentPayload, paymentRequirements, {
        deferred: { voucherStore },
      });
      expect(settleResponse.success).toBe(true);

      // Should call writeContract twice (depositWithAuthorization + collect, no permit)
      expect(facilitatorWallet.writeContract).toHaveBeenCalledTimes(2);
      const depositCall = vi.mocked(facilitatorWallet.writeContract).mock.calls[0][0];
      expect(depositCall.functionName).toBe("depositWithAuthorization");
      expect(depositCall.address.toLowerCase()).toBe(escrowAddress.toLowerCase());
      const collectCall = vi.mocked(facilitatorWallet.writeContract).mock.calls[1][0];
      expect(collectCall.functionName).toBe("collect");
      expect(collectCall.address.toLowerCase()).toBe(escrowAddress.toLowerCase());
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
  vi.mocked(wallet.readContract).mockImplementation(async (args: { functionName: string }) => {
    if (args.functionName === "getVerificationData") {
      return [
        BigInt(1_000_000), // voucherOutstanding
        BigInt(1_000_000), // voucherCollectable
        BigInt(10_000_000), // balance
        BigInt(10_000_000), // availableBalance
        BigInt(10_000_000), // allowance
        BigInt(0), // nonce
        false, // isDepositNonceUsed
      ];
    }
    throw new Error(`Unmocked contract read: ${args.functionName}`);
  });
  vi.mocked(wallet.writeContract).mockResolvedValue("0x1234567890abcdef");
  vi.mocked(wallet.waitForTransactionReceipt).mockResolvedValue({
    status: "success",
    logs: [
      {
        data: "0x000000000000000000000000111111111111111111111111111111111111111100000000000000000000000000000000000000000000000000000000000003f900000000000000000000000000000000000000000000000000000000000003f9",
        topics: [
          "0x9cc196634f792f4e61cf0cd71e2fbbd459e54c5e57a9bad3e6f7b6e79503cc70",
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
  vi.mocked(wallet.readContract).mockImplementation(async (args: { functionName: string }) => {
    if (args.functionName === "getVerificationData") {
      return [
        BigInt(1_000_000), // voucherOutstanding
        BigInt(1_000_000), // voucherCollectable
        BigInt(10_000_000), // balance
        BigInt(10_000_000), // availableBalance
        BigInt(10_000_000), // allowance
        BigInt(0), // nonce
        false, // isDepositNonceUsed
      ];
    }
    throw new Error(`Unmocked contract read: ${args.functionName}`);
  });
}

/**
 * Mock blockchain interactions for settle with deposit authorization (with permit)
 *
 * @param wallet - The wallet to mock blockchain interactions for
 */
function mockBlockchainInteractionsSettleWithDepositAuth(wallet: SignerWallet<Chain, Transport>) {
  vi.mocked(wallet.readContract).mockImplementation(async (args: { functionName: string }) => {
    if (args.functionName === "getVerificationData") {
      return [
        BigInt(1_000_000), // voucherOutstanding
        BigInt(1_000_000), // voucherCollectable
        BigInt(10_000_000), // balance
        BigInt(10_000_000), // availableBalance
        BigInt(10_000_000), // allowance
        BigInt(0), // nonce
        false, // isDepositNonceUsed
      ];
    }
    throw new Error(`Unmocked contract read: ${args.functionName}`);
  });
  vi.mocked(wallet.writeContract).mockResolvedValue("0x1234567890abcdef");
  vi.mocked(wallet.waitForTransactionReceipt).mockResolvedValue({
    status: "success",
    logs: [
      {
        data: "0x000000000000000000000000111111111111111111111111111111111111111100000000000000000000000000000000000000000000000000000000000003f900000000000000000000000000000000000000000000000000000000000003f9",
        topics: [
          "0x9cc196634f792f4e61cf0cd71e2fbbd459e54c5e57a9bad3e6f7b6e79503cc70",
          "0x198e73e1cecf59db4fbf8ca10000000000000000000000000000000000000000",
          "0x00000000000000000000000080cdf1957ebb7a2df22dd8913753a4423ff4272e",
          "0x000000000000000000000000c93d37ad45c907ee1b27a02b2e1bd823ba9d379c",
        ],
      } as unknown as Log<bigint, number, false>,
    ],
  } as TransactionReceipt);
}

/**
 * Mock blockchain interactions for settle with deposit authorization (no permit)
 *
 * @param wallet - The wallet to mock blockchain interactions for
 */
function mockBlockchainInteractionsSettleWithDepositAuthNoPermit(
  wallet: SignerWallet<Chain, Transport>,
) {
  vi.mocked(wallet.readContract).mockImplementation(async (args: { functionName: string }) => {
    if (args.functionName === "getVerificationData") {
      return [
        BigInt(1_000_000), // voucherOutstanding
        BigInt(1_000_000), // voucherCollectable
        BigInt(10_000_000), // balance
        BigInt(10_000_000), // availableBalance
        BigInt(10_000_000), // allowance
        BigInt(0), // nonce
        false, // isDepositNonceUsed
      ];
    }
    throw new Error(`Unmocked contract read: ${args.functionName}`);
  });
  vi.mocked(wallet.writeContract).mockResolvedValue("0x1234567890abcdef");
  vi.mocked(wallet.waitForTransactionReceipt).mockResolvedValue({
    status: "success",
    logs: [
      {
        data: "0x000000000000000000000000111111111111111111111111111111111111111100000000000000000000000000000000000000000000000000000000000003f900000000000000000000000000000000000000000000000000000000000003f9",
        topics: [
          "0x9cc196634f792f4e61cf0cd71e2fbbd459e54c5e57a9bad3e6f7b6e79503cc70",
          "0x198e73e1cecf59db4fbf8ca10000000000000000000000000000000000000000",
          "0x00000000000000000000000080cdf1957ebb7a2df22dd8913753a4423ff4272e",
          "0x000000000000000000000000c93d37ad45c907ee1b27a02b2e1bd823ba9d379c",
        ],
      } as unknown as Log<bigint, number, false>,
    ],
  } as TransactionReceipt);
}
