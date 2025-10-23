import { PaymentPayload, PaymentRequirements, SchemeNetworkClient, SchemeNetworkFacilitator, SettleResponse, VerifyResponse } from "@x402/core/types";
import { PaymentRequirementsV1 } from "@x402/core/types/v1";
import { getAddress, parseErc6492Signature } from "viem";
import { authorizationTypes, eip3009ABI } from "../../constants";
import { ClientEvmSigner, FacilitatorEvmSigner } from "../../signer";
import { ExactEvmPayloadV1 } from "../../types";
import { createNonce, getEvmChainId } from "../../utils";

export class ExactEvmClientV1 implements SchemeNetworkClient {
  readonly scheme = "exact";

  constructor(private readonly signer: ClientEvmSigner) { }

  async createPaymentPayload(_: number, requirements: PaymentRequirements): Promise<PaymentPayload> {
    const requirementsV1 = requirements as unknown as PaymentRequirementsV1;
    const nonce = createNonce();
    const now = Math.floor(Date.now() / 1000);

    const authorization: ExactEvmPayloadV1["authorization"] = {
      from: this.signer.address,
      to: getAddress(requirements.payTo),
      value: requirementsV1.maxAmountRequired,
      validAfter: (now - 600).toString(), // 10 minutes before
      validBefore: (now + requirements.maxTimeoutSeconds).toString(),
      nonce,
    };

    // Sign the authorization
    const signature = await this.signAuthorization(authorization, requirementsV1);

    const payload: ExactEvmPayloadV1 = {
      authorization,
      signature,
    };

    return {
      x402Version: 1,
      scheme: requirements.scheme,
      network: requirements.network,
      payload,
    } as unknown as PaymentPayload;
  }

  /**
   * Sign the EIP-3009 authorization using EIP-712
   */
  private async signAuthorization(
    authorization: ExactEvmPayloadV1["authorization"],
    requirements: PaymentRequirementsV1
  ): Promise<`0x${string}`> {
    const chainId = getEvmChainId(requirements.network);

    if (!requirements.extra?.name || !requirements.extra?.version) {
      throw new Error(`EIP-712 domain parameters (name, version) are required in payment requirements for asset ${requirements.asset}`);
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

export class ExactEvmFacilitatorV1 implements SchemeNetworkFacilitator {
  readonly scheme = "exact";

  constructor(private readonly signer: FacilitatorEvmSigner) { }

  async verify(payload: PaymentPayload, requirements: PaymentRequirements): Promise<VerifyResponse> {
    const requirementsV1 = requirements as unknown as PaymentRequirementsV1;
    const exactEvmPayload = payload.payload as ExactEvmPayloadV1;

    // Verify scheme matches
    if (payload.scheme !== "exact" || requirements.scheme !== "exact") {
      return {
        isValid: false,
        invalidReason: "unsupported_scheme",
        payer: exactEvmPayload.authorization.from,
      };
    }

    // Get chain configuration
    const chainId = getEvmChainId(payload.network);

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
    if (payload.network !== requirements.network) {
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
    } catch (error) {
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
      const balance = await this.signer.readContract({
        address: erc20Address,
        abi: eip3009ABI,
        functionName: "balanceOf",
        args: [exactEvmPayload.authorization.from],
      });

      if (BigInt(balance) < BigInt(requirementsV1.maxAmountRequired)) {
        return {
          isValid: false,
          invalidReason: "insufficient_funds",
          payer: exactEvmPayload.authorization.from,
        };
      }
    } catch (error) {
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

  async settle(payload: PaymentPayload, requirements: PaymentRequirements): Promise<SettleResponse> {
    const exactEvmPayload = payload.payload as ExactEvmPayloadV1;

    // Re-verify before settling
    const valid = await this.verify(payload, requirements);
    if (!valid.isValid) {
      return {
        success: false,
        network: payload.network,
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
          network: payload.network,
          payer: exactEvmPayload.authorization.from,
        };
      }

      return {
        success: true,
        transaction: tx,
        network: payload.network,
        payer: exactEvmPayload.authorization.from,
      };
    } catch (error) {
      console.error('Failed to settle transaction:', error);
      return {
        success: false,
        errorReason: "transaction_failed",
        transaction: "",
        network: payload.network,
        payer: exactEvmPayload.authorization.from,
      };
    }
  }
}

