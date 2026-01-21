import {
  PaymentPayload,
  PaymentRequirements,
  SettleResponse,
  VerifyResponse,
} from "@x402/core/types";
import { getAddress, Hex } from "viem";
import {
  eip3009ABI,
  permit2WitnessTypes,
  PERMIT2_ADDRESS,
  x402ExactPermit2ProxyAddress,
  x402ExactPermit2ProxyABI,
} from "../../constants";
import { EIP2612_GAS_SPONSORING_EXTENSION } from "../client/permit2";
import { FacilitatorEvmSigner } from "../../signer";
import { EIP2612PermitParams, ExactPermit2Payload } from "../../types";

/**
 * Verifies a Permit2 payment payload.
 *
 * @param signer - The EVM signer for facilitator operations
 * @param payload - The payment payload to verify
 * @param requirements - The payment requirements
 * @param permit2Payload - The Permit2-specific payload data
 * @returns Promise resolving to verification response
 */
export async function verifyPermit2(
  signer: FacilitatorEvmSigner,
  payload: PaymentPayload,
  requirements: PaymentRequirements,
  permit2Payload: ExactPermit2Payload,
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

  const chainId = parseInt(requirements.network.split(":")[1]);

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
      invalidReason: "invalid_permit2_witness_recipient",
      payer,
    };
  }

  if (
    getAddress(permit2Payload.permit2Authorization.permitted.token) !==
    getAddress(requirements.asset)
  ) {
    return {
      isValid: false,
      invalidReason: "invalid_permit2_token",
      payer,
    };
  }

  if (BigInt(permit2Payload.permit2Authorization.permitted.amount) < BigInt(requirements.amount)) {
    return {
      isValid: false,
      invalidReason: "invalid_permit2_amount",
      payer,
    };
  }

  const now = Math.floor(Date.now() / 1000);

  if (BigInt(permit2Payload.permit2Authorization.deadline) < BigInt(now + 6)) {
    return {
      isValid: false,
      invalidReason: "invalid_permit2_deadline",
      payer,
    };
  }

  if (BigInt(permit2Payload.permit2Authorization.witness.validBefore) < BigInt(now + 6)) {
    return {
      isValid: false,
      invalidReason: "invalid_permit2_witness_valid_before",
      payer,
    };
  }

  if (BigInt(permit2Payload.permit2Authorization.witness.validAfter) > BigInt(now)) {
    return {
      isValid: false,
      invalidReason: "invalid_permit2_witness_valid_after",
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
        extra: permit2Payload.permit2Authorization.witness.extra,
        to: getAddress(permit2Payload.permit2Authorization.witness.to),
        validAfter: BigInt(permit2Payload.permit2Authorization.witness.validAfter),
        validBefore: BigInt(permit2Payload.permit2Authorization.witness.validBefore),
      },
    },
  };

  try {
    const recoveredAddress = await signer.verifyTypedData({
      address: payer,
      ...permit2TypedData,
      signature: permit2Payload.signature,
    });

    if (!recoveredAddress) {
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

  try {
    const balance = (await signer.readContract({
      address: getAddress(requirements.asset),
      abi: eip3009ABI,
      functionName: "balanceOf",
      args: [payer],
    })) as bigint;

    if (balance < BigInt(requirements.amount)) {
      return {
        isValid: false,
        invalidReason: "insufficient_funds",
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
 * Settles a Permit2 payment by executing the transfer.
 *
 * @param signer - The EVM signer for facilitator operations
 * @param payload - The payment payload to settle
 * @param requirements - The payment requirements
 * @param permit2Payload - The Permit2-specific payload data
 * @param verifyFn - Function to verify the payload before settling
 * @returns Promise resolving to settlement response
 */
export async function settlePermit2(
  signer: FacilitatorEvmSigner,
  payload: PaymentPayload,
  requirements: PaymentRequirements,
  permit2Payload: ExactPermit2Payload,
  verifyFn: () => Promise<VerifyResponse>,
): Promise<SettleResponse> {
  const payer = permit2Payload.permit2Authorization.from;

  const valid = await verifyFn();
  if (!valid.isValid) {
    return {
      success: false,
      network: payload.accepted.network,
      transaction: "",
      errorReason: valid.invalidReason ?? "invalid_payload",
      payer,
    };
  }

  try {
    const permit = {
      permitted: {
        token: getAddress(permit2Payload.permit2Authorization.permitted.token),
        amount: BigInt(permit2Payload.permit2Authorization.permitted.amount),
      },
      nonce: BigInt(permit2Payload.permit2Authorization.nonce),
      deadline: BigInt(permit2Payload.permit2Authorization.deadline),
    };

    const witness = {
      to: getAddress(permit2Payload.permit2Authorization.witness.to),
      validAfter: BigInt(permit2Payload.permit2Authorization.witness.validAfter),
      validBefore: BigInt(permit2Payload.permit2Authorization.witness.validBefore),
      extra: permit2Payload.permit2Authorization.witness.extra,
    };

    const eip2612Extension = payload.extensions?.[EIP2612_GAS_SPONSORING_EXTENSION] as
      | { permit: EIP2612PermitParams }
      | undefined;

    let tx: Hex;

    if (eip2612Extension) {
      const permit2612 = {
        value: BigInt(eip2612Extension.permit.value),
        deadline: BigInt(eip2612Extension.permit.deadline),
        r: eip2612Extension.permit.r,
        s: eip2612Extension.permit.s,
        v: eip2612Extension.permit.v,
      };

      tx = await signer.writeContract({
        address: x402ExactPermit2ProxyAddress,
        abi: x402ExactPermit2ProxyABI,
        functionName: "settleWith2612",
        args: [
          permit2612,
          permit,
          BigInt(requirements.amount),
          getAddress(payer),
          witness,
          permit2Payload.signature,
        ],
      });
    } else {
      tx = await signer.writeContract({
        address: x402ExactPermit2ProxyAddress,
        abi: x402ExactPermit2ProxyABI,
        functionName: "settle",
        args: [
          permit,
          BigInt(requirements.amount),
          getAddress(payer),
          witness,
          permit2Payload.signature,
        ],
      });
    }

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
    console.error("Failed to settle Permit2 transaction:", error);
    return {
      success: false,
      errorReason: "transaction_failed",
      transaction: "",
      network: payload.accepted.network,
      payer,
    };
  }
}
