import { beforeEach, describe, expect, it, vi } from "vitest";
import { ExactSvmScheme as ExactSvmFacilitator } from "../../src/exact/facilitator/scheme";
import { ExactSvmSchemeV1 as ExactSvmFacilitatorV1 } from "../../src/exact/v1/facilitator/scheme";
import type { FacilitatorSvmSigner } from "../../src/signer";
import type { PaymentPayload, PaymentRequirements } from "@x402/core/types";
import type { PaymentPayloadV1, PaymentRequirementsV1 } from "@x402/core/types/v1";
import {
  appendTransactionMessageInstructions,
  createTransactionMessage,
  getBase64EncodedWireTransaction,
  getBase64Decoder,
  partiallySignTransactionMessageWithSigners,
  pipe,
  prependTransactionMessageInstruction,
  setTransactionMessageFeePayer,
  setTransactionMessageLifetimeUsingBlockhash,
  type Address,
} from "@solana/kit";
import {
  getSetComputeUnitLimitInstruction,
  setTransactionMessageComputeUnitPrice,
} from "@solana-program/compute-budget";
import { TOKEN_PROGRAM_ADDRESS } from "@solana-program/token";
import {
  MEMO_PROGRAM_ADDRESS,
  SOLANA_DEVNET_CAIP2,
  SOLANA_MAGIC_OK,
  USDC_DEVNET_ADDRESS,
} from "../../src/constants";

vi.mock("../../src/utils", async () => {
  const actual = await vi.importActual<typeof import("../../src/utils")>("../../src/utils");
  return {
    ...actual,
    createRpcClient: vi.fn(),
  };
});

function buildAgenticTransactionBase64(args: {
  feePayer: Address;
  payerProgram: Address;
}): Promise<string> {
  const memoIx = {
    programAddress: MEMO_PROGRAM_ADDRESS as Address,
    accounts: [] as const,
    data: new TextEncoder().encode("nonce"),
  };

  const agenticIx = {
    programAddress: args.payerProgram,
    accounts: [] as const,
    data: new Uint8Array([1, 2, 3]),
  };

  const txMsg = pipe(
    createTransactionMessage({ version: 0 }),
    tx => setTransactionMessageComputeUnitPrice(1, tx),
    tx => setTransactionMessageFeePayer(args.feePayer, tx),
    tx =>
      prependTransactionMessageInstruction(
        getSetComputeUnitLimitInstruction({ units: 20_000 }),
        tx,
      ),
    tx => appendTransactionMessageInstructions([agenticIx, memoIx], tx),
    tx =>
      setTransactionMessageLifetimeUsingBlockhash(
        { blockhash: "11111111111111111111111111111111", lastValidBlockHeight: 123n },
        tx,
      ),
  );

  return partiallySignTransactionMessageWithSigners(txMsg).then(tx =>
    getBase64EncodedWireTransaction(tx),
  );
}

describe("SVM Exact Facilitator (agentic program verification)", () => {
  const feePayer = "8ZJ5n3j7xR7BPFfP4P7mP9oU5R5p4WfB9eY2cX5h7YpG" as Address;
  const payerProgram = "BPFLoader1111111111111111111111111111111111" as Address;
  const payTo = "4Nd1mQ4wE2YqCpt9d2bX9vLkqQ7qkQ7gJgS6pCz6eGxX" as Address;

  let mockSigner: FacilitatorSvmSigner;
  let agenticTx: string;

  const base64MagicOk = getBase64Decoder().decode(new TextEncoder().encode(SOLANA_MAGIC_OK));

  beforeEach(async () => {
    agenticTx = await buildAgenticTransactionBase64({ feePayer, payerProgram });

    mockSigner = {
      getAddresses: () => [feePayer],
      signTransaction: vi.fn().mockResolvedValue(agenticTx),
      simulateTransaction: vi.fn(),
      sendTransaction: vi.fn(),
      confirmTransaction: vi.fn(),
    };
  });

  function mockRpc(args?: {
    returnDataProgramId?: string;
    returnDataBase64?: string | null;
    invocationCount?: number;
    preFeePayerLamports?: number;
    postFeePayerLamports?: number;
    preRecipientAmount?: string;
    postRecipientAmount?: string;
  }) {
    const {
      returnDataProgramId = payerProgram.toString(),
      returnDataBase64 = base64MagicOk,
      invocationCount = 1,
      preFeePayerLamports = 1_000_000,
      postFeePayerLamports = preFeePayerLamports,
      preRecipientAmount = "0",
      postRecipientAmount = "1000",
    } = args ?? {};

    const logs = [
      ...Array.from(
        { length: invocationCount },
        (_, i) => `Program ${payerProgram} invoke [${i + 1}]`,
      ),
      `Program ${payerProgram} success`,
    ];

    const returnData =
      returnDataBase64 === null
        ? null
        : {
            programId: returnDataProgramId,
            data: [returnDataBase64, "base64"] as [string, string],
          };

    return {
      getAccountInfo: vi.fn().mockImplementation((address: string, config?: unknown) => {
        const encoding =
          typeof config === "object" && config && "encoding" in config
            ? (config as { encoding?: unknown }).encoding
            : undefined;

        if (address === payerProgram) {
          return {
            send: vi.fn().mockResolvedValue({
              value: { executable: true, owner: "BPFLoader1111111111111111111111111111111111" },
            }),
          };
        }

        if (address === USDC_DEVNET_ADDRESS) {
          return {
            send: vi.fn().mockResolvedValue({
              value: { owner: TOKEN_PROGRAM_ADDRESS.toString() },
            }),
          };
        }

        if (address === feePayer && encoding === "base64") {
          return {
            send: vi.fn().mockResolvedValue({
              value: { lamports: preFeePayerLamports },
            }),
          };
        }

        if (encoding === "jsonParsed") {
          return {
            send: vi.fn().mockResolvedValue({
              value: {
                data: {
                  parsed: { info: { tokenAmount: { amount: preRecipientAmount } } },
                },
              },
            }),
          };
        }

        return { send: vi.fn().mockResolvedValue({ value: null }) };
      }),

      simulateTransaction: vi.fn().mockImplementation((_tx: string, config?: unknown) => {
        const addresses =
          typeof config === "object" &&
          config &&
          "accounts" in config &&
          (config as { accounts?: unknown }).accounts &&
          typeof (config as { accounts: { addresses?: unknown } }).accounts.addresses !==
            "undefined"
            ? ((config as { accounts: { addresses: string[] } }).accounts.addresses as string[])
            : [];

        const accounts = addresses.map(addr => {
          if (addr === feePayer.toString()) {
            return { lamports: postFeePayerLamports };
          }
          return {
            data: {
              parsed: { info: { tokenAmount: { amount: postRecipientAmount } } },
            },
          };
        });

        return {
          send: vi.fn().mockResolvedValue({
            value: {
              err: null,
              logs,
              returnData,
              accounts,
            },
          }),
        };
      }),
    };
  }

  it("accepts agentic program payments when enabled and magic ok is returned", async () => {
    const { createRpcClient } = await import("../../src/utils");
    (createRpcClient as unknown as ReturnType<typeof vi.fn>).mockReturnValue(mockRpc());

    const facilitator = new ExactSvmFacilitator(mockSigner, { enableAgenticSVM: true });

    const payload: PaymentPayload = {
      x402Version: 2,
      resource: {
        url: "https://example.com/protected",
        description: "Test",
        mimeType: "application/json",
      },
      accepted: {
        scheme: "exact",
        network: SOLANA_DEVNET_CAIP2,
        asset: USDC_DEVNET_ADDRESS,
        amount: "1000",
        payTo: payTo,
        maxTimeoutSeconds: 60,
        extra: { feePayer },
      },
      payload: { transaction: agenticTx },
    };

    const requirements: PaymentRequirements = {
      scheme: "exact",
      network: SOLANA_DEVNET_CAIP2,
      asset: USDC_DEVNET_ADDRESS,
      amount: "1000",
      payTo: payTo,
      maxTimeoutSeconds: 60,
      extra: { feePayer },
    };

    const result = await facilitator.verify(payload, requirements);
    expect(result.isValid).toBe(true);
    expect(result.payer).toBe(payerProgram);
  });

  it("rejects agentic program payments when disabled", async () => {
    const facilitator = new ExactSvmFacilitator(mockSigner, { enableAgenticSVM: false });

    const payload: PaymentPayload = {
      x402Version: 2,
      resource: {
        url: "https://example.com/protected",
        description: "Test",
        mimeType: "application/json",
      },
      accepted: {
        scheme: "exact",
        network: SOLANA_DEVNET_CAIP2,
        asset: USDC_DEVNET_ADDRESS,
        amount: "1000",
        payTo: payTo,
        maxTimeoutSeconds: 60,
        extra: { feePayer },
      },
      payload: { transaction: agenticTx },
    };

    const requirements: PaymentRequirements = {
      scheme: "exact",
      network: SOLANA_DEVNET_CAIP2,
      asset: USDC_DEVNET_ADDRESS,
      amount: "1000",
      payTo: payTo,
      maxTimeoutSeconds: 60,
      extra: { feePayer },
    };

    const result = await facilitator.verify(payload, requirements);
    expect(result.isValid).toBe(false);
    expect(result.invalidReason).toBe("invalid_exact_svm_payload_no_transfer_instruction");
  });

  it("rejects when agentic program does not return magic ok", async () => {
    const { createRpcClient } = await import("../../src/utils");
    (createRpcClient as unknown as ReturnType<typeof vi.fn>).mockReturnValue(
      mockRpc({ returnDataBase64: null }),
    );

    const facilitator = new ExactSvmFacilitator(mockSigner, { enableAgenticSVM: true });

    const payload: PaymentPayload = {
      x402Version: 2,
      resource: { url: "https://example.com", description: "Test", mimeType: "application/json" },
      accepted: {
        scheme: "exact",
        network: SOLANA_DEVNET_CAIP2,
        asset: USDC_DEVNET_ADDRESS,
        amount: "1000",
        payTo: payTo,
        maxTimeoutSeconds: 60,
        extra: { feePayer },
      },
      payload: { transaction: agenticTx },
    };

    const requirements: PaymentRequirements = {
      scheme: "exact",
      network: SOLANA_DEVNET_CAIP2,
      asset: USDC_DEVNET_ADDRESS,
      amount: "1000",
      payTo: payTo,
      maxTimeoutSeconds: 60,
      extra: { feePayer },
    };

    const result = await facilitator.verify(payload, requirements);
    expect(result.isValid).toBe(false);
    expect(result.invalidReason).toBe("invalid_svm_agentic_signature");
  });

  it("rejects on agentic reentrancy (multiple invocations)", async () => {
    const { createRpcClient } = await import("../../src/utils");
    (createRpcClient as unknown as ReturnType<typeof vi.fn>).mockReturnValue(
      mockRpc({ invocationCount: 2 }),
    );

    const facilitator = new ExactSvmFacilitator(mockSigner, { enableAgenticSVM: true });

    const payload: PaymentPayload = {
      x402Version: 2,
      resource: { url: "https://example.com", description: "Test", mimeType: "application/json" },
      accepted: {
        scheme: "exact",
        network: SOLANA_DEVNET_CAIP2,
        asset: USDC_DEVNET_ADDRESS,
        amount: "1000",
        payTo: payTo,
        maxTimeoutSeconds: 60,
        extra: { feePayer },
      },
      payload: { transaction: agenticTx },
    };

    const requirements: PaymentRequirements = {
      scheme: "exact",
      network: SOLANA_DEVNET_CAIP2,
      asset: USDC_DEVNET_ADDRESS,
      amount: "1000",
      payTo: payTo,
      maxTimeoutSeconds: 60,
      extra: { feePayer },
    };

    const result = await facilitator.verify(payload, requirements);
    expect(result.isValid).toBe(false);
    expect(result.invalidReason).toBe("invalid_exact_svm_agentic_reentrancy");
  });

  it("rejects on lamport conservation failure", async () => {
    const { createRpcClient } = await import("../../src/utils");
    (createRpcClient as unknown as ReturnType<typeof vi.fn>).mockReturnValue(
      mockRpc({ preFeePayerLamports: 1_000_000, postFeePayerLamports: 999_000 }),
    );

    const facilitator = new ExactSvmFacilitator(mockSigner, { enableAgenticSVM: true });

    const payload: PaymentPayload = {
      x402Version: 2,
      resource: { url: "https://example.com", description: "Test", mimeType: "application/json" },
      accepted: {
        scheme: "exact",
        network: SOLANA_DEVNET_CAIP2,
        asset: USDC_DEVNET_ADDRESS,
        amount: "1000",
        payTo: payTo,
        maxTimeoutSeconds: 60,
        extra: { feePayer },
      },
      payload: { transaction: agenticTx },
    };

    const requirements: PaymentRequirements = {
      scheme: "exact",
      network: SOLANA_DEVNET_CAIP2,
      asset: USDC_DEVNET_ADDRESS,
      amount: "1000",
      payTo: payTo,
      maxTimeoutSeconds: 60,
      extra: { feePayer },
    };

    const result = await facilitator.verify(payload, requirements);
    expect(result.isValid).toBe(false);
    expect(result.invalidReason).toBe("invalid_exact_svm_agentic_lamport_conservation");
  });

  it("supports V1 facilitator with agentic program verification", async () => {
    const { createRpcClient } = await import("../../src/utils");
    (createRpcClient as unknown as ReturnType<typeof vi.fn>).mockReturnValue(mockRpc());

    const facilitator = new ExactSvmFacilitatorV1(mockSigner, { enableAgenticSVM: true });

    const payloadV1: PaymentPayloadV1 = {
      x402Version: 1,
      scheme: "exact",
      network: "solana-devnet",
      payload: { transaction: agenticTx },
    };

    const requirementsV1: PaymentRequirementsV1 = {
      scheme: "exact",
      network: "solana-devnet",
      asset: USDC_DEVNET_ADDRESS,
      maxAmountRequired: "1000",
      payTo: payTo,
      maxTimeoutSeconds: 60,
      extra: { feePayer },
    };

    const result = await facilitator.verify(payloadV1 as never, requirementsV1 as never);
    expect(result.isValid).toBe(true);
    expect(result.payer).toBe(payerProgram);
  });
});
