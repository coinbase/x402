import {
  COMPUTE_BUDGET_PROGRAM_ADDRESS,
  parseSetComputeUnitLimitInstruction,
  parseSetComputeUnitPriceInstruction,
} from "@solana-program/compute-budget";
import { TOKEN_PROGRAM_ADDRESS } from "@solana-program/token";
import {
  ASSOCIATED_TOKEN_PROGRAM_ADDRESS,
  findAssociatedTokenPda,
  parseCreateAssociatedTokenInstruction,
  TOKEN_2022_PROGRAM_ADDRESS,
} from "@solana-program/token-2022";
import {
  getBase64EncodedWireTransaction,
  getCompiledTransactionMessageDecoder,
  type Address,
  type CompiledTransactionMessage,
} from "@solana/kit";
import type {
  PaymentPayload,
  PaymentRequirements,
  SchemeNetworkFacilitator,
  SettleResponse,
  VerifyResponse,
} from "@x402/core/types";
import type { PaymentPayloadV1, PaymentRequirementsV1 } from "@x402/core/types/v1";
import { MAX_COMPUTE_UNIT_PRICE } from "../../constants";
import type { FacilitatorSvmSigner } from "../../signer";
import { createRpcCapabilitiesFromRpc } from "../../signer";
import type { ExactSvmPayloadV1 } from "../../types";
import { decodeTransactionFromPayload, getTokenPayerFromTransaction } from "../../utils";

/**
 * SVM facilitator implementation for the Exact payment scheme (V1).
 */
export class ExactSvmFacilitatorV1 implements SchemeNetworkFacilitator {
  readonly scheme = "exact";

  /**
   * Creates a new ExactSvmFacilitatorV1 instance.
   *
   * @param signer - The SVM RPC client for facilitator operations
   * @returns ExactSvmFacilitatorV1 instance
   */
  constructor(private readonly signer: FacilitatorSvmSigner) {}

  /**
   * Verifies a payment payload (V1).
   *
   * @param payload - The payment payload to verify
   * @param requirements - The payment requirements
   * @returns Promise resolving to verification response
   */
  async verify(
    payload: PaymentPayload,
    requirements: PaymentRequirements,
  ): Promise<VerifyResponse> {
    const requirementsV1 = requirements as unknown as PaymentRequirementsV1;
    const payloadV1 = payload as unknown as PaymentPayloadV1;
    const exactSvmPayload = payload.payload as ExactSvmPayloadV1;

    // Step 1: Validate Payment Requirements
    if (payloadV1.scheme !== "exact" || requirements.scheme !== "exact") {
      return {
        isValid: false,
        invalidReason: "unsupported_scheme",
        payer: "",
      };
    }

    if (!requirementsV1.extra?.feePayer || typeof requirementsV1.extra.feePayer !== "string") {
      return {
        isValid: false,
        invalidReason: "invalid_exact_svm_payload_missing_fee_payer",
        payer: "",
      };
    }

    // Step 2: Parse and Validate Transaction Structure
    let transaction;
    try {
      transaction = decodeTransactionFromPayload(exactSvmPayload);
    } catch {
      return {
        isValid: false,
        invalidReason: "invalid_exact_svm_payload_transaction",
        payer: "",
      };
    }

    const compiled = getCompiledTransactionMessageDecoder().decode(
      transaction.messageBytes,
    ) as CompiledTransactionMessage;
    const instructions = compiled.instructions ?? [];
    const staticAccounts = compiled.staticAccounts ?? [];

    // 3 instructions: ComputeLimit + ComputePrice + TransferChecked
    // 4 instructions: ComputeLimit + ComputePrice + CreateATA + TransferChecked
    if (instructions.length !== 3 && instructions.length !== 4) {
      return {
        isValid: false,
        invalidReason: "invalid_exact_svm_payload_transaction_instructions_length",
        payer: "",
      };
    }

    // Step 3: Verify Compute Budget Instructions
    try {
      this.verifyComputeLimitInstruction(instructions[0] as never, staticAccounts);
      this.verifyComputePriceInstruction(instructions[1] as never, staticAccounts);
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      return {
        isValid: false,
        invalidReason: errorMessage,
        payer: "",
      };
    }

    const payer = getTokenPayerFromTransaction(transaction);
    if (!payer) {
      return {
        isValid: false,
        invalidReason: "invalid_exact_svm_payload_no_transfer_instruction",
        payer: "",
      };
    }

    if (payloadV1.network !== requirements.network) {
      return {
        isValid: false,
        invalidReason: "network_mismatch",
        payer,
      };
    }

    // Step 4: Verify Optional ATA Creation
    if (instructions.length === 4) {
      try {
        this.verifyCreateATAInstruction(instructions[2] as never, staticAccounts, requirements);
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        return {
          isValid: false,
          invalidReason: errorMessage,
          payer,
        };
      }
    }

    // Step 5: Verify Transfer Instruction
    const transferIxIndex = instructions.length === 3 ? 2 : 3;
    const transferIx = instructions[transferIxIndex];
    const programAddress = staticAccounts[transferIx.programAddressIndex].toString();

    if (
      programAddress !== TOKEN_PROGRAM_ADDRESS.toString() &&
      programAddress !== TOKEN_2022_PROGRAM_ADDRESS.toString()
    ) {
      return {
        isValid: false,
        invalidReason: "invalid_exact_svm_payload_no_transfer_instruction",
        payer,
      };
    }

    const accountIndices = transferIx.accountIndices ?? [];
    if (accountIndices.length < 4) {
      return {
        isValid: false,
        invalidReason: "invalid_exact_svm_payload_no_transfer_instruction",
        payer,
      };
    }

    // TransferChecked accounts: [source, mint, destination, owner, ...]
    const mintAddress = staticAccounts[accountIndices[1]].toString();
    const destATA = staticAccounts[accountIndices[2]].toString();

    if (mintAddress !== requirements.asset) {
      return {
        isValid: false,
        invalidReason: "invalid_exact_svm_payload_mint_mismatch",
        payer,
      };
    }

    try {
      const [expectedDestATA] = await findAssociatedTokenPda({
        mint: requirements.asset as Address,
        owner: requirements.payTo as Address,
        tokenProgram:
          programAddress === TOKEN_PROGRAM_ADDRESS.toString()
            ? (TOKEN_PROGRAM_ADDRESS as Address)
            : (TOKEN_2022_PROGRAM_ADDRESS as Address),
      });

      if (destATA !== expectedDestATA.toString()) {
        return {
          isValid: false,
          invalidReason: "invalid_exact_svm_payload_recipient_mismatch",
          payer,
        };
      }
    } catch {
      return {
        isValid: false,
        invalidReason: "invalid_exact_svm_payload_recipient_mismatch",
        payer,
      };
    }

    // TransferChecked data: [discriminator(1), amount(8), decimals(1)]
    const ixData = transferIx.data;
    if (!ixData || ixData.length < 10) {
      return {
        isValid: false,
        invalidReason: "invalid_exact_svm_payload_no_transfer_instruction",
        payer,
      };
    }

    // Parse amount as little-endian u64 (bytes 1-8)
    const amountBytes = ixData.slice(1, 9);
    let amount = 0n;
    for (let i = 0; i < 8; i++) {
      amount += BigInt(amountBytes[i]) << BigInt(i * 8);
    }

    if (amount < BigInt(requirementsV1.maxAmountRequired)) {
      return {
        isValid: false,
        invalidReason: "invalid_exact_svm_payload_amount_insufficient",
        payer,
      };
    }

    // Step 6: Sign and Simulate Transaction
    // CRITICAL: Simulation proves transaction will succeed (catches insufficient balance, invalid accounts, etc)
    try {
      const partiallySignedTx = decodeTransactionFromPayload(exactSvmPayload);

      const signableMessage = {
        content: partiallySignedTx.messageBytes,
        signatures: partiallySignedTx.signatures,
      };

      const [facilitatorSignatureDictionary] = await this.signer.signMessages([
        signableMessage as never,
      ]);

      const fullySignedTx = {
        ...partiallySignedTx,
        signatures: {
          ...partiallySignedTx.signatures,
          ...facilitatorSignatureDictionary,
        },
      };

      const base64EncodedWireTransaction = getBase64EncodedWireTransaction(fullySignedTx);

      const rpc = this.signer.getRpcForNetwork(requirements.network);
      const rpcCapabilities = createRpcCapabilitiesFromRpc(rpc);

      await rpcCapabilities.simulateTransaction(base64EncodedWireTransaction, {
        sigVerify: true,
        replaceRecentBlockhash: false,
        commitment: "confirmed",
        encoding: "base64",
      });
    } catch {
      return {
        isValid: false,
        invalidReason: "transaction_simulation_failed",
        payer,
      };
    }

    return {
      isValid: true,
      invalidReason: undefined,
      payer,
    };
  }

  /**
   * Settles a payment by submitting the transaction (V1).
   *
   * @param payload - The payment payload to settle
   * @param requirements - The payment requirements
   * @returns Promise resolving to settlement response
   */
  async settle(
    payload: PaymentPayload,
    requirements: PaymentRequirements,
  ): Promise<SettleResponse> {
    const payloadV1 = payload as unknown as PaymentPayloadV1;
    const exactSvmPayload = payload.payload as ExactSvmPayloadV1;

    const valid = await this.verify(payload, requirements);
    if (!valid.isValid) {
      return {
        success: false,
        network: payloadV1.network,
        transaction: "",
        errorReason: valid.invalidReason ?? "invalid_scheme",
        payer: valid.payer || "",
      };
    }

    try {
      const partiallySignedTx = decodeTransactionFromPayload(exactSvmPayload);

      const signableMessage = {
        content: partiallySignedTx.messageBytes,
        signatures: partiallySignedTx.signatures,
      };

      const [facilitatorSignatureDictionary] = await this.signer.signMessages([
        signableMessage as never,
      ]);

      const fullySignedTx = {
        ...partiallySignedTx,
        signatures: {
          ...partiallySignedTx.signatures,
          ...facilitatorSignatureDictionary,
        },
      };

      const base64EncodedWireTransaction = getBase64EncodedWireTransaction(fullySignedTx);

      const rpc = this.signer.getRpcForNetwork(requirements.network);
      const rpcCapabilities = createRpcCapabilitiesFromRpc(rpc);

      const signature = await rpcCapabilities.sendTransaction(base64EncodedWireTransaction);
      await rpcCapabilities.confirmTransaction(signature);

      return {
        success: true,
        transaction: signature,
        network: payloadV1.network,
        payer: valid.payer,
      };
    } catch (error) {
      console.error("Failed to settle transaction:", error);
      return {
        success: false,
        errorReason: "transaction_failed",
        transaction: "",
        network: payloadV1.network,
        payer: valid.payer || "",
      };
    }
  }

  /**
   * Verify that the create ATA instruction is valid.
   *
   * @param instruction - The create ATA instruction
   * @param instruction.programAddressIndex - Program address index in static accounts
   * @param instruction.accountIndices - Account indices used in the instruction
   * @param instruction.data - Instruction data bytes
   * @param staticAccounts - Static accounts array from transaction
   * @param requirements - Payment requirements to verify against
   */
  private verifyCreateATAInstruction(
    instruction: {
      programAddressIndex: number;
      accountIndices?: readonly number[];
      data?: Readonly<Uint8Array>;
    },
    staticAccounts: Address[],
    requirements: PaymentRequirements,
  ): void {
    const programAddress = staticAccounts[instruction.programAddressIndex].toString();

    if (programAddress !== ASSOCIATED_TOKEN_PROGRAM_ADDRESS.toString()) {
      throw new Error("invalid_exact_svm_payload_transaction_create_ata_instruction");
    }

    try {
      const parsed = parseCreateAssociatedTokenInstruction(instruction as never);

      if (parsed.accounts.owner.address !== requirements.payTo) {
        throw new Error(
          "invalid_exact_svm_payload_transaction_create_ata_instruction_incorrect_payee",
        );
      }

      if (parsed.accounts.mint.address !== requirements.asset) {
        throw new Error(
          "invalid_exact_svm_payload_transaction_create_ata_instruction_incorrect_asset",
        );
      }
    } catch (error) {
      if (error instanceof Error && error.message.includes("create_ata_instruction")) {
        throw error;
      }
      throw new Error("invalid_exact_svm_payload_transaction_create_ata_instruction");
    }
  }

  /**
   * Verify compute limit instruction
   *
   * @param instruction - The compute limit instruction
   * @param instruction.programAddressIndex - Program address index in static accounts
   * @param instruction.data - Instruction data bytes
   * @param staticAccounts - Static accounts array from transaction
   */
  private verifyComputeLimitInstruction(
    instruction: { programAddressIndex: number; data?: Readonly<Uint8Array> },
    staticAccounts: Address[],
  ): void {
    const programAddress = staticAccounts[instruction.programAddressIndex].toString();

    if (
      programAddress !== COMPUTE_BUDGET_PROGRAM_ADDRESS.toString() ||
      !instruction.data ||
      instruction.data[0] !== 2
    ) {
      throw new Error(
        "invalid_exact_svm_payload_transaction_instructions_compute_limit_instruction",
      );
    }

    try {
      parseSetComputeUnitLimitInstruction(instruction as never);
    } catch {
      throw new Error(
        "invalid_exact_svm_payload_transaction_instructions_compute_limit_instruction",
      );
    }
  }

  /**
   * Verify compute price instruction
   *
   * @param instruction - The compute price instruction
   * @param instruction.programAddressIndex - Program address index in static accounts
   * @param instruction.data - Instruction data bytes
   * @param staticAccounts - Static accounts array from transaction
   */
  private verifyComputePriceInstruction(
    instruction: { programAddressIndex: number; data?: Readonly<Uint8Array> },
    staticAccounts: Address[],
  ): void {
    const programAddress = staticAccounts[instruction.programAddressIndex].toString();

    if (
      programAddress !== COMPUTE_BUDGET_PROGRAM_ADDRESS.toString() ||
      !instruction.data ||
      instruction.data[0] !== 3
    ) {
      throw new Error(
        "invalid_exact_svm_payload_transaction_instructions_compute_price_instruction",
      );
    }

    try {
      const parsedInstruction = parseSetComputeUnitPriceInstruction(instruction as never);

      if (
        (parsedInstruction as unknown as { microLamports: bigint }).microLamports >
        BigInt(MAX_COMPUTE_UNIT_PRICE * 1_000_000)
      ) {
        throw new Error(
          "invalid_exact_svm_payload_transaction_instructions_compute_price_instruction_too_high",
        );
      }
    } catch (error) {
      if (error instanceof Error && error.message.includes("too_high")) {
        throw error;
      }
      throw new Error(
        "invalid_exact_svm_payload_transaction_instructions_compute_price_instruction",
      );
    }
  }
}
