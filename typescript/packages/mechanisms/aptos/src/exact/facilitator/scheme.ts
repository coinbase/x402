import { AccountAddress, Deserializer, PublicKey } from "@aptos-labs/ts-sdk";
import type {
  PaymentPayload,
  PaymentRequirements,
  SchemeNetworkFacilitator,
  SettleResponse,
  VerifyResponse,
} from "@x402/core/types";
import type { FacilitatorAptosSigner } from "../../signer";
import type { ExactAptosPayload } from "../../types";
import { createAptosClient, deserializeAptosPayment } from "../../utils";

/**
 * Aptos facilitator implementation for the Exact payment scheme.
 */
export class ExactAptosScheme implements SchemeNetworkFacilitator {
  readonly scheme = "exact";
  readonly caipFamily = "aptos:*";

  /**
   * Creates a new ExactAptosFacilitator instance.
   *
   * @param signer - The Aptos facilitator signer for sponsored transactions
   */
  constructor(private readonly signer: FacilitatorAptosSigner) {}

  /**
   * Get mechanism-specific extra data for the supported kinds endpoint.
   * For Aptos, this indicates sponsorship is available.
   *
   * @param _ - The network identifier (unused)
   * @returns Extra data with sponsored flag
   */
  getExtra(_: string): Record<string, unknown> | undefined {
    return {
      sponsored: true,
    };
  }

  /**
   * Get signer addresses used by this facilitator.
   *
   * @param _ - The network identifier (unused)
   * @returns Array containing the fee payer address
   */
  getSigners(_: string): string[] {
    return [this.signer.getAddress()];
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
      const aptosPayload = payload.payload as ExactAptosPayload;

      // Step 1: Validate Payment Requirements
      if (payload.accepted.scheme !== "exact" || requirements.scheme !== "exact") {
        return {
          isValid: false,
          invalidReason: "unsupported_scheme",
          payer: "",
        };
      }

      if (payload.accepted.network !== requirements.network) {
        return {
          isValid: false,
          invalidReason: "network_mismatch",
          payer: "",
        };
      }

      // Step 2: Deserialize and validate transaction
      const { transaction, senderAuthenticator, entryFunction } = deserializeAptosPayment(
        aptosPayload.transaction,
      );

      const senderAddress = transaction.rawTransaction.sender.toString();

      // Check that it's an entry function payload
      if (!entryFunction) {
        return {
          isValid: false,
          invalidReason: "invalid_payment_missing_entry_function",
          payer: senderAddress,
        };
      }

      // Step 3: Verify the function is the correct transfer function
      const moduleAddress = entryFunction.module_name.address;
      const moduleName = entryFunction.module_name.name.identifier;
      const functionName = entryFunction.function_name.identifier;

      if (
        !AccountAddress.ONE.equals(moduleAddress) ||
        moduleName !== "primary_fungible_store" ||
        functionName !== "transfer"
      ) {
        return {
          isValid: false,
          invalidReason: "invalid_payment_wrong_function",
          payer: senderAddress,
        };
      }

      // Step 4: Verify type arguments
      const typeArgs = entryFunction.type_args;
      if (typeArgs.length !== 1) {
        return {
          isValid: false,
          invalidReason: "invalid_payment_wrong_type_args",
          payer: senderAddress,
        };
      }

      // Step 5: Verify function arguments
      const args = entryFunction.args;
      if (args.length !== 3) {
        return {
          isValid: false,
          invalidReason: "invalid_payment_wrong_args",
          payer: senderAddress,
        };
      }

      const [faAddressArg, recipientAddressArg, amountArg] = args;

      // Verify asset address
      const faAddress = AccountAddress.from(faAddressArg.bcsToBytes());
      const expectedAsset = AccountAddress.from(requirements.asset);
      if (!faAddress.equals(expectedAsset)) {
        return {
          isValid: false,
          invalidReason: "invalid_payment_asset_mismatch",
          payer: senderAddress,
        };
      }

      // Verify recipient address
      const recipientAddress = AccountAddress.from(recipientAddressArg.bcsToBytes());
      const expectedPayTo = AccountAddress.from(requirements.payTo);
      if (!recipientAddress.equals(expectedPayTo)) {
        return {
          isValid: false,
          invalidReason: "invalid_payment_recipient_mismatch",
          payer: senderAddress,
        };
      }

      // Verify amount
      const amount = new Deserializer(amountArg.bcsToBytes()).deserializeU64().toString(10);
      if (amount !== requirements.amount) {
        return {
          isValid: false,
          invalidReason: "invalid_payment_amount_mismatch",
          payer: senderAddress,
        };
      }

      // Step 6: Simulate the transaction
      try {
        let publicKey: PublicKey | undefined;
        if (senderAuthenticator.isEd25519()) {
          publicKey = senderAuthenticator.public_key;
        } else if (senderAuthenticator.isSingleKey()) {
          publicKey = senderAuthenticator.public_key;
        } else if (senderAuthenticator.isMultiKey()) {
          publicKey = senderAuthenticator.public_keys;
        }

        const aptos = createAptosClient(requirements.network);
        const simulationResult = (
          await aptos.transaction.simulate.simple({
            signerPublicKey: publicKey,
            transaction,
          })
        )[0];

        if (!simulationResult.success) {
          return {
            isValid: false,
            invalidReason: `simulation_failed: ${simulationResult.vm_status}`,
            payer: senderAddress,
          };
        }
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        return {
          isValid: false,
          invalidReason: `simulation_error: ${errorMessage}`,
          payer: senderAddress,
        };
      }

      // All checks passed
      return {
        isValid: true,
        invalidReason: undefined,
        payer: senderAddress,
      };
    } catch (error) {
      console.error("Verify error:", error);
      return {
        isValid: false,
        invalidReason: "unexpected_verify_error",
        payer: "",
      };
    }
  }

  /**
   * Settles a payment by submitting the transaction.
   *
   * @param payload - The payment payload to settle
   * @param requirements - The payment requirements
   * @returns Promise resolving to settlement response
   */
  async settle(
    payload: PaymentPayload,
    requirements: PaymentRequirements,
  ): Promise<SettleResponse> {
    const aptosPayload = payload.payload as ExactAptosPayload;

    // Verify first
    const valid = await this.verify(payload, requirements);
    if (!valid.isValid) {
      return {
        success: false,
        network: payload.accepted.network,
        transaction: "",
        errorReason: valid.invalidReason ?? "verification_failed",
        payer: valid.payer || "",
      };
    }

    try {
      // Deserialize the transaction
      const { transaction, senderAuthenticator } = deserializeAptosPayment(
        aptosPayload.transaction,
      );

      const senderAddress = transaction.rawTransaction.sender.toStringLong();
      const sponsored = requirements.extra?.sponsored === true;

      let pendingTxn;
      if (sponsored) {
        // Sponsored: facilitator signs as fee payer and submits
        pendingTxn = await this.signer.signAndSubmitAsFeePayer(
          transaction,
          senderAuthenticator,
          requirements.network,
        );
      } else {
        // Non-sponsored: just submit the client's fully signed transaction
        pendingTxn = await this.signer.submitTransaction(
          transaction,
          senderAuthenticator,
          requirements.network,
        );
      }

      // Wait for confirmation
      await this.signer.waitForTransaction(pendingTxn.hash, requirements.network);

      return {
        success: true,
        transaction: pendingTxn.hash,
        network: payload.accepted.network,
        payer: senderAddress,
      };
    } catch (error) {
      console.error("Settle error:", error);
      return {
        success: false,
        errorReason: "transaction_failed",
        transaction: "",
        network: payload.accepted.network,
        payer: valid.payer || "",
      };
    }
  }
}
