import type { SchemeNetworkClient, PaymentPayload } from "@x402/core/types";
import type { PaymentRequirements } from "@x402/core/types";
import type { HypercoreSendAssetAction } from "../../types.js";
import type { ClientHypercoreSigner } from "../../signer.js";
import { formatAmount } from "../../utils.js";
import { HYPERCORE_NETWORK_CONFIGS } from "../../constants.js";

type PaymentPayloadResult = Pick<PaymentPayload, "x402Version" | "payload">;

/**
 * Hypercore scheme client implementation for creating payment payloads.
 */
export class ExactHypercoreScheme implements SchemeNetworkClient {
  readonly scheme = "exact";

  /**
   * Create a client scheme with a signer.
   *
   * @param signer - Signer for SendAsset actions.
   */
  constructor(private signer: ClientHypercoreSigner) {}

  /**
   * Create a payment payload for Hypercore.
   *
   * @param x402Version - Protocol version.
   * @param requirements - Payment requirements from the server.
   * @returns Payment payload.
   */
  async createPaymentPayload(
    x402Version: number,
    requirements: PaymentRequirements,
  ): Promise<PaymentPayloadResult> {
    const nonce = Date.now();

    const config = HYPERCORE_NETWORK_CONFIGS[requirements.network];
    if (!config) {
      throw new Error(`Unsupported network: ${requirements.network}`);
    }

    const isMainnet = requirements.extra?.isMainnet !== false;

    const action: HypercoreSendAssetAction = {
      type: "sendAsset",
      hyperliquidChain: isMainnet ? "Mainnet" : "Testnet",
      signatureChainId: "0x3e7",
      destination: requirements.payTo.toLowerCase(),
      sourceDex: "spot",
      destinationDex: "spot",
      token: requirements.asset,
      amount: formatAmount(requirements.amount, config.defaultAsset.decimals),
      fromSubAccount: "",
      nonce,
    };

    const signature = await this.signer.signSendAsset(action);

    return {
      x402Version,
      payload: {
        action,
        signature,
        nonce,
      },
    };
  }
}
