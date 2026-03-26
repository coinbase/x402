import {
  Network,
  PaymentPayload,
  PaymentRequirements,
  SchemeNetworkFacilitator,
  SettleResponse,
  VerifyResponse,
} from "@x402/core/types";
import {
  encodeFunctionData,
  getAddress,
  Hex,
  isAddressEqual,
  parseErc6492Signature,
  parseSignature,
} from "viem";
import {
  authorizationTypes,
  delegationManagerABI,
  eip3009ABI,
  erc20TransferABI,
  ERC7579_SINGLE_CALL_MODE,
} from "../../constants";
import { FacilitatorEvmSigner } from "../../signer";
import {
  ExactEIP3009Payload,
  ExactERC7710Payload,
  ExactEvmPayloadV2,
  isEIP3009Payload,
  isERC7710Payload,
} from "../../types";

export interface ExactEvmSchemeConfig {
  /**
   * If enabled, the facilitator will deploy ERC-4337 smart wallets
   * via EIP-6492 when encountering undeployed contract signatures.
   *
   * @default false
   */
  deployERC4337WithEIP6492?: boolean;
}

/**
 * EVM facilitator implementation for the Exact payment scheme.
 */
export class ExactEvmScheme implements SchemeNetworkFacilitator {
  readonly scheme = "exact";
  readonly caipFamily = "eip155:*";
  private readonly config: Required<ExactEvmSchemeConfig>;

  /**
   * Creates a new ExactEvmFacilitator instance.
   *
   * @param signer - The EVM signer for facilitator operations
   * @param config - Optional configuration for the facilitator
   */
  constructor(
    private readonly signer: FacilitatorEvmSigner,
    config?: ExactEvmSchemeConfig,
  ) {
    this.config = {
      deployERC4337WithEIP6492: config?.deployERC4337WithEIP6492 ?? false,
    };
  }

  /**
   * Get mechanism-specific extra data for the supported kinds endpoint.
   * For EVM, includes facilitator addresses for ERC-7710 delegation support.
   *
   * @param _ - The network identifier (unused for EVM, addresses are network-agnostic)
   * @returns Extra data including facilitator addresses
   */
  getExtra(_: string): Record<string, unknown> | undefined {
    // Include facilitator addresses so clients can create ERC-7710 delegations
    // that authorize these addresses to redeem payments
    return {
      facilitators: [...this.signer.getAddresses()],
    };
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
      const payer = isERC7710Payload(exactEvmPayload)
        ? exactEvmPayload.delegator
        : (exactEvmPayload as ExactEIP3009Payload).authorization.from;
      return {
        isValid: false,
        invalidReason: "unsupported_scheme",
        payer,
      };
    }

    // Verify network matches
    if (payload.accepted.network !== requirements.network) {
      const payer = isERC7710Payload(exactEvmPayload)
        ? exactEvmPayload.delegator
        : (exactEvmPayload as ExactEIP3009Payload).authorization.from;
      return {
        isValid: false,
        invalidReason: "network_mismatch",
        payer,
      };
    }

    // Route to appropriate verification handler based on payload type
    if (isERC7710Payload(exactEvmPayload)) {
      return this.verifyERC7710(exactEvmPayload, requirements);
    } else if (isEIP3009Payload(exactEvmPayload)) {
      return this.verifyEIP3009(exactEvmPayload, requirements);
    }

    return {
      isValid: false,
      invalidReason: "unsupported_payload_type",
      payer: "unknown",
    };
  }

  /**
   * Verifies an EIP-3009 payment payload.
   */
  private async verifyEIP3009(
    exactEvmPayload: ExactEIP3009Payload,
    requirements: PaymentRequirements,
  ): Promise<VerifyResponse> {
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
      // Signature verification failed - could be an undeployed smart wallet
      // Check if smart wallet is deployed
      const signature = exactEvmPayload.signature!;
      const signatureLength = signature.startsWith("0x") ? signature.length - 2 : signature.length;
      const isSmartWallet = signatureLength > 130; // 65 bytes = 130 hex chars for EOA

      if (isSmartWallet) {
        const payerAddress = exactEvmPayload.authorization.from;
        const bytecode = await this.signer.getCode({ address: payerAddress });

        if (!bytecode || bytecode === "0x") {
          // Wallet is not deployed. Check if it's EIP-6492 with deployment info.
          // EIP-6492 signatures contain factory address and calldata needed for deployment.
          // Non-EIP-6492 undeployed wallets cannot succeed (no way to deploy them).
          const erc6492Data = parseErc6492Signature(signature);
          const hasDeploymentInfo =
            erc6492Data.address &&
            erc6492Data.data &&
            !isAddressEqual(erc6492Data.address, "0x0000000000000000000000000000000000000000");

          if (!hasDeploymentInfo) {
            // Non-EIP-6492 undeployed smart wallet - will always fail at settlement
            // since EIP-3009 requires on-chain EIP-1271 validation
            return {
              isValid: false,
              invalidReason: "invalid_exact_evm_payload_undeployed_smart_wallet",
              payer: payerAddress,
            };
          }
          // EIP-6492 signature with deployment info - allow through
          // Facilitators with sponsored deployment support can handle this in settle()
        } else {
          // Wallet is deployed but signature still failed - invalid signature
          return {
            isValid: false,
            invalidReason: "invalid_exact_evm_payload_signature",
            payer: exactEvmPayload.authorization.from,
          };
        }
      } else {
        // EOA signature failed
        return {
          isValid: false,
          invalidReason: "invalid_exact_evm_payload_signature",
          payer: exactEvmPayload.authorization.from,
        };
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
        address: getAddress(requirements.asset),
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
   * Verifies an ERC-7710 delegation payment payload via simulation.
   *
   * Unlike EIP-3009, ERC-7710 verification is performed entirely through simulation.
   * The permissionContext is opaque to the facilitator but verifiable by simulating
   * the intended redeemDelegations call.
   */
  private async verifyERC7710(
    payload: ExactERC7710Payload,
    requirements: PaymentRequirements,
  ): Promise<VerifyResponse> {
    const delegator = getAddress(payload.delegator);
    const delegationManager = getAddress(payload.delegationManager);
    const erc20Address = getAddress(requirements.asset);
    const payTo = getAddress(requirements.payTo);
    const amount = BigInt(requirements.amount);

    // Check delegator balance first
    try {
      const balance = (await this.signer.readContract({
        address: erc20Address,
        abi: eip3009ABI,
        functionName: "balanceOf",
        args: [delegator],
      })) as bigint;

      if (balance < amount) {
        return {
          isValid: false,
          invalidReason: "insufficient_funds",
          payer: delegator,
        };
      }
    } catch {
      // If we can't check balance, continue with simulation
    }

    // Build the execution call data for ERC-20 transfer
    const executionCallData = this.buildERC7710ExecutionCallData(erc20Address, payTo, amount);

    // Simulate the redeemDelegations call
    try {
      await this.signer.simulateContract({
        address: delegationManager,
        abi: delegationManagerABI,
        functionName: "redeemDelegations",
        args: [
          [payload.permissionContext], // bytes[] - permission contexts
          [ERC7579_SINGLE_CALL_MODE], // bytes32[] - execution modes
          [executionCallData], // bytes[] - execution call datas
        ],
      });

      // Simulation succeeded - delegation is valid
      return {
        isValid: true,
        invalidReason: undefined,
        payer: delegator,
      };
    } catch (error) {
      console.error("ERC-7710 simulation failed:", error);
      return {
        isValid: false,
        invalidReason: "erc7710_simulation_failed",
        payer: delegator,
      };
    }
  }

  /**
   * Builds the execution call data for ERC-7710 redeemDelegations.
   *
   * The executionCallData encodes the target (ERC-20 contract), value (0 for token transfer),
   * and calldata (transfer function call) according to ERC-7579 single execution format.
   */
  private buildERC7710ExecutionCallData(
    tokenAddress: Hex,
    recipient: Hex,
    amount: bigint,
  ): Hex {
    // Encode the ERC-20 transfer call
    const transferCallData = encodeFunctionData({
      abi: erc20TransferABI,
      functionName: "transfer",
      args: [recipient, amount],
    });

    // ERC-7579 single execution format: target (20 bytes) + value (32 bytes) + calldata
    // Pack as: abi.encodePacked(target, value, calldata)
    const targetPadded = tokenAddress.toLowerCase().slice(2); // 20 bytes (40 hex chars)
    const valuePadded = BigInt(0).toString(16).padStart(64, "0"); // 32 bytes for value (0 ETH)
    const calldataHex = transferCallData.slice(2); // remove 0x prefix

    return `0x${targetPadded}${valuePadded}${calldataHex}` as Hex;
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
      const payer = isERC7710Payload(exactEvmPayload)
        ? exactEvmPayload.delegator
        : (exactEvmPayload as ExactEIP3009Payload).authorization.from;
      return {
        success: false,
        network: payload.accepted.network,
        transaction: "",
        errorReason: valid.invalidReason ?? "invalid_scheme",
        payer,
      };
    }

    // Route to appropriate settlement handler based on payload type
    if (isERC7710Payload(exactEvmPayload)) {
      return this.settleERC7710(exactEvmPayload, requirements, payload.accepted.network);
    } else if (isEIP3009Payload(exactEvmPayload)) {
      return this.settleEIP3009(exactEvmPayload, requirements, payload.accepted.network);
    }

    return {
      success: false,
      errorReason: "unsupported_payload_type",
      transaction: "",
      network: payload.accepted.network,
      payer: "unknown",
    };
  }

  /**
   * Settles an EIP-3009 payment by executing transferWithAuthorization.
   */
  private async settleEIP3009(
    exactEvmPayload: ExactEIP3009Payload,
    requirements: PaymentRequirements,
    network: Network,
  ): Promise<SettleResponse> {
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
          errorReason: "invalid_transaction_state",
          transaction: tx,
          network,
          payer: exactEvmPayload.authorization.from,
        };
      }

      return {
        success: true,
        transaction: tx,
        network,
        payer: exactEvmPayload.authorization.from,
      };
    } catch (error) {
      console.error("Failed to settle EIP-3009 transaction:", error);
      return {
        success: false,
        errorReason: "transaction_failed",
        transaction: "",
        network,
        payer: exactEvmPayload.authorization.from,
      };
    }
  }

  /**
   * Settles an ERC-7710 delegation payment by calling redeemDelegations.
   */
  private async settleERC7710(
    payload: ExactERC7710Payload,
    requirements: PaymentRequirements,
    network: Network,
  ): Promise<SettleResponse> {
    const delegator = getAddress(payload.delegator);
    const delegationManager = getAddress(payload.delegationManager);
    const erc20Address = getAddress(requirements.asset);
    const payTo = getAddress(requirements.payTo);
    const amount = BigInt(requirements.amount);

    // Build the execution call data for ERC-20 transfer
    const executionCallData = this.buildERC7710ExecutionCallData(erc20Address, payTo, amount);

    try {
      // Execute redeemDelegations
      const tx = await this.signer.writeContract({
        address: delegationManager,
        abi: delegationManagerABI,
        functionName: "redeemDelegations",
        args: [
          [payload.permissionContext], // bytes[] - permission contexts
          [ERC7579_SINGLE_CALL_MODE], // bytes32[] - execution modes
          [executionCallData], // bytes[] - execution call datas
        ],
      });

      // Wait for transaction confirmation
      const receipt = await this.signer.waitForTransactionReceipt({ hash: tx });

      if (receipt.status !== "success") {
        return {
          success: false,
          errorReason: "invalid_transaction_state",
          transaction: tx,
          network,
          payer: delegator,
        };
      }

      return {
        success: true,
        transaction: tx,
        network,
        payer: delegator,
      };
    } catch (error) {
      console.error("Failed to settle ERC-7710 transaction:", error);
      return {
        success: false,
        errorReason: "transaction_failed",
        transaction: "",
        network,
        payer: delegator,
      };
    }
  }
}
