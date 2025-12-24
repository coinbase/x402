import {
  SettleResponse,
  PaymentPayload,
  PaymentRequirements,
  ExactAptosPayload,
} from "../../../../types/verify";
import { X402Config } from "../../../../types/config";
import {
  AptosConnectedClient,
  getAptosNetwork,
  getAptosRpcUrl,
} from "../../../../shared/aptos/wallet";
import { Aptos, AptosConfig } from "@aptos-labs/ts-sdk";
import { deserializeAptosPayment } from "./utils";

/**
 * Settle the payment by submitting the transaction to the Aptos network.
 *
 * This function:
 * 1. Deserializes the BCS-encoded signed transaction
 * 2. Submits the transaction to the Aptos network
 * 3. Waits for transaction confirmation
 * 4. Returns the transaction hash and status
 *
 * Note: Unlike SVM, Aptos settlement does NOT require a signer.
 * The transaction is already fully signed by the client, so we only need
 * a read-only connection to submit it.
 *
 * @param client - The Aptos connected client (read-only)
 * @param payload - The payment payload to settle
 * @param paymentRequirements - The payment requirements
 * @param config - Optional configuration for X402 operations (e.g., custom RPC URLs)
 * @returns A SettleResponse indicating if the payment was settled successfully
 */
export async function settle(
  client: AptosConnectedClient,
  payload: PaymentPayload,
  paymentRequirements: PaymentRequirements,
  config?: X402Config,
): Promise<SettleResponse> {
  try {
    const aptosPayload = payload.payload as ExactAptosPayload;

    const requirements = payload.accepted || paymentRequirements;

    // Map network to Aptos SDK network
    const aptosNetwork = getAptosNetwork(requirements.network);

    // Create Aptos SDK instance
    const rpcUrl = config?.aptosConfig?.rpcUrl || getAptosRpcUrl(aptosNetwork);
    const aptosConfig = new AptosConfig({
      network: aptosNetwork,
      fullnode: rpcUrl,
    });
    const aptos = new Aptos(aptosConfig);

    // Deserialize the transaction and authenticator
    const { transaction, senderAuthenticator } = deserializeAptosPayment(aptosPayload.transaction);

    const senderAddress = transaction.rawTransaction.sender.toStringLong();

    // Submit the transaction to the Aptos network
    console.log("Submitting transaction to Aptos network...");
    const pendingTxn = await aptos.transaction.submit.simple({
      transaction,
      senderAuthenticator,
    });

    console.log("Transaction submitted, hash:", pendingTxn.hash);

    // Wait for the transaction to be committed
    console.log("Waiting for transaction confirmation...");
    const committedTxn = await aptos.waitForTransaction({
      transactionHash: pendingTxn.hash,
    });

    console.log("Transaction confirmed at version:", committedTxn.version);

    return {
      success: true,
      transaction: pendingTxn.hash,
      network: requirements.network,
      payer: senderAddress,
    };
  } catch (error) {
    console.error("Settle error:", error);
    return {
      success: false,
      errorReason: "unexpected_settle_error",
      transaction: "",
      network: requirements.network,
      payer: undefined,
    };
  }
}
