import { signEvmMessage, getCurrentUser as getCDPUser } from "@coinbase/cdp-core";
import { operationStore, AuthorizationData } from "../stores/operations";
import { Address } from "viem";

/**
 * Signs a message using the CDP SDK and tracks the operation in the store.
 * Creates a pending operation, signs the message, and updates the operation status.
 *
 * @param message - The message to be signed
 * @param correlationId - Optional ID to correlate this operation with others
 * @param authorizationData - Optional payment authorization data for x402
 * @returns {Promise<string>} The signature of the signed message
 * @throws {Error} If signing fails or user is not found
 */
export async function signMessage(
  message: string,
  correlationId?: string,
  authorizationData?: AuthorizationData,
): Promise<string> {
  // Get user address for the operation
  const userAddress = await getWalletAddress();

  // Add pending operation to store
  operationStore.getState().addWalletOperation(
    `Signing message: ${message}`,
    "pending",
    "sign",
    userAddress,
    message,
    undefined, // signature (will be filled in after signing)
    undefined, // errorMessage
    correlationId,
    authorizationData,
  );

  try {
    // Sign the message using CDP SDK
    const result = await signEvmMessage({
      evmAccount: userAddress as Address,
      message,
    });

    // Update operation with success
    operationStore
      .getState()
      .updateWalletOperation(operationStore.getState().operations.length - 1, {
        description: `Message signed successfully`,
        status: "success",
        signature: result.signature,
      });

    return result.signature;
  } catch (error) {
    // Update operation with error
    operationStore
      .getState()
      .updateWalletOperation(operationStore.getState().operations.length - 1, {
        status: "error",
        errorMessage: error instanceof Error ? error.message : "Unknown error",
      });
    throw error;
  }
}

/**
 * Specialized function for signing x402 payment authorizations.
 * Converts authorization data to JSON and signs it, tracking the operation with specific x402 context.
 *
 * @param correlationId - ID to correlate this payment authorization with other operations
 * @param authorizationData - Payment authorization details to be signed
 * @returns {Promise<string>} The signature of the payment authorization
 * @throws {Error} If signing fails or user is not found
 */
export async function signX402Payment(
  correlationId: string,
  authorizationData: AuthorizationData,
): Promise<string> {
  // Use the regular signMessage function with X402 context
  const message = JSON.stringify(authorizationData);

  // Sign the message with correlation context
  const signature = await signMessage(message, correlationId, authorizationData);

  // Update the description to be more specific for X402
  operationStore.getState().updateWalletOperation(operationStore.getState().operations.length - 1, {
    description: `Payment authorization signed successfully`,
  });

  return signature;
}

/**
 * Retrieves the user's EVM wallet address from CDP.
 * Gets the first EVM account from the current CDP user.
 *
 * @returns {Promise<string>} The user's EVM wallet address
 * @throws {Error} If user is not found or CDP SDK is not initialized
 */
export async function getWalletAddress(): Promise<string> {
  const user = await getCDPUser();
  if (!user) {
    throw new Error("User not found - CDP SDK may not be initialized");
  }
  return user.evmAccounts?.[0] as Address;
}
