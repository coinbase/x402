import { encodePayment } from "../../utils";
import { AptosAddressRegex, PaymentPayload, PaymentRequirements } from "../../../types/verify";
import { X402Config } from "../../../types/config";
import { AptosSigner, getAptosNetwork, getAptosRpcUrl } from "../../../shared/aptos/wallet";
import { Aptos, AptosConfig } from "@aptos-labs/ts-sdk";

/**
 * Creates and encodes a payment header for the given client and payment requirements.
 *
 * @param client - The Aptos account instance used to create the payment header
 * @param x402Version - The version of the X402 protocol to use
 * @param paymentRequirements - The payment requirements containing scheme and network information
 * @param config - Optional configuration for X402 operations (e.g., custom RPC URLs)
 * @returns A promise that resolves to a base64 encoded payment header string
 */
export async function createPaymentHeader(
  client: AptosSigner,
  x402Version: number,
  paymentRequirements: PaymentRequirements,
  config?: X402Config,
): Promise<string> {
  const paymentPayload = await createAndSignPayment(
    client,
    x402Version,
    paymentRequirements,
    config,
  );
  return encodePayment(paymentPayload);
}

/**
 * Creates and signs a payment for the given client and payment requirements.
 *
 * NOTE: Currently uses the standard Aptos coin transfer function (0x1::primary_fungible_store::transfer)
 * for simplicity. In the future, this will be updated to use a custom x402 payment contract
 * that emits events with invoice_id for better payment tracking.
 *
 * @param client - The Aptos account instance used to create and sign the payment tx
 * @param x402Version - The version of the X402 protocol to use
 * @param paymentRequirements - The payment requirements
 * @param config - Optional configuration for X402 operations (e.g., custom RPC URLs)
 * @returns A promise that resolves to a payment payload containing a base64 encoded Aptos transfer tx
 */
export async function createAndSignPayment(
  client: AptosSigner,
  x402Version: number,
  paymentRequirements: PaymentRequirements,
  config?: X402Config,
): Promise<PaymentPayload> {
  // Map x402 network to Aptos SDK network
  const aptosNetwork = getAptosNetwork(paymentRequirements.network);

  // Create Aptos config with custom RPC URL if provided
  const rpcUrl = config?.aptosConfig?.rpcUrl || getAptosRpcUrl(aptosNetwork);
  const aptosConfig = new AptosConfig({
    network: aptosNetwork,
    fullnode: rpcUrl,
  });
  const aptos = new Aptos(aptosConfig);

  // Verify inputs
  if (!client.accountAddress) {
    throw new Error("Aptos account address is required");
  }
  if (!paymentRequirements.asset) {
    throw new Error("Asset is required");
  }
  if (!paymentRequirements.asset.match(AptosAddressRegex)) {
    throw new Error("Invalid asset address");
  }
  if (!paymentRequirements.payTo) {
    throw new Error("Pay-to address is required");
  }
  if (!paymentRequirements.payTo.match(AptosAddressRegex)) {
    throw new Error("Invalid pay-to address");
  }

  if (!paymentRequirements.amount) {
    throw new Error("Amount is required");
  }
  if (!paymentRequirements.amount.match(/^[0-9]+$/)) {
    throw new Error("Amount must be a number");
  }

  // Check for sponsored transaction (gas station protocol)
  const gasStation = paymentRequirements.extra?.gasStation as string | undefined;

  // TODO: Implement gas station protocol for sponsored transactions
  // 1. Build partial transaction without gas
  // 2. Send to gas station endpoint
  // 3. Receive fully-formed transaction with gas information
  // 4. Sign and return
  if (gasStation) {
    throw new Error(
      "Sponsored transactions via gas station are not yet implemented for Aptos. " +
        "Please remove gasStation from paymentRequirements.extra or implement the gas station protocol.",
    );
  }

  // Build a simple transfer transaction using the standard Aptos coin transfer function
  // For now, we use the regular transfer instead of a custom x402 contract
  // The asset should be the metadata address (e.g., "0x0000000000000000000000000000000a" for APT)
  const transaction = await aptos.transaction.build.simple({
    sender: client.accountAddress,
    data: {
      function: "0x1::primary_fungible_store::transfer",
      typeArguments: ["0x1::fungible_asset::Metadata"],
      functionArguments: [
        paymentRequirements.asset, // Asset address to transfer
        paymentRequirements.payTo, // recipient address
        paymentRequirements.amount, // amount to transfer in subunits (e.g. 100000000 == 1 APT)
      ],
    },
  });

  // Sign the transaction with authenticator (this returns AccountAuthenticator)
  const senderAuthenticator = client.signTransactionWithAuthenticator(transaction);

  // Serialize the full SimpleTransaction (not just the raw transaction)
  const transactionBytes = transaction.bcsToBytes();

  // Serialize the authenticator bytes
  const authenticatorBytes = senderAuthenticator.bcsToBytes();

  // Create the payload with separate fields
  const aptosPayload = {
    transaction: Array.from(transactionBytes),
    senderAuthenticator: Array.from(authenticatorBytes),
  };

  // Encode as Base64
  const base64Transaction = Buffer.from(JSON.stringify(aptosPayload)).toString("base64");

  return {
    x402Version,
    payload: {
      transaction: base64Transaction,
    },
  };
}
