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
  type Erc20ApprovalGasSponsoringFacilitatorExtension,
} from "../extensions";
import { getAddress } from "viem";
import {
  eip3009ABI,
  PERMIT2_ADDRESS,
  permit2WitnessTypes,
  x402ExactPermit2ProxyAddress,
  x402ExactPermit2ProxyABI,
} from "../../constants";
import { ErrPermit2AmountMismatch } from "./errors";
import { FacilitatorEvmSigner } from "../../signer";
import { ExactPermit2Payload } from "../../types";
import { getEvmChainId } from "../../utils";
import {
  verifyPermit2Allowance,
  settlePermit2WithEIP2612,
  settlePermit2WithERC20Approval,
  settlePermit2Direct,
  type Permit2ProxyConfig,
} from "../../shared/permit2";

const exactProxyConfig: Permit2ProxyConfig = {
  proxyAddress: x402ExactPermit2ProxyAddress,
  proxyABI: x402ExactPermit2ProxyABI,
};

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
 * @returns Promise resolving to verification response
 */
export async function verifyPermit2(
  signer: FacilitatorEvmSigner,
  payload: PaymentPayload,
  requirements: PaymentRequirements,
  permit2Payload: ExactPermit2Payload,
  context?: FacilitatorContext,
): Promise<VerifyResponse> {
  const payer = permit2Payload.permit2Authorization.from;

  if (payload.accepted.scheme !== "exact" || requirements.scheme !== "exact") {
    return {
      isValid: false,
      invalidReason: "unsupported_scheme",
      payer,
    };
  }

  if (payload.accepted.network !== requirements.network) {
    return {
      isValid: false,
      invalidReason: "network_mismatch",
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
      invalidReason: "invalid_permit2_spender",
      payer,
    };
  }

  if (
    getAddress(permit2Payload.permit2Authorization.witness.to) !== getAddress(requirements.payTo)
  ) {
    return {
      isValid: false,
      invalidReason: "invalid_permit2_recipient_mismatch",
      payer,
    };
  }

  const now = Math.floor(Date.now() / 1000);
  if (BigInt(permit2Payload.permit2Authorization.deadline) < BigInt(now + 6)) {
    return {
      isValid: false,
      invalidReason: "permit2_deadline_expired",
      payer,
    };
  }

  if (BigInt(permit2Payload.permit2Authorization.witness.validAfter) > BigInt(now)) {
    return {
      isValid: false,
      invalidReason: "permit2_not_yet_valid",
      payer,
    };
  }

  // Verify amount exactly matches requirements
  if (
    BigInt(permit2Payload.permit2Authorization.permitted.amount) !== BigInt(requirements.amount)
  ) {
    return {
      isValid: false,
      invalidReason: ErrPermit2AmountMismatch,
      payer,
    };
  }

  if (getAddress(permit2Payload.permit2Authorization.permitted.token) !== tokenAddress) {
    return {
      isValid: false,
      invalidReason: "permit2_token_mismatch",
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

  try {
    const isValid = await signer.verifyTypedData({
      address: payer,
      ...permit2TypedData,
      signature: permit2Payload.signature,
    });

    if (!isValid) {
      return {
        isValid: false,
        invalidReason: "invalid_permit2_signature",
        payer,
      };
    }
  } catch {
    return {
      isValid: false,
      invalidReason: "invalid_permit2_signature",
      payer,
    };
  }

  // Check Permit2 allowance — if insufficient, try gas sponsoring extensions
  const allowanceResult = await verifyPermit2Allowance(
    signer,
    payload,
    requirements,
    payer,
    tokenAddress,
    context,
  );
  if (allowanceResult) {
    return allowanceResult;
  }

  try {
    const balance = (await signer.readContract({
      address: tokenAddress,
      abi: eip3009ABI,
      functionName: "balanceOf",
      args: [payer],
    })) as bigint;

    if (balance < BigInt(requirements.amount)) {
      return {
        isValid: false,
        invalidReason: "insufficient_funds",
        invalidMessage: `Insufficient funds to complete the payment. Required: ${requirements.amount} ${requirements.asset}, Available: ${balance.toString()} ${requirements.asset}. Please add funds to your wallet and try again.`,
        payer,
      };
    }
  } catch {
    // If we can't check balance, continue
  }

  return {
    isValid: true,
    invalidReason: undefined,
    payer,
  };
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
 * @returns Promise resolving to settlement response
 */
export async function settlePermit2(
  signer: FacilitatorEvmSigner,
  payload: PaymentPayload,
  requirements: PaymentRequirements,
  permit2Payload: ExactPermit2Payload,
  context?: FacilitatorContext,
): Promise<SettleResponse> {
  const payer = permit2Payload.permit2Authorization.from;

  const valid = await verifyPermit2(signer, payload, requirements, permit2Payload, context);
  if (!valid.isValid) {
    return {
      success: false,
      network: payload.accepted.network,
      transaction: "",
      errorReason: valid.invalidReason ?? "invalid_scheme",
      payer,
    };
  }

  // Branch: EIP-2612 gas sponsoring (atomic settleWithPermit via contract)
  const eip2612Info = extractEip2612GasSponsoringInfo(payload);
  if (eip2612Info) {
    return settlePermit2WithEIP2612(exactProxyConfig, signer, payload, permit2Payload, eip2612Info);
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
      return settlePermit2WithERC20Approval(
        exactProxyConfig,
        extensionSigner,
        payload,
        permit2Payload,
        erc20Info,
      );
    }
  }

  // Branch: standard settle (allowance already on-chain)
  return settlePermit2Direct(exactProxyConfig, signer, payload, permit2Payload);
}
