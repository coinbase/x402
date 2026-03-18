import {
  PaymentPayload,
  PaymentRequirements,
  FacilitatorContext,
  SettleResponse,
  VerifyResponse,
} from "@x402/core/types";
import {
  extractEip2612GasSponsoringInfo,
  extractErc20ApprovalGasSponsoringInfo,
  ERC20_APPROVAL_GAS_SPONSORING_KEY,
  resolveErc20ApprovalExtensionSigner,
  type Eip2612GasSponsoringInfo,
  type Erc20ApprovalGasSponsoringFacilitatorExtension,
  type Erc20ApprovalGasSponsoringSigner,
} from "../extensions";
import { getAddress } from "viem";
import {
  PERMIT2_ADDRESS,
  permit2WitnessTypes,
  x402ExactPermit2ProxyABI,
  x402ExactPermit2ProxyAddress,
} from "../../constants";
import * as Errors from "./errors";
import { FacilitatorEvmSigner } from "../../signer";
import { ExactPermit2Payload } from "../../types";
import { getEvmChainId } from "../../utils";
import { validateErc20ApprovalForPayment } from "./erc20approval";
import {
  simulatePermit2Settle,
  simulatePermit2SettleWithPermit,
  simulatePermit2SettleWithErc20Approval,
  diagnosePermit2SimulationFailure,
  checkPermit2Prerequisites,
  splitEip2612Signature,
  buildPermit2SettleArgs,
  encodePermit2SettleCalldata,
  waitAndReturn,
  mapSettleError,
  validateEip2612PermitForPayment,
} from "./permit2-utils";

export interface VerifyPermit2Options {
  /** Run onchain simulation. Defaults to true. */
  simulate?: boolean;
}

export interface Permit2FacilitatorConfig {
  /**
   * If enabled, simulates transaction before settling. Defaults to false,
   * i.e. only simulate during verify.
   *
   * @default false
   */
  simulateInSettle?: boolean;
}

/**
 * Verifies a Permit2 payment payload.
 *
 * Handles all Permit2 verification paths:
 * - Standard: checks on-chain Permit2 allowance
 * - EIP-2612: validates the EIP-2612 permit extension when allowance is insufficient
 * - ERC-20 approval: validates the pre-signed approve tx extension when allowance is insufficient
 *
 * @param signer - The facilitator signer for contract reads
 * @param payload - The payment payload to verify
 * @param requirements - The payment requirements
 * @param permit2Payload - The Permit2 specific payload
 * @param context - Optional facilitator context for extension-provided capabilities
 * @param options - Optional verification options (e.g. simulate)
 * @returns Promise resolving to verification response
 */
export async function verifyPermit2(
  signer: FacilitatorEvmSigner,
  payload: PaymentPayload,
  requirements: PaymentRequirements,
  permit2Payload: ExactPermit2Payload,
  context?: FacilitatorContext,
  options?: VerifyPermit2Options,
): Promise<VerifyResponse> {
  const payer = permit2Payload.permit2Authorization.from;

  if (payload.accepted.scheme !== "exact" || requirements.scheme !== "exact") {
    return {
      isValid: false,
      invalidReason: Errors.ErrUnsupportedPayloadType,
      payer,
    };
  }

  if (payload.accepted.network !== requirements.network) {
    return {
      isValid: false,
      invalidReason: Errors.ErrNetworkMismatch,
      payer,
    };
  }

  const chainId = getEvmChainId(requirements.network);
  const tokenAddress = getAddress(requirements.asset);

  if (
    getAddress(permit2Payload.permit2Authorization.spender) !==
    getAddress(x402ExactPermit2ProxyAddress)
  ) {
    return {
      isValid: false,
      invalidReason: Errors.ErrPermit2InvalidSpender,
      payer,
    };
  }

  if (
    getAddress(permit2Payload.permit2Authorization.witness.to) !== getAddress(requirements.payTo)
  ) {
    return {
      isValid: false,
      invalidReason: Errors.ErrPermit2RecipientMismatch,
      payer,
    };
  }

  const now = Math.floor(Date.now() / 1000);
  if (BigInt(permit2Payload.permit2Authorization.deadline) < BigInt(now + 6)) {
    return {
      isValid: false,
      invalidReason: Errors.ErrPermit2DeadlineExpired,
      payer,
    };
  }

  if (BigInt(permit2Payload.permit2Authorization.witness.validAfter) > BigInt(now)) {
    return {
      isValid: false,
      invalidReason: Errors.ErrPermit2NotYetValid,
      payer,
    };
  }

  // Verify amount exactly matches requirements
  if (
    BigInt(permit2Payload.permit2Authorization.permitted.amount) !== BigInt(requirements.amount)
  ) {
    return {
      isValid: false,
      invalidReason: Errors.ErrPermit2AmountMismatch,
      payer,
    };
  }

  if (getAddress(permit2Payload.permit2Authorization.permitted.token) !== tokenAddress) {
    return {
      isValid: false,
      invalidReason: Errors.ErrPermit2TokenMismatch,
      payer,
    };
  }

  const permit2TypedData = {
    types: permit2WitnessTypes,
    primaryType: "PermitWitnessTransferFrom" as const,
    domain: {
      name: "Permit2",
      chainId,
      verifyingContract: PERMIT2_ADDRESS,
    },
    message: {
      permitted: {
        token: getAddress(permit2Payload.permit2Authorization.permitted.token),
        amount: BigInt(permit2Payload.permit2Authorization.permitted.amount),
      },
      spender: getAddress(permit2Payload.permit2Authorization.spender),
      nonce: BigInt(permit2Payload.permit2Authorization.nonce),
      deadline: BigInt(permit2Payload.permit2Authorization.deadline),
      witness: {
        to: getAddress(permit2Payload.permit2Authorization.witness.to),
        validAfter: BigInt(permit2Payload.permit2Authorization.witness.validAfter),
      },
    },
  };

  // Verify signature
  // Note: verifyTypedData is implementation-dependent and pluggable on FacilitatorEvmSigner
  // Some implementations only do EOA-style ECDSA recovery (e.g. viem/utils verifyTypedData, ethers.verifyTypedData)
  // Viem's publicClient.verifyTypedData supports EOA and Smart Contract Account (ERC-1271 / ERC-6492) signature verification
  let signatureValid = false;
  try {
    signatureValid = await signer.verifyTypedData({
      address: payer,
      ...permit2TypedData,
      signature: permit2Payload.signature,
    });
  } catch {
    signatureValid = false;
  }

  if (!signatureValid) {
    // Check if the payer is a deployed smart contract
    const bytecode = await signer.getCode({ address: payer });
    const isDeployedContract = bytecode && bytecode !== "0x";

    if (!isDeployedContract) {
      return {
        isValid: false,
        invalidReason: Errors.ErrPermit2InvalidSignature,
        payer,
      };
    }
    // Deployed smart contract: fall through to simulation
  }

  // If simulation is disabled, return early
  if (options?.simulate === false) {
    return { isValid: true, invalidReason: undefined, payer };
  }

  // Branch: EIP-2612 gas sponsoring (atomic settleWithPermit via contract)
  const eip2612Info = extractEip2612GasSponsoringInfo(payload);
  if (eip2612Info) {
    const fieldResult = validateEip2612PermitForPayment(eip2612Info, payer, tokenAddress);
    if (!fieldResult.isValid) {
      return { isValid: false, invalidReason: fieldResult.invalidReason!, payer };
    }

    const simOk = await simulatePermit2SettleWithPermit(signer, permit2Payload, eip2612Info);
    if (!simOk) {
      return diagnosePermit2SimulationFailure(
        signer,
        tokenAddress,
        permit2Payload,
        requirements.amount,
      );
    }

    return { isValid: true, invalidReason: undefined, payer };
  }

  // Branch: ERC-20 approval gas sponsoring (broadcast approval + settle via extension signer)
  const erc20GasSponsorshipExtension =
    context?.getExtension<Erc20ApprovalGasSponsoringFacilitatorExtension>(
      ERC20_APPROVAL_GAS_SPONSORING_KEY,
    );
  if (erc20GasSponsorshipExtension) {
    const erc20Info = extractErc20ApprovalGasSponsoringInfo(payload);
    if (erc20Info) {
      const fieldResult = await validateErc20ApprovalForPayment(erc20Info, payer, tokenAddress);
      if (!fieldResult.isValid) {
        return { isValid: false, invalidReason: fieldResult.invalidReason!, payer };
      }

      const extensionSigner = resolveErc20ApprovalExtensionSigner(
        erc20GasSponsorshipExtension,
        requirements.network,
      );

      if (extensionSigner?.simulateTransactions) {
        const simOk = await simulatePermit2SettleWithErc20Approval(
          extensionSigner,
          permit2Payload,
          erc20Info,
        );
        if (!simOk) {
          return diagnosePermit2SimulationFailure(
            signer,
            tokenAddress,
            permit2Payload,
            requirements.amount,
          );
        }
        return { isValid: true, invalidReason: undefined, payer };
      }

      // Fallback to prerequisite-only check if simulateTransactions is not available
      return checkPermit2Prerequisites(signer, tokenAddress, payer, requirements.amount);
    }
  }

  // Branch: standard settle (allowance already on-chain)
  const simOk = await simulatePermit2Settle(signer, permit2Payload);
  if (!simOk) {
    return diagnosePermit2SimulationFailure(
      signer,
      tokenAddress,
      permit2Payload,
      requirements.amount,
    );
  }

  return { isValid: true, invalidReason: undefined, payer };
}

/**
 * Settles a Permit2 payment. Single entry point for all Permit2 settlement paths:
 *
 * 1. EIP-2612 extension present -> settleWithPermit (atomic single tx via contract)
 * 2. ERC-20 approval extension present + extension signer -> broadcast approval + settle (via extension signer)
 * 3. Standard -> settle directly (allowance already on-chain)
 *
 * @param signer - The base facilitator signer for contract writes
 * @param payload - The payment payload to settle
 * @param requirements - The payment requirements
 * @param permit2Payload - The Permit2 specific payload
 * @param context - Optional facilitator context for extension-provided capabilities
 * @param config - Optional facilitator config (simulateInSettle)
 * @returns Promise resolving to settlement response
 */
export async function settlePermit2(
  signer: FacilitatorEvmSigner,
  payload: PaymentPayload,
  requirements: PaymentRequirements,
  permit2Payload: ExactPermit2Payload,
  context?: FacilitatorContext,
  config?: Permit2FacilitatorConfig,
): Promise<SettleResponse> {
  const payer = permit2Payload.permit2Authorization.from;

  const valid = await verifyPermit2(signer, payload, requirements, permit2Payload, context, {
    simulate: config?.simulateInSettle ?? false,
  });
  if (!valid.isValid) {
    return {
      success: false,
      network: payload.accepted.network,
      transaction: "",
      errorReason: valid.invalidReason ?? Errors.ErrInvalidScheme,
      payer,
    };
  }

  // Branch: EIP-2612 gas sponsoring (atomic settleWithPermit via contract)
  const eip2612Info = extractEip2612GasSponsoringInfo(payload);
  if (eip2612Info) {
    return _settlePermit2WithEIP2612(signer, payload, permit2Payload, eip2612Info);
  }

  // Branch: ERC-20 approval gas sponsoring (broadcast approval + settle via extension signer)
  const erc20Info = extractErc20ApprovalGasSponsoringInfo(payload);
  if (erc20Info) {
    const erc20GasSponsorshipExtension =
      context?.getExtension<Erc20ApprovalGasSponsoringFacilitatorExtension>(
        ERC20_APPROVAL_GAS_SPONSORING_KEY,
      );
    const extensionSigner = resolveErc20ApprovalExtensionSigner(
      erc20GasSponsorshipExtension,
      payload.accepted.network,
    );
    if (extensionSigner) {
      return _settlePermit2WithERC20Approval(extensionSigner, payload, permit2Payload, erc20Info);
    }
  }

  // Branch: standard settle (allowance already on-chain)
  return _settlePermit2Direct(signer, payload, permit2Payload);
}

/**
 * Settles via settleWithPermit — includes the EIP-2612 permit atomically in one tx.
 *
 * @param signer - The base facilitator signer
 * @param payload - The payment payload
 * @param permit2Payload - The Permit2 specific payload
 * @param eip2612Info - The EIP-2612 gas sponsoring info from the payload extension
 * @returns Promise resolving to settlement response
 */
async function _settlePermit2WithEIP2612(
  signer: FacilitatorEvmSigner,
  payload: PaymentPayload,
  permit2Payload: ExactPermit2Payload,
  eip2612Info: Eip2612GasSponsoringInfo,
): Promise<SettleResponse> {
  const payer = permit2Payload.permit2Authorization.from;
  try {
    const { v, r, s } = splitEip2612Signature(eip2612Info.signature);

    const tx = await signer.writeContract({
      address: x402ExactPermit2ProxyAddress,
      abi: x402ExactPermit2ProxyABI,
      functionName: "settleWithPermit",
      args: [
        {
          value: BigInt(eip2612Info.amount),
          deadline: BigInt(eip2612Info.deadline),
          r,
          s,
          v,
        },
        ...buildPermit2SettleArgs(permit2Payload),
      ],
    });

    return waitAndReturn(signer, tx, payload, payer);
  } catch (error) {
    return mapSettleError(error, payload, payer);
  }
}

/**
 * Delegates the full approve+settle flow to the extension signer via sendTransactions.
 * The signer owns execution strategy (sequential, batched, or atomic bundling).
 *
 * @param extensionSigner - The extension signer with sendTransactions
 * @param payload - The payment payload
 * @param permit2Payload - The Permit2 specific payload
 * @param erc20Info - Object containing the signed approval transaction
 * @param erc20Info.signedTransaction - The RLP-encoded signed ERC-20 approve transaction hex string
 * @returns Promise resolving to settlement response
 */
async function _settlePermit2WithERC20Approval(
  extensionSigner: Erc20ApprovalGasSponsoringSigner,
  payload: PaymentPayload,
  permit2Payload: ExactPermit2Payload,
  erc20Info: { signedTransaction: string },
): Promise<SettleResponse> {
  const payer = permit2Payload.permit2Authorization.from;

  try {
    const settleData = encodePermit2SettleCalldata(permit2Payload);

    const txHashes = await extensionSigner.sendTransactions([
      erc20Info.signedTransaction as `0x${string}`,
      { to: x402ExactPermit2ProxyAddress, data: settleData, gas: BigInt(300_000) },
    ]);

    const settleTxHash = txHashes[txHashes.length - 1];
    return waitAndReturn(extensionSigner, settleTxHash, payload, payer);
  } catch (error) {
    return mapSettleError(error, payload, payer);
  }
}

/**
 * Standard Permit2 settle — allowance is already on-chain.
 *
 * @param signer - The base facilitator signer
 * @param payload - The payment payload
 * @param permit2Payload - The Permit2 specific payload
 * @returns Promise resolving to settlement response
 */
async function _settlePermit2Direct(
  signer: FacilitatorEvmSigner,
  payload: PaymentPayload,
  permit2Payload: ExactPermit2Payload,
): Promise<SettleResponse> {
  const payer = permit2Payload.permit2Authorization.from;
  try {
    const tx = await signer.writeContract({
      address: x402ExactPermit2ProxyAddress,
      abi: x402ExactPermit2ProxyABI,
      functionName: "settle",
      args: buildPermit2SettleArgs(permit2Payload),
    });

    return waitAndReturn(signer, tx, payload, payer);
  } catch (error) {
    return mapSettleError(error, payload, payer);
  }
}
