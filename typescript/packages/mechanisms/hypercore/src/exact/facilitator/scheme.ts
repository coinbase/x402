import type {
  SchemeNetworkFacilitator,
  PaymentPayload,
  PaymentRequirements,
  VerifyResponse,
  SettleResponse,
  Network,
} from "@x402/core/types";
import type {
  HypercorePaymentPayload,
  HyperliquidApiResponse,
  HypercoreSendAssetAction,
} from "../../types.js";
import { recoverTypedDataAddress } from "viem";
import {
  HYPERCORE_EIP712_DOMAIN,
  HYPERCORE_EIP712_TYPES,
  MAX_NONCE_AGE_MS,
  TX_HASH_LOOKUP,
  HYPERCORE_NETWORK_CONFIGS,
  HYPERCORE_API_URLS_BY_NETWORK,
} from "../../constants.js";

/**
 * Hypercore scheme facilitator implementation.
 */
export class ExactHypercoreScheme implements SchemeNetworkFacilitator {
  readonly scheme = "exact";
  readonly caipFamily = "hypercore:*";

  /**
   * Create a facilitator scheme.
   *
   * @param config - Optional configuration object.
   * @param config.apiUrl - Optional API URL override for the network.
   */
  constructor(private config: { apiUrl?: string } = {}) {}

  /**
   * Return extra metadata for the network.
   *
   * @param _ - Network identifier.
   * @returns Extra metadata, if any.
   */
  getExtra(_: Network): Record<string, unknown> | undefined {
    return undefined;
  }

  /**
   * Return signer addresses for the network.
   *
   * @param _ - Network identifier.
   * @returns Signer addresses.
   */
  getSigners(_: string): string[] {
    return [];
  }

  /**
   * Verify a Hypercore payment payload against requirements.
   *
   * @param payload - The payment payload to verify.
   * @param requirements - The payment requirements to verify against.
   * @returns Verification result.
   */
  async verify(
    payload: PaymentPayload,
    requirements: PaymentRequirements,
  ): Promise<VerifyResponse> {
    const hypercorePayload = payload.payload as unknown as HypercorePaymentPayload;

    if (!requirements.network.startsWith("hypercore:")) {
      return {
        isValid: false,
        invalidReason: `Invalid network: ${requirements.network}. Expected hypercore:mainnet or hypercore:testnet`,
      };
    }

    const config = HYPERCORE_NETWORK_CONFIGS[requirements.network];
    if (!config) {
      return {
        isValid: false,
        invalidReason: `Invalid network: ${requirements.network}. Expected hypercore:mainnet or hypercore:testnet`,
      };
    }

    if (hypercorePayload.action.type !== "sendAsset") {
      return {
        isValid: false,
        invalidReason: `Invalid action type: ${hypercorePayload.action.type}. Expected sendAsset`,
      };
    }

    if (hypercorePayload.action.destination.toLowerCase() !== requirements.payTo.toLowerCase()) {
      return {
        isValid: false,
        invalidReason: `Destination mismatch: ${hypercorePayload.action.destination} vs ${requirements.payTo}`,
      };
    }

    const decimals = config.defaultAsset.decimals;
    const payloadAmount = this.parseAmountToInteger(hypercorePayload.action.amount, decimals);
    const requiredAmount = parseInt(requirements.amount);

    if (payloadAmount < requiredAmount) {
      return {
        isValid: false,
        invalidReason: `Insufficient amount: ${payloadAmount} < ${requiredAmount}`,
      };
    }

    if (requirements.asset && hypercorePayload.action.token !== requirements.asset) {
      return {
        isValid: false,
        invalidReason: `Token mismatch: ${hypercorePayload.action.token} vs ${requirements.asset}`,
      };
    }

    const now = Date.now();
    const nonceAge = now - hypercorePayload.nonce;

    if (nonceAge > MAX_NONCE_AGE_MS) {
      return {
        isValid: false,
        invalidReason: `Nonce too old: ${nonceAge}ms (max ${MAX_NONCE_AGE_MS}ms)`,
      };
    }

    if (
      !hypercorePayload.signature ||
      !hypercorePayload.signature.r ||
      !hypercorePayload.signature.s ||
      typeof hypercorePayload.signature.v !== "number"
    ) {
      return {
        isValid: false,
        invalidReason: "Invalid signature structure",
      };
    }

    return { isValid: true };
  }

  /**
   * Settle a Hypercore payment using the Hyperliquid API.
   *
   * @param payload - The payment payload to settle.
   * @param requirements - The payment requirements.
   * @returns Settlement result.
   */
  async settle(
    payload: PaymentPayload,
    requirements: PaymentRequirements,
  ): Promise<SettleResponse> {
    const verifyResult = await this.verify(payload, requirements);
    if (!verifyResult.isValid) {
      throw new Error(`Verification failed: ${verifyResult.invalidReason}`);
    }

    const hypercorePayload = payload.payload as unknown as HypercorePaymentPayload;
    const apiUrl = this.getApiUrl(requirements.network);

    try {
      const payer = await this.recoverPayer(hypercorePayload.action, hypercorePayload.signature);

      const startTime = Date.now();

      const response = await fetch(`${apiUrl}/exchange`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          action: hypercorePayload.action,
          nonce: hypercorePayload.nonce,
          signature: hypercorePayload.signature,
          vaultAddress: null,
        }),
      });

      if (!response.ok) {
        throw new Error(`Hyperliquid API error: ${response.status} ${response.statusText}`);
      }

      const result = (await response.json()) as HyperliquidApiResponse;

      if (result.status !== "ok") {
        throw new Error(`Settlement failed: ${JSON.stringify(result)}`);
      }

      const transactionHash = await this.getTransactionHash(
        apiUrl,
        payer,
        hypercorePayload.action.destination,
        hypercorePayload.nonce,
        startTime,
      );

      return {
        success: true,
        transaction: transactionHash,
        network: requirements.network,
        payer,
      };
    } catch (error) {
      throw new Error(
        `Hypercore settlement failed: ${error instanceof Error ? error.message : "Unknown error"}`,
      );
    }
  }

  /**
   * Get the API URL for a specific network.
   *
   * @param network - Network identifier (e.g. hypercore:mainnet, hypercore:testnet).
   * @returns API URL for the network.
   */
  private getApiUrl(network: string): string {
    const url = HYPERCORE_API_URLS_BY_NETWORK[network] ?? this.config.apiUrl;
    if (!url) {
      throw new Error(`No API URL configured for network: ${network}`);
    }
    return url;
  }

  /**
   * Recover the payer address from a typed-data signature.
   *
   * @param action - The SendAsset action that was signed.
   * @param signature - Signature parts.
   * @param signature.r - Signature r value.
   * @param signature.s - Signature s value.
   * @param signature.v - Signature v value.
   * @returns Payer address.
   */
  private async recoverPayer(
    action: HypercoreSendAssetAction,
    signature: { r: string; s: string; v: number },
  ): Promise<string> {
    const address = await recoverTypedDataAddress({
      domain: {
        ...HYPERCORE_EIP712_DOMAIN,
        chainId: Number(HYPERCORE_EIP712_DOMAIN.chainId),
      },
      types: HYPERCORE_EIP712_TYPES,
      primaryType: "HyperliquidTransaction:SendAsset",
      message: {
        ...action,
        nonce: BigInt(action.nonce),
      },
      signature:
        `${signature.r}${signature.s.slice(2)}${signature.v.toString(16).padStart(2, "0")}` as `0x${string}`,
    });
    return address;
  }

  /**
   * Fetch the transaction hash from ledger updates.
   *
   * @param apiUrl - Hyperliquid API URL to query.
   * @param user - The user's address who sent the transaction.
   * @param destination - Destination address.
   * @param nonce - Payment nonce.
   * @param startTime - Submission timestamp (ms).
   * @returns Transaction hash.
   */
  private async getTransactionHash(
    apiUrl: string,
    user: string,
    destination: string,
    nonce: number,
    startTime: number,
  ): Promise<string> {
    for (let attempt = 0; attempt < TX_HASH_LOOKUP.maxRetries; attempt++) {
      try {
        if (attempt > 0) {
          await new Promise(resolve => setTimeout(resolve, TX_HASH_LOOKUP.retryDelay));
        }

        const response = await fetch(`${apiUrl}/info`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            type: "userNonFundingLedgerUpdates",
            user: user,
            startTime: startTime - TX_HASH_LOOKUP.lookbackWindow,
          }),
        });

        if (!response.ok) {
          throw new Error(`Failed to query ledger updates: ${response.status}`);
        }

        const ledgerUpdates = (await response.json()) as Array<{
          time: number;
          hash: string;
          delta: {
            [key: string]: unknown;
            type: string;
            destination?: string;
            nonce?: number;
          };
        }>;

        console.log(
          `[Hypercore] Attempt ${attempt + 1}: Found ${ledgerUpdates.length} ledger updates for user ${user}`,
        );

        const transfer = ledgerUpdates.find(
          update =>
            update.delta.type === "send" &&
            update.delta.destination?.toLowerCase() === destination.toLowerCase() &&
            update.delta.nonce === nonce,
        );

        if (transfer) {
          console.log(`[Hypercore] Found transaction hash: ${transfer.hash}`);
          return transfer.hash;
        }

        if (attempt < TX_HASH_LOOKUP.maxRetries - 1) {
          console.log(
            `[Hypercore] Transaction not indexed yet, retrying in ${TX_HASH_LOOKUP.retryDelay}ms...`,
          );
        }
      } catch (error) {
        console.error(`[Hypercore] Error querying ledger updates (attempt ${attempt + 1}):`, error);
        if (attempt === TX_HASH_LOOKUP.maxRetries - 1) {
          throw error;
        }
      }
    }

    throw new Error(
      `Transaction hash not found in ledger updates after ${TX_HASH_LOOKUP.maxRetries} attempts`,
    );
  }

  /**
   * Parse a USD amount string into a 6-decimal integer.
   *
   * @param amount - USD amount string.
   * @param decimals - Number of decimals for the token.
   * @returns Amount as integer.
   */
  private parseAmountToInteger(amount: string, decimals: number): number {
    const num = parseFloat(amount);
    return Math.floor(num * Math.pow(10, decimals));
  }
}
