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
import { STELLAR_WILDCARD_CAIP2 } from "../../constants";
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
const DEFAULT_ESTIMATED_LEDGER_SECONDS = 5;

/**
 * Helper to create a `VerifyResponse` with `isValid: false`.
 *
 * @param reason - The error reason code
 * @param payer - Optional payer address
 * @returns a `VerifyResponse` with `isValid: false` and the provided reason and (optional) payer
 */
export function invalidVerifyResponse(reason: string, payer?: string): VerifyResponse {
  return { isValid: false, invalidReason: reason, payer };
}

/**
 * Helper to create a `VerifyResponse` with `isValid: true`.
 *
 * @param payer - The payer address
 * @returns a `VerifyResponse` with `isValid: true` and the provided payer
 */
export function validVerifyResponse(payer: string): VerifyResponse {
  return { isValid: true, payer };
}

/**
 * Stellar facilitator implementation for the Exact payment scheme.
 */
export class ExactStellarScheme implements SchemeNetworkFacilitator {
  readonly scheme = "exact";
  readonly caipFamily = STELLAR_WILDCARD_CAIP2;

  /**
   * Creates a new ExactStellarScheme instance.
   *
   * @param signer - The Stellar signer managed by the facilitator
   * @param rpcConfig - Optional RPC configuration with custom RPC URL
   * @param rpcConfig.url - Custom RPC URL to use instead of defaults
   * @param areFeesSponsored - Indicates if fees are sponsored (default: true)
   * @returns ExactStellarScheme instance
   */
  constructor(
    private readonly signer: FacilitatorStellarSigner,
    private readonly rpcConfig?: { url?: string },
    private readonly areFeesSponsored: boolean = true,
  ) {}

  /**
   * Get mechanism-specific extra data for the supported kinds endpoint.
   * For Stellar, returns `areFeesSponsored` indicating to clients if they can expect fees to be sponsored.
   * As of now, the spec only supports `areFeesSponsored: true`.
   *
   * @param _ - The network identifier (unused, offset is network-agnostic)
   * @returns Extra data with the `areFeesSponsored` flag
   */
  getExtra(_: Network): Record<string, unknown> | undefined {
    return {
      areFeesSponsored: this.areFeesSponsored,
    };
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

      const signerNetwork = (await this.signer.getNetwork()).network;
      if (signerNetwork !== requirements.network || signerNetwork !== payload.accepted.network) {
        return invalidVerifyResponse("network_mismatch");
      }

      const server = getRpcClient(signerNetwork, this.rpcConfig);
      const networkPassphrase = getNetworkPassphrase(signerNetwork);

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

      const facilitatorAddress = this.signer.address;
      if (operation.source === facilitatorAddress || transaction.source === facilitatorAddress) {
        return invalidVerifyResponse("invalid_exact_stellar_payload_unsafe_tx_or_op_source");
      }

      // Step 4: Extract and validate contract invocation details
      const invokeOp = operation as Operation.InvokeHostFunction;
      const func = invokeOp.func;

      if (!func || func.switch().name !== "hostFunctionTypeInvokeContract") {
        console.error(`Invalid contract invocation, type=${func?.switch().name}`);
        return invalidVerifyResponse("invalid_exact_stellar_payload_wrong_operation");
      }

      // Step 5: Validate contract address and function name
      const invokeContractArgs = func.invokeContract();
      const contractAddress = Address.fromScAddress(
        invokeContractArgs.contractAddress(),
      ).toString();
      const functionName = invokeContractArgs.functionName().toString();

      const args = invokeContractArgs.args();
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

      if (fromAddress === facilitatorAddress) {
        return invalidVerifyResponse("invalid_exact_stellar_payload_facilitator_is_payer");
      }

      if (toAddress !== requirements.payTo) {
        return invalidVerifyResponse("invalid_exact_stellar_payload_wrong_recipient", fromAddress);
      }

      const expectedAmount = BigInt(requirements.amount);
      if (amount !== expectedAmount) {
        return invalidVerifyResponse("invalid_exact_stellar_payload_wrong_amount", fromAddress);
      }

      // Step 7: Re-simulate to ensure transaction will succeed
      const simResponse = await server.simulateTransaction(transaction);
      if (!Api.isSimulationSuccess(simResponse)) {
        const errorMsg = simResponse.error ? `: ${simResponse.error}` : "";
        console.error("Simulation error" + errorMsg);
        return invalidVerifyResponse(
          "invalid_exact_stellar_payload_simulation_failed",
          fromAddress,
        );
      }

      // Step 8: Validate simulation events for expected transfer only.
      const eventValidation = this.validateSimulationEvents(
        simResponse.events,
        fromAddress,
        requirements.payTo,
        expectedAmount,
      );
      if (eventValidation) {
        console.error("Event validation failed:", eventValidation.invalidReason);
        return eventValidation;
      }

      const latestLedger = await server.getLatestLedger();
      const currentLedger = latestLedger.sequence;
      const maxTimeoutSeconds = requirements.maxTimeoutSeconds ?? DEFAULT_TIMEOUT_SECONDS;
      const maxLedgerOffset = Math.ceil(maxTimeoutSeconds / DEFAULT_ESTIMATED_LEDGER_SECONDS);
      const maxLedger = currentLedger + maxLedgerOffset;

      // Step 9: Validate auth entries (structure, credential type, expiration, facilitator safety, and signature status).
      const authValidation = this.validateAuthEntries(
        invokeOp,
        facilitatorAddress,
        fromAddress,
        maxLedger,
        transaction,
        simResponse,
      );
      if (authValidation) {
        console.error("Auth entry validation failed:", authValidation.invalidReason);
        return authValidation;
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
        .addOperation(Operation.invokeHostFunction(invokeOp))
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

  /**
   * Validates simulation events for transfer correctness.
   * Ensures there is exactly one token transfer event, the transfer matches the
   * expected sender, recipient, and amount, and the facilitator address is not
   * involved in the transfer.
   *
   * @param events - The array of DiagnosticEvent objects from the simulation
   * @param fromAddress - The payer's address
   * @param toAddress - The recipient's address
   * @param expectedAmount - The expected transfer amount
   * @returns undefined if the validation succeeds, otherwise an invalid VerifyResponse
   */
  private validateSimulationEvents(
    events: xdr.DiagnosticEvent[],
    fromAddress: string,
    toAddress: string,
    expectedAmount: bigint,
  ): VerifyResponse | undefined {
    // Soroban token transfer events follow the [CAP-46](https://github.com/stellar/stellar-protocol/blob/master/core/cap-0046-06.md) format:
    // Topic: ["transfer", from, to], Data: amount
    const transferEvents: Array<{
      from: string;
      to: string;
      amount: bigint;
    }> = [];

    // Parse events into
    for (const diagnosticEvent of events) {
      try {
        const event = diagnosticEvent.event();

        // Skip non-contract events
        if (event.type().name !== "contract") {
          continue;
        }

        const body = event.body().v0();
        const topics = body.topics();

        // Check if this is a transfer event (first topic is "transfer" symbol)
        if (topics.length < 3) {
          console.error("Contract event missing transfer topics");
          return invalidVerifyResponse(
            "invalid_exact_stellar_payload_event_not_transfer",
            fromAddress,
          );
        }

        const topicType = topics[0].switch().name;
        if (topicType !== "scvSymbol") {
          console.error(`Contract event has non-symbol topic type: ${topicType}`);
          return invalidVerifyResponse(
            "invalid_exact_stellar_payload_event_not_transfer",
            fromAddress,
          );
        }

        const symbol = topics[0].sym().toString();
        if (symbol !== "transfer") {
          console.error(`Contract event has non-transfer symbol: ${symbol}`);
          return invalidVerifyResponse(
            "invalid_exact_stellar_payload_event_not_transfer",
            fromAddress,
          );
        }

        // Extract from, to, and amount
        const from = scValToNative(topics[1]) as string;
        const to = scValToNative(topics[2]) as string;
        const amount = scValToNative(body.data()) as bigint;

        transferEvents.push({ from, to, amount });
      } catch (error: unknown) {
        if (error instanceof Error) {
          console.error("Error parsing diagnostic event:", error.message);
        } else {
          console.error("Error parsing diagnostic event:", String(error));
        }
        return invalidVerifyResponse("unexpected_verify_error", fromAddress);
      }
    }

    // If no transfer events are present, reject.
    if (transferEvents.length === 0) {
      return invalidVerifyResponse("invalid_exact_stellar_payload_no_transfer_events", fromAddress);
    }

    if (transferEvents.length > 1) {
      return invalidVerifyResponse("invalid_exact_stellar_payload_multiple_transfers", fromAddress);
    }

    const transferEvent = transferEvents[0];

    // Validate the transfer matches the expected sender, recipient, and amount
    if (transferEvent.from !== fromAddress) {
      return invalidVerifyResponse("invalid_exact_stellar_payload_event_wrong_from", fromAddress);
    }
    if (transferEvent.to !== toAddress) {
      return invalidVerifyResponse("invalid_exact_stellar_payload_event_wrong_to", fromAddress);
    }
    if (transferEvent.amount !== expectedAmount) {
      return invalidVerifyResponse("invalid_exact_stellar_payload_event_wrong_amount", fromAddress);
    }

    return undefined;
  }

  /**
   * Validates authorization entries: structure, credential type, expiration,
   * facilitator safety, no sub-invocations, and that the payer has signed and
   * no other signatures are pending (per simulation).
   *
   * @param invokeOp - The invoke host function operation
   * @param facilitatorAddress - The facilitator's address
   * @param fromAddress - The payer's address (for error reporting)
   * @param maxLedger - The maximum allowed expiration ledger
   * @param transaction - The full transaction (for signature status)
   * @param simResponse - The simulation result (used to interpret auth entry signatures)
   * @returns Invalid VerifyResponse when validation fails
   */
  private validateAuthEntries(
    invokeOp: Operation.InvokeHostFunction,
    facilitatorAddress: string,
    fromAddress: string,
    maxLedger: number,
    transaction: Transaction,
    simResponse: Api.SimulateTransactionSuccessResponse,
  ): VerifyResponse | undefined {
    if (!invokeOp.auth || invokeOp.auth.length === 0) {
      return invalidVerifyResponse("invalid_exact_stellar_payload_no_auth_entries", fromAddress);
    }

    for (const auth of invokeOp.auth) {
      const credentialsType = auth.credentials().switch();

      // Only address-based credentials are allowed
      if (credentialsType !== xdr.SorobanCredentialsType.sorobanCredentialsAddress()) {
        console.error(`Invalid credential type: ${credentialsType.name}`);
        return invalidVerifyResponse(
          "invalid_exact_stellar_payload_unsupported_credential_type",
          fromAddress,
        );
      }

      // Extract address from credentials
      const addressCredentials = auth.credentials().address();
      const authAddress = Address.fromScAddress(addressCredentials.address()).toString();

      // Facilitator must not appear in auth entries
      if (authAddress === facilitatorAddress) {
        console.error("Facilitator address found in auth entry");
        return invalidVerifyResponse(
          "invalid_exact_stellar_payload_facilitator_in_auth",
          fromAddress,
        );
      }

      // Check signature expiration is within allowed window
      const expirationLedger = addressCredentials.signatureExpirationLedger();
      if (expirationLedger > maxLedger) {
        console.error(`Expiration ledger ${expirationLedger} exceeds max ${maxLedger}`);
        return invalidVerifyResponse(
          "invalid_exact_stellar_signature_expiration_too_far",
          fromAddress,
        );
      }

      // No sub-invocations allowed
      const rootInvocation = auth.rootInvocation();
      if (rootInvocation.subInvocations().length > 0) {
        console.error(`Auth entry has ${rootInvocation.subInvocations().length} sub-invocations`);
        return invalidVerifyResponse(
          "invalid_exact_stellar_payload_has_subinvocations",
          fromAddress,
        );
      }
    }

    const authStatus = gatherAuthEntrySignatureStatus({
      transaction,
      simulationResponse: simResponse,
    });
    if (!authStatus.alreadySigned.includes(fromAddress)) {
      return invalidVerifyResponse(
        "invalid_exact_stellar_payload_missing_payer_signature",
        fromAddress,
      );
    }
    if (authStatus.pendingSignature.length > 0) {
      console.error("Unexpected pending signatures:", authStatus.pendingSignature);
      return invalidVerifyResponse(
        "invalid_exact_stellar_payload_unexpected_pending_signatures",
        fromAddress,
      );
    }

    return undefined;
  }
}
