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
   * For Aptos, this includes the fee payer address for sponsored transactions.
   * Random selection distributes load across multiple signers.
   *
   * @param _ - The network identifier (unused)
   * @returns Extra data with fee payer address (presence indicates sponsorship is available)
   */
  getExtra(_: string): Record<string, unknown> | undefined {
    // Randomly select from available signers to distribute load
    const addresses = this.signer.getAddresses();
    const randomIndex = Math.floor(Math.random() * addresses.length);

    return {
      feePayer: addresses[randomIndex],
    };
  }

  /**
   * Get signer addresses used by this facilitator.
   * Returns all addresses this facilitator can use for signing/settling transactions.
   *
   * @param _ - The network identifier (unused)
   * @returns Array of fee payer addresses
   */
  getSigners(_: string): string[] {
    return [...this.signer.getAddresses()];
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

      // Step 1: Verify x402Version is 2
      if (payload.x402Version !== 2) {
        return {
          isValid: false,
          invalidReason: "invalid_exact_aptos_payload_unsupported_version",
          payer: "",
        };
      }

      // Step 2: Validate Payment Requirements (use generic error codes like EVM/SVM)
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

      // Verify feePayer is specified and managed by this facilitator
      if (!requirements.extra?.feePayer || typeof requirements.extra.feePayer !== "string") {
        return {
          isValid: false,
          invalidReason: "invalid_exact_aptos_payload_missing_fee_payer",
          payer: "",
        };
      }

      const signerAddresses = this.signer.getAddresses();
      if (!signerAddresses.includes(requirements.extra.feePayer)) {
        return {
          isValid: false,
          invalidReason: "fee_payer_not_managed_by_facilitator",
          payer: "",
        };
      }

      // Step 3: Deserialize and validate transaction
      const { transaction, senderAuthenticator, entryFunction } = deserializeAptosPayment(
        aptosPayload.transaction,
      );

      const senderAddress = transaction.rawTransaction.sender.toString();

      // Verify the fee payer address in the transaction matches the expected one
      const expectedFeePayer = AccountAddress.from(requirements.extra.feePayer);
      if (
        !transaction.feePayerAddress ||
        !expectedFeePayer.equals(transaction.feePayerAddress)
      ) {
        return {
          isValid: false,
          invalidReason: "invalid_exact_aptos_payload_fee_payer_mismatch",
          payer: senderAddress,
        };
      }

      // SECURITY: Prevent facilitator from signing away their own tokens
      if (signerAddresses.includes(senderAddress)) {
        return {
          isValid: false,
          invalidReason: "invalid_exact_aptos_payload_fee_payer_transferring_funds",
          payer: senderAddress,
        };
      }

      // Check that it's an entry function payload
      if (!entryFunction) {
        return {
          isValid: false,
          invalidReason: "invalid_exact_aptos_payload_missing_entry_function",
          payer: senderAddress,
        };
      }

      // Step 4: Verify the function is a valid transfer function
      // Spec allows: 0x1::primary_fungible_store::transfer or 0x1::fungible_asset::transfer
      const moduleAddress = entryFunction.module_name.address;
      const moduleName = entryFunction.module_name.name.identifier;
      const functionName = entryFunction.function_name.identifier;

      const isPrimaryFungibleStore =
        AccountAddress.ONE.equals(moduleAddress) &&
        moduleName === "primary_fungible_store" &&
        functionName === "transfer";

      const isFungibleAsset =
        AccountAddress.ONE.equals(moduleAddress) &&
        moduleName === "fungible_asset" &&
        functionName === "transfer";

      if (!isPrimaryFungibleStore && !isFungibleAsset) {
        return {
          isValid: false,
          invalidReason: "invalid_exact_aptos_payload_wrong_function",
          payer: senderAddress,
        };
      }

      // Step 5: Verify type arguments
      const typeArgs = entryFunction.type_args;
      if (typeArgs.length !== 1) {
        return {
          isValid: false,
          invalidReason: "invalid_exact_aptos_payload_wrong_type_args",
          payer: senderAddress,
        };
      }

      // Step 6: Verify function arguments
      // primary_fungible_store::transfer takes: (asset: Object<T>, recipient: address, amount: u64)
      // fungible_asset::transfer takes: (from: Object<T>, to: Object<T>, amount: u64)
      const args = entryFunction.args;
      if (args.length !== 3) {
        return {
          isValid: false,
          invalidReason: "invalid_exact_aptos_payload_wrong_args",
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
          invalidReason: "invalid_exact_aptos_payload_asset_mismatch",
          payer: senderAddress,
        };
      }

      // Verify recipient address
      const recipientAddress = AccountAddress.from(recipientAddressArg.bcsToBytes());
      const expectedPayTo = AccountAddress.from(requirements.payTo);
      if (!recipientAddress.equals(expectedPayTo)) {
        return {
          isValid: false,
          invalidReason: "invalid_exact_aptos_payload_recipient_mismatch",
          payer: senderAddress,
        };
      }

      // Verify amount
      const amount = new Deserializer(amountArg.bcsToBytes()).deserializeU64().toString(10);
      if (amount !== requirements.amount) {
        return {
          isValid: false,
          invalidReason: "invalid_exact_aptos_payload_amount_mismatch",
          payer: senderAddress,
        };
      }

      // Step 7: Check balance before simulation for clearer error messages
      const aptos = createAptosClient(requirements.network);
      try {
        const balance = await aptos.getCurrentFungibleAssetBalances({
          options: {
            where: {
              owner_address: { _eq: senderAddress },
              asset_type: { _eq: requirements.asset },
            },
          },
        });
        const currentBalance = BigInt(balance[0]?.amount ?? 0);
        const requiredAmount = BigInt(requirements.amount);
        if (currentBalance < requiredAmount) {
          return {
            isValid: false,
            invalidReason: "invalid_exact_aptos_payload_insufficient_balance",
            payer: senderAddress,
          };
        }
      } catch {
        // Balance check is optional - simulation will catch this too
        // Continue to simulation for final validation
      }

      // Step 8: Check expiration timestamp
      // Add buffer time to account for network propagation delays
      const EXPIRATION_BUFFER_SECONDS = 30;
      const expirationTimestamp = Number(transaction.rawTransaction.expiration_timestamp_secs);
      const currentTimestamp = Math.floor(Date.now() / 1000);
      if (expirationTimestamp < currentTimestamp + EXPIRATION_BUFFER_SECONDS) {
        return {
          isValid: false,
          invalidReason: "invalid_exact_aptos_payload_transaction_expired",
          payer: senderAddress,
        };
      }

      // Step 9: Simulate the transaction
      try {
        let publicKey: PublicKey | undefined;
        if (senderAuthenticator.isEd25519()) {
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

        if (!simulationResult.success) {
          return {
            isValid: false,
            invalidReason: `invalid_exact_aptos_payload_simulation_failed: ${simulationResult.vm_status}`,
            payer: senderAddress,
          };
        }
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        return {
          isValid: false,
          invalidReason: `invalid_exact_aptos_payload_simulation_error: ${errorMessage}`,
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
        invalidReason: "invalid_exact_aptos_payload_unexpected_error",
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

      // Check if sponsored (presence of feePayer indicates sponsorship)
      const isSponsored = typeof requirements.extra?.feePayer === "string";

      let pendingTxn;
      if (isSponsored) {
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
