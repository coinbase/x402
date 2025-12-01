import {
  COMPUTE_BUDGET_PROGRAM_ADDRESS,
  parseSetComputeUnitLimitInstruction,
  parseSetComputeUnitPriceInstruction,
} from "@solana-program/compute-budget";
import {
  parseTransferCheckedInstruction as parseTransferCheckedInstructionToken,
  TOKEN_PROGRAM_ADDRESS,
} from "@solana-program/token";
import {
  findAssociatedTokenPda,
  parseTransferCheckedInstruction as parseTransferCheckedInstruction2022,
  TOKEN_2022_PROGRAM_ADDRESS,
} from "@solana-program/token-2022";
import {
  decompileTransactionMessage,
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
import { MAX_COMPUTE_UNIT_PRICE } from "../../../constants";
import type { FacilitatorSvmSigner } from "../../../signer";
import { createRpcCapabilitiesFromRpc } from "../../../signer";
import type { ExactSvmPayloadV1 } from "../../../types";
import { decodeTransactionFromPayload, getTokenPayerFromTransaction } from "../../../utils";

/**
 * SVM facilitator implementation for the Exact payment scheme (V1).
 */
export class ExactSvmSchemeV1 implements SchemeNetworkFacilitator {
  readonly scheme = "exact";
  readonly caipFamily = "solana:*";

  /**
   * Creates a new ExactSvmFacilitatorV1 instance.
   *
   * @param signer - The SVM RPC client for facilitator operations
   * @returns ExactSvmFacilitatorV1 instance
   */
  constructor(private readonly signer: FacilitatorSvmSigner) {}

  /**
   * Get mechanism-specific extra data for the supported kinds endpoint.
   * For SVM, this includes the fee payer address.
   *
   * @param _ - The network identifier (unused for SVM)
   * @returns Extra data with feePayer address
   */
  getExtra(_: string): Record<string, unknown> | undefined {
    return {
      feePayer: this.signer.address,
    };
  }

  /**
   * Get signer addresses used by this facilitator.
   * For SVM, returns the fee payer address.
   *
   * @returns Array containing the fee payer address
   */
  getSigners(): string[] {
    return [this.signer.address];
  }

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
    const decompiled = decompileTransactionMessage(compiled);
    const instructions = decompiled.instructions ?? [];

    // 3 instructions: ComputeLimit + ComputePrice + TransferChecked
    if (instructions.length !== 3) {
      return {
        isValid: false,
        invalidReason: "invalid_exact_svm_payload_transaction_instructions_length",
        payer: "",
      };
    }

    // Step 3: Verify Compute Budget Instructions
    try {
      this.verifyComputeLimitInstruction(instructions[0] as never);
      this.verifyComputePriceInstruction(instructions[1] as never);
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

    // Step 4: Verify Transfer Instruction
    const transferIx = instructions[2];
    const programAddress = transferIx.programAddress.toString();

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

    // Parse the transfer instruction using the appropriate library helper
    let parsedTransfer;
    try {
      if (programAddress === TOKEN_PROGRAM_ADDRESS.toString()) {
        parsedTransfer = parseTransferCheckedInstructionToken(transferIx as never);
      } else {
        parsedTransfer = parseTransferCheckedInstruction2022(transferIx as never);
      }
    } catch {
      return {
        isValid: false,
        invalidReason: "invalid_exact_svm_payload_no_transfer_instruction",
        payer,
      };
    }

    // Verify that the fee payer is not transferring their own funds
    // SECURITY: Prevent facilitator from signing away their own tokens
    const authorityAddress = parsedTransfer.accounts.authority.address.toString();
    if (authorityAddress === requirementsV1.extra.feePayer) {
      return {
        isValid: false,
        invalidReason: "invalid_exact_svm_payload_transaction_fee_payer_transferring_funds",
        payer,
      };
    }

    // Verify mint address matches requirements
    const mintAddress = parsedTransfer.accounts.mint.address.toString();
    if (mintAddress !== requirements.asset) {
      return {
        isValid: false,
        invalidReason: "invalid_exact_svm_payload_mint_mismatch",
        payer,
      };
    }

    // Verify destination ATA matches expected ATA for payTo address
    const destATA = parsedTransfer.accounts.destination.address.toString();
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

    // Verify transfer amount meets requirements
    const amount = parsedTransfer.data.amount;
    if (amount < BigInt(requirementsV1.maxAmountRequired)) {
      return {
        isValid: false,
        invalidReason: "invalid_exact_svm_payload_amount_insufficient",
        payer,
      };
    }

    // Step 5: Sign and Simulate Transaction
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
   * Verify compute limit instruction
   *
   * @param instruction - The compute limit instruction
   * @param instruction.programAddress - Program address
   * @param instruction.data - Instruction data bytes
   */
  private verifyComputeLimitInstruction(instruction: {
    programAddress: Address;
    data?: Readonly<Uint8Array>;
  }): void {
    const programAddress = instruction.programAddress.toString();

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
   * @param instruction.programAddress - Program address
   * @param instruction.data - Instruction data bytes
   */
  private verifyComputePriceInstruction(instruction: {
    programAddress: Address;
    data?: Readonly<Uint8Array>;
  }): void {
    const programAddress = instruction.programAddress.toString();

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
