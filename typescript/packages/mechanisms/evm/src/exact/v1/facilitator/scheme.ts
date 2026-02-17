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
  getAddress,
  hashTypedData,
  Hex,
  isAddressEqual,
  parseErc6492Signature,
  parseSignature,
} from "viem";
import {
  authorizationTypes,
  EIP1271_MAGIC_VALUE,
  eip1271ABI,
  eip3009ABI,
} from "../../../constants";
import { FacilitatorEvmSigner } from "../../../signer";
import { ExactEvmPayloadV1 } from "../../../types";
import { getEvmChainId } from "../../../utils";
import { EvmNetworkV1 } from "../../../v1";

export interface ExactEvmSchemeV1Config {
  /**
   * If enabled, the facilitator will deploy ERC-4337 smart wallets
   * via EIP-6492 when encountering undeployed contract signatures.
   *
   * @default false
   */
  deployERC4337WithEIP6492?: boolean;
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
    const requirementsV1 = requirements as unknown as PaymentRequirementsV1;
    const payloadV1 = payload as unknown as PaymentPayloadV1;
    const exactEvmPayload = payload.payload as ExactEvmPayloadV1;

    // Verify scheme matches
    if (payloadV1.scheme !== "exact" || requirements.scheme !== "exact") {
      return {
        isValid: false,
        invalidReason: "unsupported_scheme",
        payer: exactEvmPayload.authorization.from,
      };
    }

    // Get chain configuration
    let chainId: number;
    try {
      chainId = getEvmChainId(payloadV1.network as EvmNetworkV1);
    } catch {
      return {
        isValid: false,
        invalidReason: `invalid_network`,
        payer: exactEvmPayload.authorization.from,
      };
    }

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
    if (payloadV1.network !== requirements.network) {
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

    // Verify signature
    const signedPayload = exactEvmPayload.signature!;
    const erc6492Data = parseErc6492Signature(signedPayload);
    const signatureLength = erc6492Data.signature.startsWith("0x")
      ? erc6492Data.signature.length - 2
      : erc6492Data.signature.length;

    let isValidSignature = false;
    try {
      isValidSignature = await this.signer.verifyTypedData({
        address: exactEvmPayload.authorization.from,
        ...permitTypedData,
        signature: signedPayload,
      });
    } catch {
      isValidSignature = false;
    }

    if (!isValidSignature) {
      const payerAddress = exactEvmPayload.authorization.from;
      let bytecode: `0x${string}` | undefined;
      try {
        bytecode = await this.signer.getCode({ address: payerAddress });
      } catch {
        bytecode = undefined;
      }

      if (bytecode && bytecode !== "0x") {
        const digest = hashTypedData(permitTypedData);

        try {
          const magicValue = (await this.signer.readContract({
            address: payerAddress,
            abi: eip1271ABI,
            functionName: "isValidSignature",
            args: [digest, erc6492Data.signature],
          })) as unknown;

          if (typeof magicValue !== "string" || magicValue.toLowerCase() !== EIP1271_MAGIC_VALUE) {
            return {
              isValid: false,
              invalidReason: "invalid_exact_evm_payload_signature",
              payer: payerAddress,
            };
          }
        } catch {
          return {
            isValid: false,
            invalidReason: "invalid_exact_evm_payload_signature",
            payer: payerAddress,
          };
        }
      } else {
        const hasDeploymentInfo =
          erc6492Data.address &&
          erc6492Data.data &&
          !isAddressEqual(erc6492Data.address, "0x0000000000000000000000000000000000000000");

        if (hasDeploymentInfo) {
          if (this.config.deployERC4337WithEIP6492) {
            // Facilitators with sponsored deployment support can handle this in settle().
          } else {
            return {
              isValid: false,
              invalidReason: "invalid_exact_evm_payload_undeployed_smart_wallet",
              payer: payerAddress,
            };
          }
        } else if (signatureLength > 130) {
          return {
            isValid: false,
            invalidReason: "invalid_exact_evm_payload_undeployed_smart_wallet",
            payer: payerAddress,
          };
        } else {
          return {
            isValid: false,
            invalidReason: "invalid_exact_evm_payload_signature",
            payer: payerAddress,
          };
        }
      }
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

      if (BigInt(balance) < BigInt(requirementsV1.maxAmountRequired)) {
        return {
          isValid: false,
          invalidReason: "insufficient_funds",
          invalidMessage: `Insufficient funds to complete the payment. Required: ${requirementsV1.maxAmountRequired} ${requirements.asset}, Available: ${balance.toString()} ${requirements.asset}. Please add funds to your wallet and try again.`,
          payer: exactEvmPayload.authorization.from,
        };
      }
    } catch {
      // If we can't check balance, continue with other validations
    }

    // Verify amount is sufficient
    if (BigInt(exactEvmPayload.authorization.value) < BigInt(requirementsV1.maxAmountRequired)) {
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
    const valid = await this.verify(payload, requirements);
    if (!valid.isValid) {
      return {
        success: false,
        network: payloadV1.network,
        transaction: "",
        errorReason: valid.invalidReason ?? "invalid_scheme",
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

      let bytecode: `0x${string}` | undefined;
      try {
        bytecode = await this.signer.getCode({ address: exactEvmPayload.authorization.from });
      } catch {
        bytecode = undefined;
      }
      const isContractWallet = Boolean(bytecode && bytecode !== "0x");

      let tx: Hex;
      if (!isContractWallet) {
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
        // For smart wallets, use the bytes signature overload regardless of signature length.
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
          errorReason: "invalid_transaction_state",
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
        errorReason: "transaction_failed",
        transaction: "",
        network: payloadV1.network,
        payer: exactEvmPayload.authorization.from,
      };
    }
  }
}
