import { getAddress, parseErc6492Signature } from "viem";
import {
  PaymentRequirements,
  SchemeNetworkClient,
  SchemeNetworkFacilitator,
  SchemeNetworkService,
} from "@x402/core/types";
import { ClientEvmSigner, FacilitatorEvmSigner } from "../signer";
import { PaymentPayload, Price, AssetAmount, Network } from "@x402/core/types";
import { ExactEvmPayloadV2 } from "../types";
import { createNonce } from "../utils";
import { authorizationTypes, eip3009ABI } from "../constants";
import { SettleResponse, VerifyResponse } from "@x402/core/types";

/**
 * EVM client implementation for the Exact payment scheme.
 *
 */
export class ExactEvmClient implements SchemeNetworkClient {
  readonly scheme = "exact";

  /**
   * Creates a new ExactEvmClient instance.
   *
   * @param signer - The EVM signer for client operations
   */
  constructor(private readonly signer: ClientEvmSigner) {}

  /**
   * Creates a payment payload for the Exact scheme.
   *
   * @param x402Version - The x402 protocol version
   * @param paymentRequirements - The payment requirements
   * @returns Promise resolving to a payment payload
   */
  async createPaymentPayload(
    x402Version: number,
    paymentRequirements: PaymentRequirements,
  ): Promise<Pick<PaymentPayload, "x402Version" | "payload">> {
    const nonce = createNonce();
    const now = Math.floor(Date.now() / 1000);

    const authorization: ExactEvmPayloadV2["authorization"] = {
      from: this.signer.address,
      to: getAddress(paymentRequirements.payTo),
      value: paymentRequirements.amount,
      validAfter: (now - 600).toString(), // 10 minutes before
      validBefore: (now + paymentRequirements.maxTimeoutSeconds).toString(),
      nonce,
    };

    // Sign the authorization
    const signature = await this.signAuthorization(authorization, paymentRequirements);

    const payload: ExactEvmPayloadV2 = {
      authorization,
      signature,
    };

    return {
      x402Version,
      payload,
    };
  }

  /**
   * Sign the EIP-3009 authorization using EIP-712
   *
   * @param authorization - The authorization to sign
   * @param requirements - The payment requirements
   * @returns Promise resolving to the signature
   */
  private async signAuthorization(
    authorization: ExactEvmPayloadV2["authorization"],
    requirements: PaymentRequirements,
  ): Promise<`0x${string}`> {
    const chainId = parseInt(requirements.network.split(":")[1]);

    if (!requirements.extra?.name || !requirements.extra?.version) {
      throw new Error(
        `EIP-712 domain parameters (name, version) are required in payment requirements for asset ${requirements.asset}`,
      );
    }

    const { name, version } = requirements.extra;

    const domain = {
      name,
      version,
      chainId,
      verifyingContract: getAddress(requirements.asset),
    };

    const message = {
      from: getAddress(authorization.from),
      to: getAddress(authorization.to),
      value: BigInt(authorization.value),
      validAfter: BigInt(authorization.validAfter),
      validBefore: BigInt(authorization.validBefore),
      nonce: authorization.nonce,
    };

    return await this.signer.signTypedData({
      domain,
      types: authorizationTypes,
      primaryType: "TransferWithAuthorization",
      message,
    });
  }
}

/**
 * EVM facilitator implementation for the Exact payment scheme.
 */
export class ExactEvmFacilitator implements SchemeNetworkFacilitator {
  readonly scheme = "exact";

  /**
   * Creates a new ExactEvmFacilitator instance.
   *
   * @param signer - The EVM signer for facilitator operations
   */
  constructor(private readonly signer: FacilitatorEvmSigner) {}

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
    const exactEvmPayload = payload.payload as ExactEvmPayloadV2;

    // Verify scheme matches
    if (payload.accepted.scheme !== "exact" || requirements.scheme !== "exact") {
      return {
        isValid: false,
        invalidReason: "unsupported_scheme",
        payer: exactEvmPayload.authorization.from,
      };
    }

    // Get chain configuration
    if (!requirements.extra?.name || !requirements.extra?.version) {
      return {
        isValid: false,
        invalidReason: "missing_eip712_domain",
        payer: exactEvmPayload.authorization.from,
      };
    }

    const { name, version } = requirements.extra;
    const erc20Address = getAddress(requirements.asset);

    // Verify network matches
    if (payload.accepted.network !== requirements.network) {
      return {
        isValid: false,
        invalidReason: "network_mismatch",
        payer: exactEvmPayload.authorization.from,
      };
    }

    // Build typed data for signature verification
    const permitTypedData = {
      types: authorizationTypes,
      primaryType: "TransferWithAuthorization" as const,
      domain: {
        name,
        version,
        chainId: parseInt(requirements.network.split(":")[1]),
        verifyingContract: erc20Address,
      },
      message: {
        from: exactEvmPayload.authorization.from,
        to: exactEvmPayload.authorization.to,
        value: BigInt(exactEvmPayload.authorization.value),
        validAfter: BigInt(exactEvmPayload.authorization.validAfter),
        validBefore: BigInt(exactEvmPayload.authorization.validBefore),
        nonce: exactEvmPayload.authorization.nonce,
      },
    };

    // Verify signature
    try {
      const recoveredAddress = await this.signer.verifyTypedData({
        address: exactEvmPayload.authorization.from,
        ...permitTypedData,
        signature: exactEvmPayload.signature!,
      });

      if (!recoveredAddress) {
        return {
          isValid: false,
          invalidReason: "invalid_exact_evm_payload_signature",
          payer: exactEvmPayload.authorization.from,
        };
      }
    } catch {
      return {
        isValid: false,
        invalidReason: "invalid_exact_evm_payload_signature",
        payer: exactEvmPayload.authorization.from,
      };
    }

    // Verify payment recipient matches
    if (getAddress(exactEvmPayload.authorization.to) !== getAddress(requirements.payTo)) {
      return {
        isValid: false,
        invalidReason: "invalid_exact_evm_payload_recipient_mismatch",
        payer: exactEvmPayload.authorization.from,
      };
    }

    // Verify validBefore is in the future (with 6 second buffer for block time)
    const now = Math.floor(Date.now() / 1000);
    if (BigInt(exactEvmPayload.authorization.validBefore) < BigInt(now + 6)) {
      return {
        isValid: false,
        invalidReason: "invalid_exact_evm_payload_authorization_valid_before",
        payer: exactEvmPayload.authorization.from,
      };
    }

    // Verify validAfter is not in the future
    if (BigInt(exactEvmPayload.authorization.validAfter) > BigInt(now)) {
      return {
        isValid: false,
        invalidReason: "invalid_exact_evm_payload_authorization_valid_after",
        payer: exactEvmPayload.authorization.from,
      };
    }

    // Check balance
    try {
      const balance = (await this.signer.readContract({
        address: erc20Address,
        abi: eip3009ABI,
        functionName: "balanceOf",
        args: [exactEvmPayload.authorization.from],
      })) as bigint;

      if (BigInt(balance) < BigInt(requirements.amount)) {
        return {
          isValid: false,
          invalidReason: "insufficient_funds",
          payer: exactEvmPayload.authorization.from,
        };
      }
    } catch {
      // If we can't check balance, continue with other validations
    }

    // Verify amount is sufficient
    if (BigInt(exactEvmPayload.authorization.value) < BigInt(requirements.amount)) {
      return {
        isValid: false,
        invalidReason: "invalid_exact_evm_payload_authorization_value",
        payer: exactEvmPayload.authorization.from,
      };
    }

    return {
      isValid: true,
      invalidReason: undefined,
      payer: exactEvmPayload.authorization.from,
    };
  }

  /**
   * Settles a payment by executing the transfer.
   *
   * @param payload - The payment payload to settle
   * @param requirements - The payment requirements
   * @returns Promise resolving to settlement response
   */
  async settle(
    payload: PaymentPayload,
    requirements: PaymentRequirements,
  ): Promise<SettleResponse> {
    const exactEvmPayload = payload.payload as ExactEvmPayloadV2;

    // Re-verify before settling
    const valid = await this.verify(payload, requirements);
    if (!valid.isValid) {
      return {
        success: false,
        network: payload.accepted.network,
        transaction: "",
        errorReason: valid.invalidReason ?? "invalid_scheme",
        payer: exactEvmPayload.authorization.from,
      };
    }

    try {
      // Parse ERC-6492 signature if applicable
      const { signature } = parseErc6492Signature(exactEvmPayload.signature!);

      // Execute transferWithAuthorization
      const tx = await this.signer.writeContract({
        address: getAddress(requirements.asset),
        abi: eip3009ABI,
        functionName: "transferWithAuthorization",
        args: [
          getAddress(exactEvmPayload.authorization.from),
          getAddress(exactEvmPayload.authorization.to),
          BigInt(exactEvmPayload.authorization.value),
          BigInt(exactEvmPayload.authorization.validAfter),
          BigInt(exactEvmPayload.authorization.validBefore),
          exactEvmPayload.authorization.nonce,
          signature,
        ],
      });

      // Wait for transaction confirmation
      const receipt = await this.signer.waitForTransactionReceipt({ hash: tx });

      if (receipt.status !== "success") {
        return {
          success: false,
          errorReason: "invalid_transaction_state",
          transaction: tx,
          network: payload.accepted.network,
          payer: exactEvmPayload.authorization.from,
        };
      }

      return {
        success: true,
        transaction: tx,
        network: payload.accepted.network,
        payer: exactEvmPayload.authorization.from,
      };
    } catch (error) {
      console.error("Failed to settle transaction:", error);
      return {
        success: false,
        errorReason: "transaction_failed",
        transaction: "",
        network: payload.accepted.network,
        payer: exactEvmPayload.authorization.from,
      };
    }
  }
}

/**
 * EVM service implementation for the Exact payment scheme.
 */
export class ExactEvmService implements SchemeNetworkService {
  readonly scheme = "exact";

  /**
   * Parses a price into an asset amount.
   *
   * @param price - The price to parse
   * @param network - The network to use
   * @returns The parsed asset amount
   */
  parsePrice(price: Price, network: Network): AssetAmount {
    // Handle pre-parsed price object
    if (typeof price === "object" && price !== null && "amount" in price) {
      if (!price.asset) {
        throw new Error(`Asset address must be specified for price object on network ${network}`);
      }
      return {
        amount: price.amount,
        asset: price.asset,
        extra: price.extra || {},
      };
    }

    // Parse string prices like "$0.10" or "0.10 USDC"
    if (typeof price === "string") {
      // Remove $ sign if present
      const cleanPrice = price.replace(/^\$/, "").trim();

      // Check if it contains a currency/asset identifier
      const parts = cleanPrice.split(/\s+/);
      if (parts.length === 2) {
        // Format: "0.10 USDC"
        const amount = this.convertToTokenAmount(parts[0], network);
        const assetInfo = this.getAssetInfo(parts[1], network);
        return {
          amount,
          asset: assetInfo.address,
          extra: {
            name: assetInfo.name,
            version: assetInfo.version,
          },
        };
      } else if (cleanPrice.match(/^\d+(\.\d+)?$/)) {
        // Simple number format like "0.10" - assume USD/USDC
        const amount = this.convertToTokenAmount(cleanPrice, network);
        const assetInfo = this.getDefaultAsset(network);
        return {
          amount,
          asset: assetInfo.address,
          extra: {
            name: assetInfo.name,
            version: assetInfo.version,
          },
        };
      } else {
        throw new Error(
          `Invalid price format: ${price}. Must specify currency (e.g., "0.10 USDC") or use simple number format.`,
        );
      }
    }

    // Handle number input - assume USD/USDC
    if (typeof price === "number") {
      const amount = this.convertToTokenAmount(price.toString(), network);
      const assetInfo = this.getDefaultAsset(network);
      return {
        amount,
        asset: assetInfo.address,
        extra: {
          name: assetInfo.name,
          version: assetInfo.version,
        },
      };
    }

    throw new Error(`Invalid price format: ${price}`);
  }

  /**
   * Build payment requirements for this scheme/network combination
   *
   * @param paymentRequirements - The base payment requirements
   * @param supportedKind - The supported kind from facilitator (unused)
   * @param supportedKind.x402Version - The x402 version
   * @param supportedKind.scheme - The logical payment scheme
   * @param supportedKind.network - The network identifier in CAIP-2 format
   * @param supportedKind.extra - Optional extra metadata regarding scheme/network implementation details
   * @param extensionKeys - Extension keys supported by the facilitator (unused)
   * @returns Payment requirements ready to be sent to clients
   */
  enhancePaymentRequirements(
    paymentRequirements: PaymentRequirements,
    supportedKind: {
      x402Version: number;
      scheme: string;
      network: Network;
      extra?: Record<string, unknown>;
    },
    extensionKeys: string[],
  ): Promise<PaymentRequirements> {
    // Mark unused parameters to satisfy linter
    void supportedKind;
    void extensionKeys;
    return Promise.resolve(paymentRequirements);
  }

  /**
   * Convert decimal amount to token units (e.g., 0.10 -> 100000 for 6-decimal USDC)
   *
   * @param decimalAmount - The decimal amount to convert
   * @param network - The network to use
   * @returns The token amount as a string
   */
  private convertToTokenAmount(decimalAmount: string, network: Network): string {
    const decimals = this.getAssetDecimals(network);
    const amount = parseFloat(decimalAmount);
    if (isNaN(amount)) {
      throw new Error(`Invalid amount: ${decimalAmount}`);
    }
    // Convert to smallest unit (e.g., for USDC with 6 decimals: 0.10 * 10^6 = 100000)
    const tokenAmount = Math.floor(amount * Math.pow(10, decimals));
    return tokenAmount.toString();
  }

  /**
   * Get the default asset info for a network (typically USDC)
   *
   * @param network - The network to get asset info for
   * @returns The asset information including address, name, and version
   */
  private getDefaultAsset(network: Network): { address: string; name: string; version: string } {
    // Map of network to USDC info including EIP-712 domain parameters
    const usdcInfo: Record<string, { address: string; name: string; version: string }> = {
      "eip155:8453": {
        address: "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913",
        name: "USD Coin",
        version: "2",
      }, // Base mainnet USDC
      "eip155:84532": {
        address: "0x036CbD53842c5426634e7929541eC2318f3dCF7e",
        name: "USDC",
        version: "2",
      }, // Base Sepolia USDC
      "eip155:1": {
        address: "0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48",
        name: "USD Coin",
        version: "2",
      }, // Ethereum mainnet USDC
      "eip155:11155111": {
        address: "0x1c7D4B196Cb0C7B01d743Fbc6116a902379C7238",
        name: "USDC",
        version: "2",
      }, // Sepolia USDC
    };

    const assetInfo = usdcInfo[network];
    if (!assetInfo) {
      throw new Error(`No default asset configured for network ${network}`);
    }

    return assetInfo;
  }

  /**
   * Get asset info for a given symbol on a network
   *
   * @param symbol - The asset symbol
   * @param network - The network to use
   * @returns The asset information including address, name, and version
   */
  private getAssetInfo(
    symbol: string,
    network: Network,
  ): { address: string; name: string; version: string } {
    const upperSymbol = symbol.toUpperCase();

    // For now, only support USDC
    if (upperSymbol === "USDC" || upperSymbol === "USD") {
      return this.getDefaultAsset(network);
    }

    // Could extend to support other tokens
    throw new Error(`Unsupported asset: ${symbol} on network ${network}`);
  }

  /**
   * Get the number of decimals for the asset
   *
   * @param _ - The network to use (unused)
   * @returns The number of decimals for the asset
   */
  private getAssetDecimals(_: Network): number {
    // USDC has 6 decimals on all EVM chains
    return 6;
  }
}
