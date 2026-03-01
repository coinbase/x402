import type { PaymentPayload, PaymentRequirements, SchemeNetworkClient } from "@x402/core/types";
import {
  getAddress,
  createPublicClient,
  http,
  type Chain,
  type PublicClient,
  type Transport,
  Hex,
} from "viem";
import * as allChains from "viem/chains";
import { defineChain } from "viem";
import type { SmartAccount } from "viem/account-abstraction";
import type { BundlerClient } from "./bundler";
import { ViemBundlerClient } from "./bundler/viem";
import type { UserOperationSigner } from "./signers";
import { SafeAccountSigner } from "./signers";
import { extractUserOperationCapability } from "../../../erc4337/utils";
import type { Erc4337Payload } from "../../../erc4337/types";
import { buildERC20TransferCallData } from "./utils/callData";
import { userOpToJson } from "./utils/userOperation";
import { PaymentCreationError, parseAAError } from "./errors";
import { resolveChainId } from "../../../erc4337/networks";

/**
 * Base configuration properties shared by all configuration variants
 */
interface ExactEvmSchemeERC4337ConfigBase {
  /**
   * Entry point address (EntryPoint v0.7)
   * Optional - can be provided in payment requirements if not set here
   */
  entrypoint?: Hex;

  /**
   * Bundler URL (optional, can be provided in payment requirements)
   */
  bundlerUrl?: string;
}

/**
 * Configuration variant when bundlerClient is explicitly provided.
 */
type ExactEvmSchemeERC4337ConfigWithBundler = ExactEvmSchemeERC4337ConfigBase & {
  bundlerClient: BundlerClient;
  signer: UserOperationSigner;
} & {
  account?: never;
  publicClient?: never;
};

/**
 * Configuration variant when bundlerClient is not provided.
 */
type ExactEvmSchemeERC4337ConfigWithAccount = ExactEvmSchemeERC4337ConfigBase & {
  bundlerClient?: never;
} & {
  account: SmartAccount;
  signer?: UserOperationSigner;
  publicClient?: PublicClient<Transport, Chain>;
};

/**
 * Configuration for the ERC-4337 client scheme.
 *
 * This is a discriminated union that enforces type-safe combinations:
 * - Either `bundlerClient` is provided (account and publicClient must NOT be provided)
 * - Or `account` is provided when bundlerClient is not (for dynamic creation, publicClient optional)
 */
export type ExactEvmSchemeERC4337Config =
  | ExactEvmSchemeERC4337ConfigWithBundler
  | ExactEvmSchemeERC4337ConfigWithAccount;

/**
 * Resolves a network string to a Chain object.
 * Handles both CAIP-2 format ("eip155:84532") and v1 plain names ("base-sepolia").
 *
 * @param network - The network string to resolve (CAIP-2 or v1 name)
 * @returns The resolved Chain object
 */
function resolveChain(network: string): Chain {
  const chainId = resolveChainId(network);

  const known = Object.values(allChains).find((c: Chain) => c.id === chainId);
  if (known) return known;

  return defineChain({
    id: chainId,
    name: network,
    nativeCurrency: { name: "Ether", symbol: "ETH", decimals: 18 },
    rpcUrls: { default: { http: [] } },
  });
}

/**
 * Creates a default public client from a network string.
 *
 * @param network - The network string to create a client for
 * @returns A public client connected to the resolved chain
 */
function createDefaultPublicClient(network: string): PublicClient<Transport, Chain> {
  const chain = resolveChain(network);
  return createPublicClient({
    chain,
    transport: http(),
  });
}

/**
 * EVM client implementation for the Exact payment scheme using ERC-4337 UserOperations.
 *
 * This implementation creates payment payloads by building and signing UserOperations
 * that execute ERC20 transfers. The UserOperations are prepared using a bundler client
 * and signed using a user operation signer (e.g., Safe account, EOA).
 *
 * Supports minimal configuration: when bundlerClient is not provided and
 * PaymentRequirements.extra.userOperation.supported is true, a ViemBundlerClient
 * will be created dynamically from the payment requirements.
 */
export class ExactEvmSchemeERC4337 implements SchemeNetworkClient {
  readonly scheme = "exact";

  private readonly bundlerClient?: BundlerClient;
  private readonly account?: SmartAccount;
  private readonly publicClient?: PublicClient<Transport, Chain>;
  private readonly signer: UserOperationSigner;
  private readonly entrypoint?: Hex;
  private readonly bundlerUrl?: string;

  /**
   * Creates a new ExactEvmSchemeERC4337 instance.
   *
   * @param config - The ERC-4337 client scheme configuration
   */
  constructor(config: ExactEvmSchemeERC4337Config) {
    this.bundlerClient = config.bundlerClient;
    this.account = config.account;
    this.publicClient = config.publicClient;
    this.entrypoint = config.entrypoint;
    this.bundlerUrl = config.bundlerUrl;

    // Validate: if bundlerClient is not provided, account must be provided
    if (!this.bundlerClient && !this.account) {
      throw new Error(
        "Either bundlerClient or account must be provided. " +
          "If bundlerClient is not provided, account (SmartAccount) is required for dynamic bundlerClient creation.",
      );
    }

    // Handle signer: use provided signer or auto-create from account
    if (config.signer) {
      this.signer = config.signer;
    } else if (this.account) {
      // Auto-create signer from account if not provided
      if (!this.account.signUserOperation) {
        throw new Error(
          "Account does not support signUserOperation. " +
            "Either provide a signer explicitly or use an account that supports signUserOperation.",
        );
      }
      this.signer = new SafeAccountSigner(this.account);
    } else {
      throw new Error(
        "Signer is required when bundlerClient is provided. " +
          "Either provide a signer explicitly or use account-based configuration.",
      );
    }
  }

  /**
   * Creates a payment payload for the Exact scheme using ERC-4337 UserOperations.
   *
   * @param x402Version - The x402 protocol version
   * @param paymentRequirements - The payment requirements from the server
   * @returns The payment payload containing the signed UserOperation
   */
  async createPaymentPayload(
    x402Version: number,
    paymentRequirements: PaymentRequirements,
  ): Promise<Pick<PaymentPayload, "x402Version" | "payload">> {
    // Extract user operation capability (optional - config defaults used when missing)
    const capability = extractUserOperationCapability(paymentRequirements);

    // Determine which bundlerClient to use
    let bundlerClient: BundlerClient;

    if (this.bundlerClient) {
      bundlerClient = this.bundlerClient;
    } else {
      if (!this.account) {
        throw new Error(
          "Account (SmartAccount) is required when bundlerClient is not provided. " +
            "Either provide bundlerClient in config or account for dynamic creation.",
        );
      }

      // Get bundler URL (prioritize config defaults over PaymentRequirements)
      const bundlerUrl = this.bundlerUrl ?? capability?.bundlerUrl;
      if (!bundlerUrl) {
        throw new PaymentCreationError("Bundler URL not provided", {
          phase: "validation",
          reason:
            "Set bundlerUrl in ExactEvmSchemeERC4337Config or in payment requirements extra.userOperation.bundlerUrl",
          network: paymentRequirements.network,
        });
      }

      const chain = resolveChain(paymentRequirements.network);
      const publicClient =
        this.publicClient ?? createDefaultPublicClient(paymentRequirements.network);

      bundlerClient = new ViemBundlerClient({
        publicClient,
        account: this.account,
        chain,
        bundlerUrl,
      });
    }

    // Get entry point (prioritize config defaults over PaymentRequirements)
    const entryPoint = this.entrypoint ?? (capability?.entrypoint as `0x${string}` | undefined);

    if (!entryPoint) {
      throw new PaymentCreationError("Entry point not provided", {
        phase: "validation",
        reason:
          "Set entrypoint in ExactEvmSchemeERC4337Config or in payment requirements extra.userOperation.entrypoint",
        network: paymentRequirements.network,
      });
    }

    // Get bundler URL (prioritize config defaults over PaymentRequirements)
    const bundlerUrl = this.bundlerUrl ?? capability?.bundlerUrl;
    if (!bundlerUrl) {
      throw new PaymentCreationError("Bundler URL not provided", {
        phase: "validation",
        reason:
          "Set bundlerUrl in ExactEvmSchemeERC4337Config or in payment requirements extra.userOperation.bundlerUrl",
        network: paymentRequirements.network,
      });
    }

    // Normalize addresses
    const token = getAddress(paymentRequirements.asset);
    const payTo = getAddress(paymentRequirements.payTo);
    // Handle both v2 (amount) and v1 (maxAmountRequired) fields
    const amountStr =
      paymentRequirements.amount ??
      ((paymentRequirements as Record<string, unknown>).maxAmountRequired as string | undefined);
    if (!amountStr) {
      throw new Error("Payment requirements missing amount (v2) or maxAmountRequired (v1)");
    }
    const amount = BigInt(amountStr);

    // Build ERC20 transfer call data
    const callData = buildERC20TransferCallData(token, payTo, amount);

    // Prepare user operation (unsigned)
    let unsignedUserOp;
    try {
      unsignedUserOp = await bundlerClient.prepareUserOperation(
        [
          {
            to: token,
            value: BigInt(0), // ERC20 transfers don't send ETH
            data: callData,
          },
        ],
        entryPoint,
      );
    } catch (error) {
      const aaError = parseAAError(error);
      throw new PaymentCreationError(
        aaError
          ? `Payment preparation failed: ${aaError.reason}`
          : `Payment preparation failed: ${error instanceof Error ? error.message : String(error)}`,
        {
          phase: "preparation",
          reason: aaError?.reason ?? (error instanceof Error ? error.message : String(error)),
          network: paymentRequirements.network,
          code: aaError?.code,
          cause: error,
        },
      );
    }

    // Sign the user operation
    let signature;
    try {
      signature = await this.signer.signUserOperation(unsignedUserOp);
    } catch (error) {
      const aaError = parseAAError(error);
      throw new PaymentCreationError(
        aaError
          ? `Payment signing failed: ${aaError.reason}`
          : `Payment signing failed: ${error instanceof Error ? error.message : String(error)}`,
        {
          phase: "signing",
          reason: aaError?.reason ?? (error instanceof Error ? error.message : String(error)),
          network: paymentRequirements.network,
          code: aaError?.code,
          cause: error,
        },
      );
    }

    // Create signed user operation
    const signedUserOp = {
      ...unsignedUserOp,
      signature,
    };

    // Convert to JSON-RPC format (bigint -> hex)
    const jsonUserOp = userOpToJson(signedUserOp);

    // Build the ERC-4337 payload
    const payload: Erc4337Payload = {
      type: "erc4337",
      entryPoint,
      bundlerRpcUrl: bundlerUrl,
      userOperation: jsonUserOp,
    };

    return {
      x402Version,
      // v1 requires scheme and network at top level
      ...(x402Version === 1 ? { scheme: this.scheme, network: paymentRequirements.network } : {}),
      payload,
    };
  }
}
