import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  appendTransactionMessageInstruction,
  createTransactionMessage,
  generateKeyPairSigner,
  getBase64EncodedWireTransaction,
  getCompiledTransactionMessageEncoder,
  pipe,
  setTransactionMessageFeePayer,
  setTransactionMessageLifetimeUsingBlockhash,
  type Address,
  type IInstruction,
} from "@solana/kit";
import { TOKEN_PROGRAM_ADDRESS } from "@solana-program/token";
import { SOLANA_DEVNET_CAIP2, USDC_DEVNET_ADDRESS } from "../../src/constants";

const COMPUTE_BUDGET_PROGRAM = "ComputeBudget111111111111111111111111111111" as Address;
const TOKEN_PROGRAM = TOKEN_PROGRAM_ADDRESS.toString();

const FAKE_BLOCKHASH = {
  blockhash: "5Tx8F3jgSHx21CbtjwmdaKPLM5tWmreWAnPrbqHomSJF" as string &
    import("@solana/kit").Blockhash,
  lastValidBlockHeight: 1000n,
};

let mockAtaMap: Record<string, Address> = {};

vi.mock("@solana-program/token-2022", async () => {
  const actual = await vi.importActual<typeof import("@solana-program/token-2022")>(
    "@solana-program/token-2022",
  );
  return {
    ...actual,
    findAssociatedTokenPda: vi.fn().mockImplementation(async (args: { owner: unknown }) => {
      const owner = String(args.owner);
      const ata = mockAtaMap[owner];
      if (!ata) {
        throw new Error(`Missing ATA mock for owner ${owner}`);
      }
      return [ata, 255] as const;
    }),
  };
});

async function buildTransaction(feePayer: Address, instructions: IInstruction[]) {
  const { compileTransactionMessage } = await import("@solana/kit");
  let msg = pipe(
    createTransactionMessage({ version: 0 }),
    m => setTransactionMessageFeePayer(feePayer, m),
    m => setTransactionMessageLifetimeUsingBlockhash(FAKE_BLOCKHASH, m),
  );
  for (const ix of instructions) {
    msg = appendTransactionMessageInstruction(ix, msg);
  }
  const compiled = compileTransactionMessage(msg);
  const messageBytes = getCompiledTransactionMessageEncoder().encode(compiled);
  return { messageBytes, signatures: {} };
}

async function buildSmartWalletPayload(feePayer: Address, unknownProgram: Address, payer: Address) {
  const tx = await buildTransaction(feePayer, [
    { programAddress: COMPUTE_BUDGET_PROGRAM, data: new Uint8Array([2, 160, 134, 1, 0]) },
    { programAddress: COMPUTE_BUDGET_PROGRAM, data: new Uint8Array([3, 16, 39, 0, 0, 0, 0, 0, 0]) },
    {
      programAddress: unknownProgram,
      accounts: [{ address: payer, role: 1 }],
      data: new Uint8Array([0]),
    },
  ]);

  const txWithSig = {
    messageBytes: tx.messageBytes,
    signatures: { [feePayer]: new Uint8Array(64) } as Record<string, Uint8Array>,
  };

  return getBase64EncodedWireTransaction(txWithSig as never);
}

function buildMockInnerTransfer(
  programId: string,
  mint: string,
  destination: string,
  authority: string,
  amount: string,
) {
  return {
    programId,
    parsed: {
      type: "transferChecked",
      info: { mint, destination, authority, tokenAmount: { amount } },
    },
  } as Record<string, unknown>;
}

describe("ExactSvmScheme smart wallet fallback path", () => {
  beforeEach(() => {
    mockAtaMap = {};
    vi.clearAllMocks();
  });

  it("verify falls back to simulation when static path rejects unknown program", async () => {
    const { ExactSvmScheme } = await import("../../src/exact/facilitator/scheme");

    const feePayer = await generateKeyPairSigner();
    const unknownProgram = await generateKeyPairSigner();
    const payTo = await generateKeyPairSigner();
    const payer = await generateKeyPairSigner();

    const expectedAta = payTo.address;
    mockAtaMap[payTo.address] = expectedAta;

    const txBase64 = await buildSmartWalletPayload(
      feePayer.address,
      unknownProgram.address,
      payer.address,
    );

    const mockSigner = {
      getAddresses: vi.fn().mockReturnValue([feePayer.address]),
      signTransaction: vi.fn().mockResolvedValue(txBase64),
      simulateTransaction: vi.fn().mockResolvedValue(undefined),
      sendTransaction: vi.fn(),
      confirmTransaction: vi.fn(),
      getConfirmedTransactionInnerInstructions: vi.fn().mockResolvedValue(null),
      getTokenAccountBalance: vi.fn().mockResolvedValue(null),
      simulateTransactionWithInnerInstructions: vi.fn().mockResolvedValue({
        innerInstructions: [
          {
            index: 0,
            instructions: [
              buildMockInnerTransfer(
                TOKEN_PROGRAM,
                USDC_DEVNET_ADDRESS,
                expectedAta,
                payer.address as string,
                "100000",
              ),
            ],
          },
        ],
      }),
    };

    const scheme = new ExactSvmScheme(mockSigner as never, undefined, {
      enableSmartWalletVerification: true,
      smartWalletAllowedPrograms: [unknownProgram.address],
    });

    const result = await scheme.verify(
      {
        x402Version: 2,
        resource: { url: "http://test.com", description: "test", mimeType: "application/json" },
        accepted: {
          scheme: "exact",
          network: SOLANA_DEVNET_CAIP2,
          asset: USDC_DEVNET_ADDRESS,
          amount: "100000",
          payTo: payTo.address,
          maxTimeoutSeconds: 3600,
          extra: { feePayer: feePayer.address },
        },
        payload: { transaction: txBase64 },
      } as never,
      {
        scheme: "exact",
        network: SOLANA_DEVNET_CAIP2,
        asset: USDC_DEVNET_ADDRESS,
        amount: "100000",
        payTo: payTo.address,
        maxTimeoutSeconds: 3600,
        extra: { feePayer: feePayer.address },
      } as never,
    );

    expect(result.isValid).toBe(true);
    expect(result.payer).toBe(payer.address);
    expect(mockSigner.simulateTransactionWithInnerInstructions).toHaveBeenCalled();
  });

  it("verify rejects smart wallet transaction with multiple matching transfers", async () => {
    const { ExactSvmScheme } = await import("../../src/exact/facilitator/scheme");

    const feePayer = await generateKeyPairSigner();
    const unknownProgram = await generateKeyPairSigner();
    const payTo = await generateKeyPairSigner();
    const payer = await generateKeyPairSigner();

    const expectedAta = payTo.address;
    mockAtaMap[payTo.address] = expectedAta;

    const txBase64 = await buildSmartWalletPayload(
      feePayer.address,
      unknownProgram.address,
      payer.address,
    );

    const mockSigner = {
      getAddresses: vi.fn().mockReturnValue([feePayer.address]),
      signTransaction: vi.fn().mockResolvedValue(txBase64),
      simulateTransaction: vi.fn().mockResolvedValue(undefined),
      sendTransaction: vi.fn(),
      confirmTransaction: vi.fn(),
      getConfirmedTransactionInnerInstructions: vi.fn().mockResolvedValue(null),
      getTokenAccountBalance: vi.fn().mockResolvedValue(null),
      simulateTransactionWithInnerInstructions: vi.fn().mockResolvedValue({
        innerInstructions: [
          {
            index: 0,
            instructions: [
              buildMockInnerTransfer(
                TOKEN_PROGRAM,
                USDC_DEVNET_ADDRESS,
                expectedAta,
                payer.address as string,
                "100000",
              ),
              buildMockInnerTransfer(
                TOKEN_PROGRAM,
                USDC_DEVNET_ADDRESS,
                expectedAta,
                payer.address as string,
                "100000",
              ),
            ],
          },
        ],
      }),
    };

    const scheme = new ExactSvmScheme(mockSigner as never, undefined, {
      enableSmartWalletVerification: true,
      smartWalletAllowedPrograms: [unknownProgram.address],
    });

    const result = await scheme.verify(
      {
        x402Version: 2,
        resource: { url: "http://test.com", description: "test", mimeType: "application/json" },
        accepted: {
          scheme: "exact",
          network: SOLANA_DEVNET_CAIP2,
          asset: USDC_DEVNET_ADDRESS,
          amount: "100000",
          payTo: payTo.address,
          maxTimeoutSeconds: 3600,
          extra: { feePayer: feePayer.address },
        },
        payload: { transaction: txBase64 },
      } as never,
      {
        scheme: "exact",
        network: SOLANA_DEVNET_CAIP2,
        asset: USDC_DEVNET_ADDRESS,
        amount: "100000",
        payTo: payTo.address,
        maxTimeoutSeconds: 3600,
        extra: { feePayer: feePayer.address },
      } as never,
    );

    expect(result.isValid).toBe(false);
    expect(result.invalidReason).toBe("smart_wallet_multiple_matching_transfers");
  });

  it("verify rejects smart wallet transaction when fee payer is transfer authority", async () => {
    const { ExactSvmScheme } = await import("../../src/exact/facilitator/scheme");

    const feePayer = await generateKeyPairSigner();
    const unknownProgram = await generateKeyPairSigner();
    const payTo = await generateKeyPairSigner();
    const payer = await generateKeyPairSigner();

    const expectedAta = payTo.address;
    mockAtaMap[payTo.address] = expectedAta;

    // Fee payer NOT in instruction accounts (passes isolation check),
    // but simulation returns fee payer as the transfer authority (caught at step 4)
    const txBase64 = await buildSmartWalletPayload(
      feePayer.address,
      unknownProgram.address,
      payer.address,
    );

    const mockSigner = {
      getAddresses: vi.fn().mockReturnValue([feePayer.address]),
      signTransaction: vi.fn().mockResolvedValue(txBase64),
      simulateTransaction: vi.fn().mockResolvedValue(undefined),
      sendTransaction: vi.fn(),
      confirmTransaction: vi.fn(),
      getConfirmedTransactionInnerInstructions: vi.fn().mockResolvedValue(null),
      getTokenAccountBalance: vi.fn().mockResolvedValue(null),
      simulateTransactionWithInnerInstructions: vi.fn().mockResolvedValue({
        innerInstructions: [
          {
            index: 0,
            instructions: [
              buildMockInnerTransfer(
                TOKEN_PROGRAM,
                USDC_DEVNET_ADDRESS,
                expectedAta,
                feePayer.address as string,
                "100000",
              ),
            ],
          },
        ],
      }),
    };

    const scheme = new ExactSvmScheme(mockSigner as never, undefined, {
      enableSmartWalletVerification: true,
      smartWalletAllowedPrograms: [unknownProgram.address],
    });

    const result = await scheme.verify(
      {
        x402Version: 2,
        resource: { url: "http://test.com", description: "test", mimeType: "application/json" },
        accepted: {
          scheme: "exact",
          network: SOLANA_DEVNET_CAIP2,
          asset: USDC_DEVNET_ADDRESS,
          amount: "100000",
          payTo: payTo.address,
          maxTimeoutSeconds: 3600,
          extra: { feePayer: feePayer.address },
        },
        payload: { transaction: txBase64 },
      } as never,
      {
        scheme: "exact",
        network: SOLANA_DEVNET_CAIP2,
        asset: USDC_DEVNET_ADDRESS,
        amount: "100000",
        payTo: payTo.address,
        maxTimeoutSeconds: 3600,
        extra: { feePayer: feePayer.address },
      } as never,
    );

    expect(result.isValid).toBe(false);
    expect(result.invalidReason).toBe(
      "invalid_exact_svm_payload_transaction_fee_payer_transferring_funds",
    );
  });

  it("verify rejects smart wallet transaction when program is not in allowlist", async () => {
    const { ExactSvmScheme } = await import("../../src/exact/facilitator/scheme");

    const feePayer = await generateKeyPairSigner();
    const unknownProgram = await generateKeyPairSigner();
    const payTo = await generateKeyPairSigner();
    const payer = await generateKeyPairSigner();

    const txBase64 = await buildSmartWalletPayload(
      feePayer.address,
      unknownProgram.address,
      payer.address,
    );

    const mockSigner = {
      getAddresses: vi.fn().mockReturnValue([feePayer.address]),
      signTransaction: vi.fn().mockResolvedValue(txBase64),
      simulateTransaction: vi.fn().mockResolvedValue(undefined),
      sendTransaction: vi.fn(),
      confirmTransaction: vi.fn(),
      simulateTransactionWithInnerInstructions: vi.fn().mockResolvedValue({
        innerInstructions: [],
      }),
      getConfirmedTransactionInnerInstructions: vi.fn().mockResolvedValue(null),
      getTokenAccountBalance: vi.fn().mockResolvedValue(null),
    };

    // Allowlist does NOT include unknownProgram
    const scheme = new ExactSvmScheme(mockSigner as never, undefined, {
      enableSmartWalletVerification: true,
      smartWalletAllowedPrograms: ["SQDS4ep65T869zMMBKyuUq6aD6EgTu8psMjkvj52pCf"],
    });

    const result = await scheme.verify(
      {
        x402Version: 2,
        accepted: {
          scheme: "exact",
          network: SOLANA_DEVNET_CAIP2,
          asset: USDC_DEVNET_ADDRESS,
          amount: "100000",
          payTo: payTo.address,
          extra: { feePayer: feePayer.address },
        },
        payload: { transaction: txBase64 },
      } as never,
      {
        scheme: "exact",
        network: SOLANA_DEVNET_CAIP2,
        asset: USDC_DEVNET_ADDRESS,
        amount: "100000",
        payTo: payTo.address,
        maxTimeoutSeconds: 3600,
        extra: { feePayer: feePayer.address },
      } as never,
    );

    expect(result.isValid).toBe(false);
    expect(result.invalidReason).toContain("smart_wallet_program_not_allowed");
  });
});
