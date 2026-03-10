import {
  PaymentPayload,
  PaymentRequirements,
  SchemeNetworkFacilitator,
  FacilitatorContext,
  SettleResponse,
  VerifyResponse,
} from "@x402/core/types";
import { FacilitatorEvmSigner } from "../../signer";
import { UptoPermit2Payload, isUptoPermit2Payload } from "../../types";
import { verifyUptoPermit2, settleUptoPermit2 } from "./permit2";

export class UptoEvmScheme implements SchemeNetworkFacilitator {
  readonly scheme = "upto";
  readonly caipFamily = "eip155:*";

  constructor(private readonly signer: FacilitatorEvmSigner) {}

  getExtra(_: string): Record<string, unknown> | undefined {
    return undefined;
  }

  getSigners(_: string): string[] {
    return [...this.signer.getAddresses()];
  }

  async verify(
    payload: PaymentPayload,
    requirements: PaymentRequirements,
    context?: FacilitatorContext,
  ): Promise<VerifyResponse> {
    const rawPayload = payload.payload as Record<string, unknown>;
    if (!isUptoPermit2Payload(rawPayload)) {
      return { isValid: false, invalidReason: "unsupported_payload_type", payer: "" };
    }
    return verifyUptoPermit2(
      this.signer,
      payload,
      requirements,
      rawPayload as UptoPermit2Payload,
      context,
    );
  }

  async settle(
    payload: PaymentPayload,
    requirements: PaymentRequirements,
    context?: FacilitatorContext,
  ): Promise<SettleResponse> {
    const rawPayload = payload.payload as Record<string, unknown>;
    if (!isUptoPermit2Payload(rawPayload)) {
      return {
        success: false,
        network: payload.accepted.network,
        transaction: "",
        errorReason: "unsupported_payload_type",
        payer: "",
      };
    }
    return settleUptoPermit2(
      this.signer,
      payload,
      requirements,
      rawPayload as UptoPermit2Payload,
      context,
    );
  }
}
