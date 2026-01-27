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
   *
   * @param _ - The network identifier (unused)
   * @returns Extra data with fee payer address
   */
  getExtra(_: string): Record<string, unknown> | undefined {
    const addresses = this.signer.getAddresses();
    const randomIndex = Math.floor(Math.random() * addresses.length);
    return { feePayer: addresses[randomIndex] };
  }

  /**
   * Get signer addresses used by this facilitator.
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

      // Step 1: Validate version and requirements
      if (payload.x402Version !== 2) {
        return {
          isValid: false,
          invalidReason: "invalid_exact_aptos_payload_unsupported_version",
          payer: "",
        };
      }

      if (payload.accepted.scheme !== "exact" || requirements.scheme !== "exact") {
        return { isValid: false, invalidReason: "unsupported_scheme", payer: "" };
      }

      if (payload.accepted.network !== requirements.network) {
        return { isValid: false, invalidReason: "network_mismatch", payer: "" };
      }

      const signerAddresses = this.signer.getAddresses();
      const isSponsored = typeof requirements.extra?.feePayer === "string";

      // If sponsored, verify the fee payer is managed by this facilitator
      if (isSponsored && !signerAddresses.includes(requirements.extra.feePayer as string)) {
        return { isValid: false, invalidReason: "fee_payer_not_managed_by_facilitator", payer: "" };
      }

      // Step 2: Deserialize and validate transaction
      const { transaction, senderAuthenticator, entryFunction } = deserializeAptosPayment(
        aptosPayload.transaction,
      );
      const senderAddress = transaction.rawTransaction.sender.toString();

      // For sponsored transactions, verify fee payer address matches
      if (isSponsored) {
        const expectedFeePayer = AccountAddress.from(requirements.extra.feePayer as string);
        if (!transaction.feePayerAddress || !expectedFeePayer.equals(transaction.feePayerAddress)) {
          return {
            isValid: false,
            invalidReason: "invalid_exact_aptos_payload_fee_payer_mismatch",
            payer: senderAddress,
          };
        }
      }

      // SECURITY (reference implementation): Prevent facilitator from signing away their own tokens
      if (isSponsored && signerAddresses.includes(senderAddress)) {
        return {
          isValid: false,
          invalidReason: "invalid_exact_aptos_payload_fee_payer_transferring_funds",
          payer: senderAddress,
        };
      }

      if (!entryFunction) {
        return {
          isValid: false,
          invalidReason: "invalid_exact_aptos_payload_missing_entry_function",
          payer: senderAddress,
        };
      }

      // Step 3: Verify transfer function
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

      // Step 4: Verify type and function arguments
      if (entryFunction.type_args.length !== 1) {
        return {
          isValid: false,
          invalidReason: "invalid_exact_aptos_payload_wrong_type_args",
          payer: senderAddress,
        };
      }

      const args = entryFunction.args;
      if (args.length !== 3) {
        return {
          isValid: false,
          invalidReason: "invalid_exact_aptos_payload_wrong_args",
          payer: senderAddress,
        };
      }

      const [faAddressArg, recipientAddressArg, amountArg] = args;

      const faAddress = AccountAddress.from(faAddressArg.bcsToBytes());
      if (!faAddress.equals(AccountAddress.from(requirements.asset))) {
        return {
          isValid: false,
          invalidReason: "invalid_exact_aptos_payload_asset_mismatch",
          payer: senderAddress,
        };
      }

      const recipientAddress = AccountAddress.from(recipientAddressArg.bcsToBytes());
      if (!recipientAddress.equals(AccountAddress.from(requirements.payTo))) {
        return {
          isValid: false,
          invalidReason: "invalid_exact_aptos_payload_recipient_mismatch",
          payer: senderAddress,
        };
      }

      const amount = new Deserializer(amountArg.bcsToBytes()).deserializeU64().toString(10);
      if (amount !== requirements.amount) {
        return {
          isValid: false,
          invalidReason: "invalid_exact_aptos_payload_amount_mismatch",
          payer: senderAddress,
        };
      }

      // Step 5: Check balance
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
        if (currentBalance < BigInt(requirements.amount)) {
          return {
            isValid: false,
            invalidReason: "invalid_exact_aptos_payload_insufficient_balance",
            payer: senderAddress,
          };
        }
      } catch {
        // Balance check is optional - simulation will catch insufficient funds
      }

      // Step 6: Check expiration
      const EXPIRATION_BUFFER_SECONDS = 5;
      const expirationTimestamp = Number(transaction.rawTransaction.expiration_timestamp_secs);
      if (expirationTimestamp < Math.floor(Date.now() / 1000) + EXPIRATION_BUFFER_SECONDS) {
        return {
          isValid: false,
          invalidReason: "invalid_exact_aptos_payload_transaction_expired",
          payer: senderAddress,
        };
      }

      // Step 7: Simulate transaction
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
          await aptos.transaction.simulate.simple({ signerPublicKey: publicKey, transaction })
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

      return { isValid: true, invalidReason: undefined, payer: senderAddress };
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
      const { transaction, senderAuthenticator } = deserializeAptosPayment(
        aptosPayload.transaction,
      );
      const senderAddress = transaction.rawTransaction.sender.toStringLong();
      const isSponsored = typeof requirements.extra?.feePayer === "string";

      const pendingTxn = isSponsored
        ? await this.signer.signAndSubmitAsFeePayer(
            transaction,
            senderAuthenticator,
            requirements.network,
          )
        : await this.signer.submitTransaction(
            transaction,
            senderAuthenticator,
            requirements.network,
          );

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
