import {
  VerifyResponse,
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
import { Aptos, AptosConfig, AccountAddress, Deserializer, PublicKey } from "@aptos-labs/ts-sdk";
import { deserializeAptosPayment } from "./utils";

/**
 * Verify the payment payload against the payment requirements for Aptos.
 *
 * This function verifies that an Aptos x402 payment transaction is valid by:
 * 1. Deserializing the BCS-encoded transaction
 * 2. Verifying the transaction calls the correct transfer function
 * 3. Validating the payment amount matches requirements
 * 4. Checking the recipient address is correct
 * 5. Simulating the transaction to ensure it will succeed
 *
 * Note: Unlike SVM, Aptos verification does NOT require a signer.
 * The transaction is already fully signed by the client, so we only need
 * a read-only connection to verify and simulate it.
 *
 * @param client - The Aptos connected client (read-only)
 * @param payload - The payment payload to verify
 * @param paymentRequirements - The payment requirements to verify against
 * @param config - Optional configuration for X402 operations (e.g., custom RPC URLs)
 * @returns A VerifyResponse indicating if the payment is valid
 */
export async function verify(
  client: AptosConnectedClient,
  payload: PaymentPayload,
  paymentRequirements: PaymentRequirements,
  config?: X402Config,
): Promise<VerifyResponse> {
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
    const { transaction, senderAuthenticator, entryFunction } = deserializeAptosPayment(
      aptosPayload.transaction,
    );

    // Extract sender address and payload
    const senderAddress = transaction.rawTransaction.sender.toString();

    // Check that it's an entry function payload

    if (!entryFunction) {
      console.log("Missing 'entryFunction' in payload, script and multisig not supported");
      return {
        isValid: false,
        invalidReason: "invalid_payment",
        payer: senderAddress,
      };
    }

    // Extract the entry function details
    // Verify the function is the correct transfer function
    const moduleAddress = entryFunction.module_name.address;
    const moduleName = entryFunction.module_name.name.identifier;
    const functionName = entryFunction.function_name.identifier;

    // Construct the full function identifier: 0x<address>::<module>::<function>
    console.log("Function name:", `0x${moduleAddress}::${moduleName}::${functionName}`);
    if (
      AccountAddress.ONE.equals(moduleAddress) &&
      moduleName === "primary_fungible_store" &&
      functionName === "transfer"
    ) {
      console.log("Invalid function. Expected: 0x1::primary_fungible_store::transfer");
      return {
        isValid: false,
        invalidReason: "invalid_payment",
        payer: senderAddress,
      };
    }

    // Extract and verify arguments
    const typeArgs = entryFunction.type_args;
    console.log("Type arguments count:", typeArgs.length);
    if (typeArgs.length !== 1) {
      console.log("Invalid type arguments length");
      return {
        isValid: false,
        invalidReason: "invalid_payment",
        payer: senderAddress,
      };
    }

    const args = entryFunction.args;
    console.log("Arguments count:", args.length);
    if (args.length !== 3) {
      console.log("Invalid arguments length");
      return {
        isValid: false,
        invalidReason: "invalid_payment",
        payer: senderAddress,
      };
    }
    const [faAddressArg, recipientAddressArg, amountArg] = args;

    const faAddress = AccountAddress.from(faAddressArg.bcsToBytes());
    console.log("FA Address:", faAddress, "Expected:", requirements.asset);
    const asset = AccountAddress.from(requirements.asset);
    if (!faAddress.equals(asset)) {
      console.log("Invalid asset");
      return {
        isValid: false,
        invalidReason: "invalid_payment",
        payer: senderAddress,
      };
    }

    const recipientAddress = AccountAddress.from(recipientAddressArg.bcsToBytes());
    console.log("Recipient:", recipientAddress, "Expected:", requirements.payTo);
    const payTo = AccountAddress.from(requirements.payTo);
    if (!recipientAddress.equals(payTo)) {
      console.log("Invalid recipient");
      return {
        isValid: false,
        invalidReason: "invalid_payment",
        payer: senderAddress,
      };
    }

    // Parse amount from a byte array (little-endian u64)
    const amount = new Deserializer(amountArg.bcsToBytes()).deserializeU64().toString(10);

    console.log("Amount:", amount, "Expected:", requirements.amount);
    if (amount !== requirements.amount) {
      console.log("Invalid amount");
      return {
        isValid: false,
        invalidReason: "invalid_payment",
        payer: senderAddress,
      };
    }
    // TODO: verify the signature directly in addition

    // Simulate the transaction to ensure it will succeed
    console.log("Simulating transaction...");
    try {
      let publicKey: PublicKey | undefined;
      if (senderAuthenticator.isEd25519()) {
        publicKey = senderAuthenticator.public_key;
      } else if (senderAuthenticator.isMultiEd25519()) {
        publicKey = senderAuthenticator.public_key;
      } else if (senderAuthenticator.isSingleKey()) {
        publicKey = senderAuthenticator.public_key;
      } else if (senderAuthenticator.isMultiKey()) {
        publicKey = senderAuthenticator.public_keys;
      }

      const simulationResult = (
        await aptos.transaction.simulate.simple({
          signerPublicKey: publicKey,
          transaction,
        })
      )[0];

      console.log("Simulation result:", simulationResult, "responses");

      // Check if simulation failed
      if (!simulationResult.success) {
        console.log("Simulation failed with vm_status:", simulationResult.vm_status);
        return {
          isValid: false,
          invalidReason: "invalid_payment",
          payer: senderAddress,
        };
      }

      console.log("Simulation succeeded");
    } catch (error) {
      console.error("Simulation error:", error);
      return {
        isValid: false,
        invalidReason: "invalid_payment",
        payer: senderAddress,
      };
    }

    // All checks passed
    return {
      isValid: true,
      payer: senderAddress,
    };
  } catch (error) {
    console.error("Verify error:", error);
    return {
      isValid: false,
      invalidReason: "unexpected_verify_error",
      payer: undefined,
    };
  }
}
