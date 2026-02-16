import {
  PaymentPayload,
  PaymentRequirements,
  SettleResponse,
  VerifyResponse,
} from "@x402/core/types";
import {
  extractEip2612GasSponsoringInfo,
  validateEip2612GasSponsoringInfo,
} from "@x402/extensions";
import type { Eip2612GasSponsoringInfo } from "@x402/extensions";
import { getAddress } from "viem";
import {
  eip3009ABI,
  PERMIT2_ADDRESS,
  permit2WitnessTypes,
  x402ExactPermit2ProxyABI,
  x402ExactPermit2ProxyAddress,
} from "../../constants";
import { FacilitatorEvmSigner } from "../../signer";
import { ExactPermit2Payload } from "../../types";

// ERC20 allowance ABI for checking Permit2 approval
const erc20AllowanceABI = [
  {
    type: "function",
    name: "allowance",
    inputs: [
      { name: "owner", type: "address" },
      { name: "spender", type: "address" },
    ],
    outputs: [{ type: "uint256" }],
    stateMutability: "view",
  },
] as const;

/**
 * Verifies a Permit2 payment payload.
 *
 * @param signer - The facilitator signer for contract reads
 * @param payload - The payment payload to verify
 * @param requirements - The payment requirements
 * @param permit2Payload - The Permit2 specific payload
 * @returns Promise resolving to verification response
 */
export async function verifyPermit2(
  signer: FacilitatorEvmSigner,
  payload: PaymentPayload,
  requirements: PaymentRequirements,
  permit2Payload: ExactPermit2Payload,
): Promise<VerifyResponse> {
  const payer = permit2Payload.permit2Authorization.from;

  // Verify scheme matches
  if (payload.accepted.scheme !== "exact" || requirements.scheme !== "exact") {
    return {
      isValid: false,
      invalidReason: "unsupported_scheme",
      payer,
    };
  }

  // Verify network matches
  if (payload.accepted.network !== requirements.network) {
    return {
      isValid: false,
      invalidReason: "network_mismatch",
      payer,
    };
  }

  const chainId = parseInt(requirements.network.split(":")[1]);
  const tokenAddress = getAddress(requirements.asset);

  // Verify spender is the x402ExactPermit2Proxy
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

  // Verify witness.to matches payTo
  if (
    getAddress(permit2Payload.permit2Authorization.witness.to) !== getAddress(requirements.payTo)
  ) {
    return {
      isValid: false,
      invalidReason: "invalid_permit2_recipient_mismatch",
      payer,
    };
  }

  // Verify deadline not expired (with 6 second buffer for block time)
  const now = Math.floor(Date.now() / 1000);
  if (BigInt(permit2Payload.permit2Authorization.deadline) < BigInt(now + 6)) {
    return {
      isValid: false,
      invalidReason: "permit2_deadline_expired",
      payer,
    };
  }

  // Verify validAfter is not in the future
  if (BigInt(permit2Payload.permit2Authorization.witness.validAfter) > BigInt(now)) {
    return {
      isValid: false,
      invalidReason: "permit2_not_yet_valid",
      payer,
    };
  }

  // Verify amount is sufficient
  if (BigInt(permit2Payload.permit2Authorization.permitted.amount) < BigInt(requirements.amount)) {
    return {
      isValid: false,
      invalidReason: "permit2_insufficient_amount",
      payer,
    };
  }

  // Verify token matches
  if (getAddress(permit2Payload.permit2Authorization.permitted.token) !== tokenAddress) {
    return {
      isValid: false,
      invalidReason: "permit2_token_mismatch",
      payer,
    };
  }

  // Build typed data for Permit2 signature verification
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
        extra: permit2Payload.permit2Authorization.witness.extra,
      },
    },
  };

  // Verify signature
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

  // Check Permit2 allowance
  try {
    const allowance = (await signer.readContract({
      address: tokenAddress,
      abi: erc20AllowanceABI,
      functionName: "allowance",
      args: [payer, PERMIT2_ADDRESS],
    })) as bigint;

    if (allowance < BigInt(requirements.amount)) {
      // Allowance insufficient - check for EIP-2612 gas sponsoring extension
      const eip2612Info = extractEip2612GasSponsoringInfo(payload);
      if (eip2612Info) {
        // Validate the EIP-2612 extension data
        const validationResult = validateEip2612PermitForPayment(eip2612Info, payer, tokenAddress);
        if (!validationResult.isValid) {
          return {
            isValid: false,
            invalidReason: validationResult.invalidReason!,
            payer,
          };
        }
        // EIP-2612 extension is valid, allowance will be set during settlement
      } else {
        return {
          isValid: false,
          invalidReason: "permit2_allowance_required",
          payer,
        };
      }
    }
  } catch {
    // If we can't check allowance, check if EIP-2612 extension is present
    const eip2612Info = extractEip2612GasSponsoringInfo(payload);
    if (eip2612Info) {
      const validationResult = validateEip2612PermitForPayment(eip2612Info, payer, tokenAddress);
      if (!validationResult.isValid) {
        return {
          isValid: false,
          invalidReason: validationResult.invalidReason!,
          payer,
        };
      }
      // EIP-2612 extension is valid, allowance will be set during settlement
    }
  }

  // Check balance
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
    // If we can't check balance, continue with other validations
  }

  return {
    isValid: true,
    invalidReason: undefined,
    payer,
  };
}

/**
 * Settles a Permit2 payment by calling the x402ExactPermit2Proxy.
 *
 * @param signer - The facilitator signer for contract writes
 * @param payload - The payment payload to settle
 * @param requirements - The payment requirements
 * @param permit2Payload - The Permit2 specific payload
 * @returns Promise resolving to settlement response
 */
export async function settlePermit2(
  signer: FacilitatorEvmSigner,
  payload: PaymentPayload,
  requirements: PaymentRequirements,
  permit2Payload: ExactPermit2Payload,
): Promise<SettleResponse> {
  const payer = permit2Payload.permit2Authorization.from;

  // Re-verify before settling
  const valid = await verifyPermit2(signer, payload, requirements, permit2Payload);
  if (!valid.isValid) {
    return {
      success: false,
      network: payload.accepted.network,
      transaction: "",
      errorReason: valid.invalidReason ?? "invalid_scheme",
      payer,
    };
  }

  try {
    // Check if EIP-2612 gas sponsoring extension is present
    const eip2612Info = extractEip2612GasSponsoringInfo(payload);

    let tx: `0x${string}`;

    if (eip2612Info) {
      // Use settleWithPermit - includes the EIP-2612 permit
      const { v, r, s } = splitEip2612Signature(eip2612Info.signature);

      tx = await signer.writeContract({
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
          {
            permitted: {
              token: getAddress(permit2Payload.permit2Authorization.permitted.token),
              amount: BigInt(permit2Payload.permit2Authorization.permitted.amount),
            },
            nonce: BigInt(permit2Payload.permit2Authorization.nonce),
            deadline: BigInt(permit2Payload.permit2Authorization.deadline),
          },
          getAddress(payer),
          {
            to: getAddress(permit2Payload.permit2Authorization.witness.to),
            validAfter: BigInt(permit2Payload.permit2Authorization.witness.validAfter),
            extra: permit2Payload.permit2Authorization.witness.extra as `0x${string}`,
          },
          permit2Payload.signature,
        ],
      });
    } else {
      // Standard settle - no EIP-2612 extension
      tx = await signer.writeContract({
        address: x402ExactPermit2ProxyAddress,
        abi: x402ExactPermit2ProxyABI,
        functionName: "settle",
        args: [
          {
            permitted: {
              token: getAddress(permit2Payload.permit2Authorization.permitted.token),
              amount: BigInt(permit2Payload.permit2Authorization.permitted.amount),
            },
            nonce: BigInt(permit2Payload.permit2Authorization.nonce),
            deadline: BigInt(permit2Payload.permit2Authorization.deadline),
          },
          getAddress(payer),
          {
            to: getAddress(permit2Payload.permit2Authorization.witness.to),
            validAfter: BigInt(permit2Payload.permit2Authorization.witness.validAfter),
            extra: permit2Payload.permit2Authorization.witness.extra as `0x${string}`,
          },
          permit2Payload.signature,
        ],
      });
    }

    // Wait for transaction confirmation
    const receipt = await signer.waitForTransactionReceipt({ hash: tx });

    if (receipt.status !== "success") {
      return {
        success: false,
        errorReason: "invalid_transaction_state",
        transaction: tx,
        network: payload.accepted.network,
        payer,
      };
    }

    return {
      success: true,
      transaction: tx,
      network: payload.accepted.network,
      payer,
    };
  } catch (error) {
    // Extract meaningful error message from the contract revert
    let errorReason = "transaction_failed";
    if (error instanceof Error) {
      // Check for common contract revert patterns
      const message = error.message;
      if (message.includes("AmountExceedsPermitted")) {
        errorReason = "permit2_amount_exceeds_permitted";
      } else if (message.includes("InvalidDestination")) {
        errorReason = "permit2_invalid_destination";
      } else if (message.includes("InvalidOwner")) {
        errorReason = "permit2_invalid_owner";
      } else if (message.includes("PaymentTooEarly")) {
        errorReason = "permit2_payment_too_early";
      } else if (message.includes("InvalidSignature") || message.includes("SignatureExpired")) {
        errorReason = "permit2_invalid_signature";
      } else if (message.includes("InvalidNonce")) {
        errorReason = "permit2_invalid_nonce";
      } else {
        // Include error message for debugging (longer for better visibility)
        errorReason = `transaction_failed: ${message.slice(0, 500)}`;
      }
    }
    return {
      success: false,
      errorReason,
      transaction: "",
      network: payload.accepted.network,
      payer,
    };
  }
}

/**
 * Validates EIP-2612 permit extension data for a payment.
 *
 * @param info - The EIP-2612 gas sponsoring info
 * @param payer - The expected payer address
 * @param tokenAddress - The expected token address
 * @returns Validation result
 */
function validateEip2612PermitForPayment(
  info: Eip2612GasSponsoringInfo,
  payer: `0x${string}`,
  tokenAddress: `0x${string}`,
): { isValid: boolean; invalidReason?: string } {
  // Validate format
  if (!validateEip2612GasSponsoringInfo(info)) {
    return { isValid: false, invalidReason: "invalid_eip2612_extension_format" };
  }

  // Verify from matches payer
  if (getAddress(info.from as `0x${string}`) !== getAddress(payer)) {
    return { isValid: false, invalidReason: "eip2612_from_mismatch" };
  }

  // Verify asset matches token
  if (getAddress(info.asset as `0x${string}`) !== tokenAddress) {
    return { isValid: false, invalidReason: "eip2612_asset_mismatch" };
  }

  // Verify spender is Permit2
  if (getAddress(info.spender as `0x${string}`) !== getAddress(PERMIT2_ADDRESS)) {
    return { isValid: false, invalidReason: "eip2612_spender_not_permit2" };
  }

  // Verify deadline not expired (with 6 second buffer, consistent with Permit2 deadline check)
  const now = Math.floor(Date.now() / 1000);
  if (BigInt(info.deadline) < BigInt(now + 6)) {
    return { isValid: false, invalidReason: "eip2612_deadline_expired" };
  }

  return { isValid: true };
}

/**
 * Splits a 65-byte EIP-2612 signature into v, r, s components.
 *
 * @param signature - The hex-encoded 65-byte signature
 * @returns Object with v (uint8), r (bytes32), s (bytes32)
 */
function splitEip2612Signature(signature: string): {
  v: number;
  r: `0x${string}`;
  s: `0x${string}`;
} {
  const sig = signature.startsWith("0x") ? signature.slice(2) : signature;

  if (sig.length !== 130) {
    throw new Error(`invalid EIP-2612 signature length: expected 65 bytes (130 hex chars), got ${sig.length / 2} bytes`);
  }

  const r = `0x${sig.slice(0, 64)}` as `0x${string}`;
  const s = `0x${sig.slice(64, 128)}` as `0x${string}`;
  const v = parseInt(sig.slice(128, 130), 16);

  return { v, r, s };
}
