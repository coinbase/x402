import {
  PaymentPayload,
  PaymentPayloadV1,
  PaymentRequirements,
  SchemeNetworkFacilitator,
  SettleResponse,
  VerifyResponse,
} from "@x402/core/types";
import { PaymentRequirementsV1 } from "@x402/core/types/v1";
import {
  encodeFunctionData,
  getAddress,
  Hex,
  isAddressEqual,
  parseErc6492Signature,
  parseSignature,
} from "viem";
import { authorizationTypes, eip3009ABI } from "../../../constants";
import { multicall, ContractCall, RawContractCall } from "../../../multicall";
import { FacilitatorEvmSigner } from "../../../signer";
import { ExactEvmPayloadV1 } from "../../../types";
import { EvmNetworkV1, getEvmChainIdV1 } from "../../../v1";
import * as Errors from "../../facilitator/errors";

export interface VerifyV1Options {
  /** Run onchain simulation. Defaults to true. */
  simulate?: boolean;
}

export interface ExactEvmSchemeV1Config {
  /**
   * If enabled, the facilitator will deploy ERC-4337 smart wallets
   * via EIP-6492 when encountering undeployed contract signatures.
   *
   * @default false
   */
  deployERC4337WithEIP6492?: boolean;
  /**
   * If enabled, simulates transaction before settling. Defaults to false, ie only simulate during verify.
   *
   * @default false
   */
  simulateInSettle?: boolean;
}

/**
 * EVM facilitator implementation for the Exact payment scheme (V1).
 */
export class ExactEvmSchemeV1 implements SchemeNetworkFacilitator {
  readonly scheme = "exact";
  readonly caipFamily = "eip155:*";
  private readonly config: Required<ExactEvmSchemeV1Config>;

  /**
   * Creates a new ExactEvmFacilitatorV1 instance.
   *
   * @param signer - The EVM signer for facilitator operations
   * @param config - Optional configuration for the facilitator
   */
  constructor(
    private readonly signer: FacilitatorEvmSigner,
    config?: ExactEvmSchemeV1Config,
  ) {
    this.config = {
      deployERC4337WithEIP6492: config?.deployERC4337WithEIP6492 ?? false,
      simulateInSettle: config?.simulateInSettle ?? false,
    };
  }

  /**
   * Get mechanism-specific extra data for the supported kinds endpoint.
   * For EVM, no extra data is needed.
   *
   * @param _ - The network identifier (unused for EVM)
   * @returns undefined (EVM has no extra data)
   */
  getExtra(_: string): Record<string, unknown> | undefined {
    return undefined;
  }

  /**
   * Get signer addresses used by this facilitator.
   * Returns all addresses this facilitator can use for signing/settling transactions.
   *
   * @param _ - The network identifier (unused for EVM, addresses are network-agnostic)
   * @returns Array of facilitator wallet addresses
   */
  getSigners(_: string): string[] {
    return [...this.signer.getAddresses()];
  }

  /**
   * Verifies a payment payload (V1).
   *
   * @param payload - The payment payload to verify
   * @param requirements - The payment requirements
   * @returns Promise resolving to verification response
   */
  async verify(
    payload: PaymentPayload,
    requirements: PaymentRequirements,
  ): Promise<VerifyResponse> {
    return this._verify(payload, requirements);
  }

  /**
   * Settles a payment by executing the transfer (V1).
   *
   * @param payload - The payment payload to settle
   * @param requirements - The payment requirements
   * @returns Promise resolving to settlement response
   */
  async settle(
    payload: PaymentPayload,
    requirements: PaymentRequirements,
  ): Promise<SettleResponse> {
    const payloadV1 = payload as unknown as PaymentPayloadV1;
    const exactEvmPayload = payload.payload as ExactEvmPayloadV1;

    // Re-verify before settling
    const valid = await this._verify(payload, requirements, {
      simulate: this.config.simulateInSettle ?? false,
    });
    if (!valid.isValid) {
      return {
        success: false,
        network: payloadV1.network,
        transaction: "",
        errorReason: valid.invalidReason ?? Errors.ErrInvalidScheme,
        payer: exactEvmPayload.authorization.from,
      };
    }

    try {
      // Parse ERC-6492 signature if applicable
      const parseResult = parseErc6492Signature(exactEvmPayload.signature!);
      const { signature, address: factoryAddress, data: factoryCalldata } = parseResult;

      // Deploy ERC-4337 smart wallet via EIP-6492 if configured and needed
      if (
        this.config.deployERC4337WithEIP6492 &&
        factoryAddress &&
        factoryCalldata &&
        !isAddressEqual(factoryAddress, "0x0000000000000000000000000000000000000000")
      ) {
        // Check if smart wallet is already deployed
        const payerAddress = exactEvmPayload.authorization.from;
        const bytecode = await this.signer.getCode({ address: payerAddress });

        if (!bytecode || bytecode === "0x") {
          // Wallet not deployed - attempt deployment
          try {
            console.log(`Deploying ERC-4337 smart wallet for ${payerAddress} via EIP-6492`);

            // Send the factory calldata directly as a transaction
            // The factoryCalldata already contains the complete encoded function call
            const deployTx = await this.signer.sendTransaction({
              to: factoryAddress as Hex,
              data: factoryCalldata as Hex,
            });

            // Wait for deployment transaction
            await this.signer.waitForTransactionReceipt({ hash: deployTx });
            console.log(`Successfully deployed smart wallet for ${payerAddress}`);
          } catch (deployError) {
            console.error("Smart wallet deployment failed:", deployError);
            // Deployment failed - cannot proceed
            throw deployError;
          }
        } else {
          console.log(`Smart wallet for ${payerAddress} already deployed, skipping deployment`);
        }
      }

      // Determine if this is an ECDSA signature (EOA) or smart wallet signature
      // ECDSA signatures are exactly 65 bytes (130 hex chars without 0x)
      const signatureLength = signature.startsWith("0x") ? signature.length - 2 : signature.length;
      const isECDSA = signatureLength === 130;

      let tx: Hex;
      if (isECDSA) {
        // For EOA wallets, parse signature into v, r, s and use that overload
        const parsedSig = parseSignature(signature);

        tx = await this.signer.writeContract({
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
            (parsedSig.v as number | undefined) || parsedSig.yParity,
            parsedSig.r,
            parsedSig.s,
          ],
        });
      } else {
        // For smart wallets, use the bytes signature overload
        // The signature contains WebAuthn/P256 or other ERC-1271 compatible signature data
        tx = await this.signer.writeContract({
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
      }

      // Wait for transaction confirmation
      const receipt = await this.signer.waitForTransactionReceipt({ hash: tx });

      if (receipt.status !== "success") {
        return {
          success: false,
          errorReason: Errors.ErrTransactionFailed,
          transaction: tx,
          network: payloadV1.network,
          payer: exactEvmPayload.authorization.from,
        };
      }

      return {
        success: true,
        transaction: tx,
        network: payloadV1.network,
        payer: exactEvmPayload.authorization.from,
      };
    } catch (error) {
      console.error("Failed to settle transaction:", error);
      return {
        success: false,
        errorReason: Errors.ErrTransactionFailed,
        transaction: "",
        network: payloadV1.network,
        payer: exactEvmPayload.authorization.from,
      };
    }
  }

  /**
   * Internal verify with optional simulation control.
   *
   * @param payload - The payment payload to verify
   * @param requirements - The payment requirements
   * @param options - Verification options (e.g. simulate)
   * @returns Promise resolving to verification response
   */
  private async _verify(
    payload: PaymentPayload,
    requirements: PaymentRequirements,
    options?: VerifyV1Options,
  ): Promise<VerifyResponse> {
    const requirementsV1 = requirements as unknown as PaymentRequirementsV1;
    const payloadV1 = payload as unknown as PaymentPayloadV1;
    const exactEvmPayload = payload.payload as ExactEvmPayloadV1;
    const payer = exactEvmPayload.authorization.from;
    let eip6492Deployment: { factoryAddress: string; factoryCalldata: string } | undefined;

    // Verify scheme matches
    if (payloadV1.scheme !== "exact" || requirements.scheme !== "exact") {
      return {
        isValid: false,
        invalidReason: Errors.ErrInvalidScheme,
        payer,
      };
    }

    // Get chain configuration
    let chainId: number;
    try {
      chainId = getEvmChainIdV1(payloadV1.network as EvmNetworkV1);
    } catch {
      return {
        isValid: false,
        invalidReason: Errors.ErrNetworkMismatch,
        payer,
      };
    }

    if (!requirements.extra?.name || !requirements.extra?.version) {
      return {
        isValid: false,
        invalidReason: Errors.ErrMissingEip712Domain,
        payer,
      };
    }

    const { name, version } = requirements.extra;
    const erc20Address = getAddress(requirements.asset);

    // Verify network matches
    if (payloadV1.network !== requirements.network) {
      return {
        isValid: false,
        invalidReason: Errors.ErrNetworkMismatch,
        payer,
      };
    }

    // Build typed data for signature verification
    const permitTypedData = {
      types: authorizationTypes,
      primaryType: "TransferWithAuthorization" as const,
      domain: {
        name,
        version,
        chainId,
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

    // Verify signature (flatten EIP-6492 handling out of catch block)
    let isValid = false;
    try {
      isValid = await this.signer.verifyTypedData({
        address: payer,
        ...permitTypedData,
        signature: exactEvmPayload.signature!,
      });
    } catch {
      isValid = false;
    }

    const signature = exactEvmPayload.signature!;
    const sigLen = signature.startsWith("0x") ? signature.length - 2 : signature.length;

    // Extract EIP-6492 deployment info (factory address + calldata) if present
    const erc6492Data = parseErc6492Signature(signature);
    const hasDeploymentInfo =
      erc6492Data.address &&
      erc6492Data.data &&
      !isAddressEqual(erc6492Data.address, "0x0000000000000000000000000000000000000000");

    if (hasDeploymentInfo) {
      eip6492Deployment = {
        factoryAddress: erc6492Data.address!,
        factoryCalldata: erc6492Data.data!,
      };
    }

    if (!isValid) {
      const isSmartWallet = sigLen > 130; // 65 bytes = 130 hex chars for EOA

      if (!isSmartWallet) {
        return {
          isValid: false,
          invalidReason: Errors.ErrInvalidSignature,
          payer,
        };
      }

      const bytecode = await this.signer.getCode({ address: payer });
      const isDeployed = bytecode && bytecode !== "0x";

      if (!isDeployed && !hasDeploymentInfo) {
        return {
          isValid: false,
          invalidReason: Errors.ErrUndeployedSmartWallet,
          payer,
        };
      }
    }

    // Verify payment recipient matches
    if (getAddress(exactEvmPayload.authorization.to) !== getAddress(requirements.payTo)) {
      return {
        isValid: false,
        invalidReason: Errors.ErrRecipientMismatch,
        payer,
      };
    }

    // Verify validBefore is in the future (with 6 second buffer for block time)
    const now = Math.floor(Date.now() / 1000);
    if (BigInt(exactEvmPayload.authorization.validBefore) < BigInt(now + 6)) {
      return {
        isValid: false,
        invalidReason: Errors.ErrValidBeforeExpired,
        payer,
      };
    }

    // Verify validAfter is not in the future
    if (BigInt(exactEvmPayload.authorization.validAfter) > BigInt(now)) {
      return {
        isValid: false,
        invalidReason: Errors.ErrValidAfterInFuture,
        payer,
      };
    }

    // Verify amount exactly matches requirements
    if (BigInt(exactEvmPayload.authorization.value) !== BigInt(requirementsV1.maxAmountRequired)) {
      return {
        isValid: false,
        invalidReason: Errors.ErrInvalidAuthorizationValue,
        payer,
      };
    }

    // Transaction simulation
    if (options?.simulate !== false) {
      const auth = exactEvmPayload.authorization;
      const transferArgs = [
        getAddress(auth.from),
        getAddress(auth.to),
        BigInt(auth.value),
        BigInt(auth.validAfter),
        BigInt(auth.validBefore),
        auth.nonce,
      ] as const;

      let simulationFailed = false;

      if (eip6492Deployment) {
        const { signature: innerSignature } = parseErc6492Signature(exactEvmPayload.signature!);
        const transferCalldata = encodeFunctionData({
          abi: eip3009ABI,
          functionName: "transferWithAuthorization",
          args: [...transferArgs, innerSignature],
        });

        const results = await multicall(this.signer.readContract.bind(this.signer), [
          {
            address: getAddress(eip6492Deployment.factoryAddress),
            callData: eip6492Deployment.factoryCalldata as Hex,
          } satisfies RawContractCall,
          {
            address: erc20Address,
            callData: transferCalldata,
          } satisfies RawContractCall,
        ]);

        if (results[1]?.status !== "success") {
          simulationFailed = true;
        }
      } else {
        const sig = exactEvmPayload.signature!;
        const sigLength = sig.startsWith("0x") ? sig.length - 2 : sig.length;
        const isECDSA = sigLength === 130;

        try {
          if (isECDSA) {
            const parsedSig = parseSignature(sig);
            await this.signer.readContract({
              address: erc20Address,
              abi: eip3009ABI,
              functionName: "transferWithAuthorization",
              args: [
                ...transferArgs,
                (parsedSig.v as number | undefined) ?? parsedSig.yParity,
                parsedSig.r,
                parsedSig.s,
              ],
            });
          } else {
            await this.signer.readContract({
              address: erc20Address,
              abi: eip3009ABI,
              functionName: "transferWithAuthorization",
              args: [...transferArgs, sig],
            });
          }
        } catch {
          simulationFailed = true;
        }
      }

      if (simulationFailed) {
        return diagnoseSimulationFailure(
          this.signer,
          erc20Address,
          exactEvmPayload,
          requirements,
          requirementsV1.maxAmountRequired,
        );
      }
    }

    return {
      isValid: true,
      invalidReason: undefined,
      payer,
    };
  }
}

/**
 * After simulation fails, runs a single diagnostic multicall to determine the most specific error reason.
 * Checks balanceOf, name, version and authorizationState in one RPC round-trip.
 *
 * @param signer - EVM signer used for the payment
 * @param erc20Address - Address of the ERC-20 token contract
 * @param exactEvmPayload - The EIP-3009 transfer authorization payload
 * @param requirements - Payment requirements to validate against
 * @param maxAmountRequired - Maximum amount required for the payment
 * @returns Promise resolving to the verification result with validity and optional invalid reason
 */
async function diagnoseSimulationFailure(
  signer: FacilitatorEvmSigner,
  erc20Address: `0x${string}`,
  exactEvmPayload: ExactEvmPayloadV1,
  requirements: PaymentRequirements,
  maxAmountRequired: string,
): Promise<VerifyResponse> {
  const payer = exactEvmPayload.authorization.from;

  const diagnosticCalls: ContractCall[] = [
    {
      address: erc20Address,
      abi: eip3009ABI,
      functionName: "balanceOf",
      args: [exactEvmPayload.authorization.from],
    },
    {
      address: erc20Address,
      abi: eip3009ABI,
      functionName: "name",
    },
    {
      address: erc20Address,
      abi: eip3009ABI,
      functionName: "version",
    },
    {
      address: erc20Address,
      abi: eip3009ABI,
      functionName: "authorizationState",
      args: [exactEvmPayload.authorization.from, exactEvmPayload.authorization.nonce],
    },
  ];

  try {
    const results = await multicall(signer.readContract.bind(signer), diagnosticCalls);

    const [balanceResult, nameResult, versionResult, authStateResult] = results;

    if (authStateResult.status === "failure") {
      return { isValid: false, invalidReason: Errors.ErrEip3009NotSupported, payer };
    }

    if (authStateResult.status === "success" && authStateResult.result === true) {
      return { isValid: false, invalidReason: Errors.ErrEip3009NonceAlreadyUsed, payer };
    }

    if (
      nameResult.status === "success" &&
      requirements.extra?.name &&
      nameResult.result !== requirements.extra.name
    ) {
      return { isValid: false, invalidReason: Errors.ErrEip3009TokenNameMismatch, payer };
    }

    if (
      versionResult.status === "success" &&
      requirements.extra?.version &&
      versionResult.result !== requirements.extra.version
    ) {
      return { isValid: false, invalidReason: Errors.ErrEip3009TokenVersionMismatch, payer };
    }

    if (balanceResult.status === "success") {
      const balance = balanceResult.result as bigint;
      if (balance < BigInt(maxAmountRequired)) {
        return {
          isValid: false,
          invalidReason: Errors.ErrEip3009InsufficientBalance,
          invalidMessage: `Insufficient funds to complete the payment. Required: ${maxAmountRequired} ${requirements.asset}, Available: ${balance.toString()} ${requirements.asset}. Please add funds to your wallet and try again.`,
          payer,
        };
      }
    }
  } catch {
    // Diagnostic multicall failed — fall through to generic error
  }

  return { isValid: false, invalidReason: Errors.ErrEip3009SimulationFailed, payer };
}
