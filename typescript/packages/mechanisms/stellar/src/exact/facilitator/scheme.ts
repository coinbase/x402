import {
  scValToNative,
  Transaction,
  Address,
  Operation,
  xdr,
  rpc,
  TransactionBuilder,
} from "@stellar/stellar-sdk";
import { Api } from "@stellar/stellar-sdk/rpc";
import { gatherAuthEntrySignatureStatus } from "../../shared";
import { ExactStellarPayloadV2 } from "../../types";
import { getRpcClient, getNetworkPassphrase } from "../../utils";
import type { FacilitatorStellarSigner } from "../../signer";
import type {
  Network,
  PaymentPayload,
  PaymentRequirements,
  SchemeNetworkFacilitator,
  SettleResponse,
  VerifyResponse,
} from "@x402/core/types";

const DEFAULT_TIMEOUT_SECONDS = 60;
const SUPPORTED_X402_VERSION = 2;
const DEFAULT_MAX_LEDGER_OFFSET = 12;

/**
 * Creates an invalid verification response
 *
 * @param reason - The error reason code
 * @param payer - Optional payer address
 * @returns Invalid verification response
 */
export function invalidVerifyResponse(reason: string, payer?: string): VerifyResponse {
  return { isValid: false, invalidReason: reason, payer };
}

/**
 * Creates a valid verification response
 *
 * @param payer - The payer address
 * @returns Valid verification response
 */
export function validVerifyResponse(payer: string): VerifyResponse {
  return { isValid: true, payer };
}

/**
 * Stellar facilitator implementation for the Exact payment scheme.
 */
export class ExactStellarScheme implements SchemeNetworkFacilitator {
  readonly scheme = "exact";
  readonly caipFamily = "stellar:*";

  /**
   * Creates a new ExactStellarScheme instance.
   *
   * @param signer - The Stellar signer for facilitator operations
   * @param rpcConfig - Optional RPC configuration with custom RPC URL
   * @param rpcConfig.url - Custom RPC URL to use instead of defaults
   * @param maxLedgerOffset - Max number of ledgers a signature is allowed to have in order to be submitted by the server (default: 12)
   * @returns ExactStellarScheme instance
   */
  constructor(
    private readonly signer: FacilitatorStellarSigner,
    private readonly rpcConfig?: { url?: string },
    private readonly maxLedgerOffset: number = DEFAULT_MAX_LEDGER_OFFSET,
  ) {}

  /**
   * Get mechanism-specific extra data for the supported kinds endpoint.
   * For Stellar, returns maxLedgerOffset which clients use to calculate transaction expiration.
   *
   * @param _ - The network identifier (unused, offset is network-agnostic)
   * @returns Extra data with maxLedgerOffset
   */
  getExtra(_: Network): Record<string, unknown> | undefined {
    return { maxLedgerOffset: this.maxLedgerOffset };
  }

  /**
   * Get signer addresses used by this facilitator.
   * For Stellar, returns the facilitator's address.
   *
   * @param _ - The network identifier (unused for Stellar)
   * @returns Array containing the facilitator's address
   */
  getSigners(_: string): string[] {
    return [this.signer.address];
  }

  /**
   * Verifies a payment payload.
   *
   * @param payload - The payment payload to verify
   * @param requirements - The payment requirements
   * @returns Promise resolving to verification response
   */
  async verify(
    payload: PaymentPayload,
    requirements: PaymentRequirements,
  ): Promise<VerifyResponse> {
    try {
      // Step 1: Validate protocol version, scheme, and network
      if (payload.x402Version !== SUPPORTED_X402_VERSION) {
        return invalidVerifyResponse("invalid_x402_version");
      }

      if (payload.accepted.scheme !== "exact" || requirements.scheme !== "exact") {
        return invalidVerifyResponse("unsupported_scheme");
      }

      if (payload.accepted.network !== requirements.network) {
        return invalidVerifyResponse("network_mismatch");
      }

      const server = getRpcClient(requirements.network, this.rpcConfig);
      const networkPassphrase = getNetworkPassphrase(requirements.network);

      // Step 2: Parse and decode transaction
      const stellarPayload = payload.payload as ExactStellarPayloadV2;
      if (!stellarPayload || typeof stellarPayload.transaction !== "string") {
        return invalidVerifyResponse("invalid_exact_stellar_payload_malformed");
      }

      let transaction: Transaction;
      try {
        transaction = new Transaction(stellarPayload.transaction, networkPassphrase);
      } catch (error) {
        console.error("Error parsing transaction:", error);
        return invalidVerifyResponse("invalid_exact_stellar_payload_malformed");
      }

      // Step 3: Validate transaction structure
      if (transaction.operations.length !== 1) {
        console.error("Invalid transaction operations length:", transaction.operations.length);
        return invalidVerifyResponse("invalid_exact_stellar_payload_wrong_operation");
      }

      const operation = transaction.operations[0];
      if (operation.type !== "invokeHostFunction") {
        console.error("Invalid transaction operation type:", operation.type);
        return invalidVerifyResponse("invalid_exact_stellar_payload_wrong_operation");
      }

      // Step 4: Extract and validate contract invocation details
      const invokeOp = operation as Operation.InvokeHostFunction;
      const func = invokeOp.func;

      if (!func || func.switch().name !== "hostFunctionTypeInvokeContract") {
        console.error(`Invalid contract invocation, type=${func?.switch().name}`);
        return invalidVerifyResponse("invalid_exact_stellar_payload_wrong_operation");
      }

      const invokeContractArgs = func.invokeContract();
      const contractAddress = Address.fromScAddress(
        invokeContractArgs.contractAddress(),
      ).toString();
      const functionName = invokeContractArgs.functionName().toString();
      const args = invokeContractArgs.args();

      // Step 5: Validate contract address and function name
      if (contractAddress !== requirements.asset) {
        return invalidVerifyResponse("invalid_exact_stellar_payload_wrong_asset");
      }

      if (functionName !== "transfer" || args.length !== 3) {
        return invalidVerifyResponse("invalid_exact_stellar_payload_wrong_function_name");
      }

      // Step 6: Extract and validate transfer arguments
      const fromAddress = scValToNative(args[0]) as string;
      const toAddress = scValToNative(args[1]) as string;
      const amount = scValToNative(args[2]) as bigint;

      if (toAddress !== requirements.payTo) {
        return invalidVerifyResponse("invalid_exact_stellar_payload_wrong_recipient", fromAddress);
      }

      const requiredAmount = BigInt(requirements.amount);
      if (amount !== requiredAmount) {
        return invalidVerifyResponse("invalid_exact_stellar_payload_wrong_amount", fromAddress);
      }

      // Step 7: Re-simulate to ensure transaction will succeed
      const simulateResponse = await server.simulateTransaction(transaction);
      if (Api.isSimulationError(simulateResponse)) {
        const errorMsg = simulateResponse.error ? `: ${simulateResponse.error}` : "";
        console.error("Simulation error" + errorMsg);
        return invalidVerifyResponse(
          "invalid_exact_stellar_payload_simulation_failed",
          fromAddress,
        );
      }

      // Step 8: Audit signers to ensure transaction is properly signed
      const authStatus = gatherAuthEntrySignatureStatus({
        transaction,
        simulationResponse: simulateResponse,
      });

      const facilitatorAddress = this.signer.address;

      // Ensure the operation is not trying anything funny with the facilitator account
      if (operation.source === facilitatorAddress || transaction.source === facilitatorAddress) {
        return invalidVerifyResponse(
          "invalid_exact_stellar_payload_unsafe_tx_or_op_source",
          fromAddress,
        );
      }

      // Ensure the payer has already signed
      if (!authStatus.alreadySigned.includes(fromAddress)) {
        return invalidVerifyResponse(
          "invalid_exact_stellar_payload_missing_payer_signature",
          fromAddress,
        );
      }

      // Ensure no other signatures are pending
      if (authStatus.pendingSignature.length > 0) {
        console.error("Unexpected pending signatures:", authStatus.pendingSignature);
        return invalidVerifyResponse(
          "invalid_exact_stellar_payload_unexpected_pending_signatures",
          fromAddress,
        );
      }

      // Step 9: Check auth entry expiration ledgers (same logic as settle)
      const latestLedger = await server.getLatestLedger();
      const currentLedger = latestLedger.sequence;
      const maxLedger = currentLedger + this.maxLedgerOffset;

      // Check expiration ledgers for address-based auth entries (exact same logic as settle)
      for (const auth of invokeOp?.auth ?? []) {
        const expirationLedger = auth.credentials()?.address()?.signatureExpirationLedger();
        if (expirationLedger && expirationLedger > maxLedger) {
          console.error(
            `Expiration ledger ${expirationLedger} is too far, maxLedger is ${maxLedger}`,
          );
          return invalidVerifyResponse(
            "invalid_exact_stellar_signature_expiration_too_far",
            fromAddress,
          );
        }
      }

      return validVerifyResponse(fromAddress);
    } catch (error) {
      console.error("Unexpected verification error:", error);
      return invalidVerifyResponse("unexpected_verify_error");
    }
  }

  /**
   * Settles a payment by submitting the transaction on-chain.
   *
   * @param payload - The payment payload to settle
   * @param requirements - The payment requirements
   * @returns Promise resolving to settlement response
   */
  async settle(
    payload: PaymentPayload,
    requirements: PaymentRequirements,
  ): Promise<SettleResponse> {
    const server = getRpcClient(requirements.network, this.rpcConfig);
    const networkPassphrase = getNetworkPassphrase(requirements.network);
    let payer: string | undefined;
    let txHash: string | undefined;

    try {
      // Step 1: Verify payment before settlement
      const verifyResult = await this.verify(payload, requirements);

      if (!verifyResult.isValid) {
        return {
          success: false,
          network: payload.accepted.network,
          transaction: "",
          errorReason: verifyResult.invalidReason ?? "verification_failed",
          payer: verifyResult.payer,
        };
      }

      payer = verifyResult.payer!;

      // Step 2: Parse transaction envelope once to extract both transaction and Soroban data
      const stellarPayload = payload.payload as ExactStellarPayloadV2;
      const txEnvelope = xdr.TransactionEnvelope.fromXDR(stellarPayload.transaction, "base64");
      const transaction = new Transaction(stellarPayload.transaction, networkPassphrase);
      const sorobanData = txEnvelope.v1()?.tx()?.ext()?.sorobanData() || undefined;

      // Validate Soroban data is present for Soroban transactions
      if (!sorobanData) {
        console.error("Missing Soroban data in transaction");
        return {
          success: false,
          network: payload.accepted.network,
          transaction: "",
          errorReason: "invalid_exact_stellar_payload_malformed",
          payer,
        };
      }

      // Step 3: Extract operation
      const invokeOp = transaction.operations[0] as Operation.InvokeHostFunction;

      // Step 4: Rebuild transaction with facilitator as source
      const facilitatorAddress = this.signer.address;
      const facilitatorAccount = await server.getAccount(facilitatorAddress);

      const rebuiltTx = new TransactionBuilder(facilitatorAccount, {
        fee: transaction.fee,
        networkPassphrase,
        ledgerbounds: transaction.ledgerBounds,
        memo: transaction.memo,
        minAccountSequence: transaction.minAccountSequence,
        minAccountSequenceAge: transaction.minAccountSequenceAge,
        minAccountSequenceLedgerGap: transaction.minAccountSequenceLedgerGap,
        extraSigners: transaction.extraSigners,
        sorobanData,
      })
        .setTimeout(requirements.maxTimeoutSeconds ?? DEFAULT_TIMEOUT_SECONDS)
        .addOperation(
          Operation.invokeHostFunction({
            func: invokeOp.func,
            auth: invokeOp.auth || [],
            source: invokeOp.source,
          }),
        )
        .build();

      // Step 5: Sign transaction with facilitator's key
      const { signedTxXdr, error: signError } = await this.signer.signTransaction(
        rebuiltTx.toXDR(),
        {
          networkPassphrase,
        },
      );

      if (signError) {
        console.error("Error signing transaction:", signError);
        return {
          success: false,
          network: payload.accepted.network,
          transaction: "",
          errorReason: "settle_exact_stellar_transaction_signing_failed",
          payer,
        };
      }

      const signedTx = TransactionBuilder.fromXDR(signedTxXdr, networkPassphrase) as Transaction;

      // Step 6: Submit transaction to network
      const sendResult = await server.sendTransaction(signedTx);

      if (sendResult.status !== "PENDING") {
        console.error("Transaction submission failed with unexpected status:", sendResult.status);
        return {
          success: false,
          network: payload.accepted.network,
          transaction: "",
          errorReason: "settle_exact_stellar_transaction_submission_failed",
          payer,
        };
      }

      // Step 7: Poll for transaction confirmation
      txHash = sendResult.hash;
      const maxPollAttempts = requirements.maxTimeoutSeconds ?? DEFAULT_TIMEOUT_SECONDS;
      const confirmResult = await this.pollForTransaction(server, txHash, maxPollAttempts);

      if (!confirmResult.success) {
        console.error(`Transaction ${txHash} failed or timed out`);
        return {
          success: false,
          network: payload.accepted.network,
          transaction: txHash,
          errorReason: "settle_exact_stellar_transaction_failed",
          payer,
        };
      }

      // Step 8: Return success
      return {
        success: true,
        transaction: txHash,
        network: payload.accepted.network,
        payer: payer,
      };
    } catch (error) {
      console.error("Unexpected settlement error:", error);
      return {
        success: false,
        network: payload.accepted.network,
        transaction: txHash || "",
        errorReason: "unexpected_settle_error",
        payer,
      };
    }
  }

  /**
   * Polls for transaction confirmation on Soroban.
   *
   * @param server - Soroban RPC server
   * @param txHash - Transaction hash to poll for
   * @param maxPollAttempts - Maximum number of polling attempts (default: 15)
   * @param delayMs - Delay between attempts in milliseconds (default: 1000)
   * @returns Result with success status
   */
  private async pollForTransaction(
    server: rpc.Server,
    txHash: string,
    maxPollAttempts = 15,
    delayMs = 1000,
  ): Promise<{ success: boolean }> {
    for (let i = 0; i < maxPollAttempts; i++) {
      try {
        const txResult = await server.getTransaction(txHash);

        if (txResult.status === "SUCCESS") {
          return { success: true };
        } else if (txResult.status === "FAILED") {
          return { success: false };
        }

        // Transaction still pending, wait and retry
        await new Promise(resolve => setTimeout(resolve, delayMs));
      } catch (error: unknown) {
        if (error instanceof Error && !error.message.includes("NOT_FOUND")) {
          console.warn(`Poll attempt ${i} failed:`, error);
        }
        await new Promise(resolve => setTimeout(resolve, delayMs));
      }
    }

    // Timeout
    return { success: false };
  }
}
