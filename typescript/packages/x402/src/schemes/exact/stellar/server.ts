import {
  ERC20TokenAmount,
  Network,
  PaymentMiddlewareConfig,
  PaymentRequirements,
  Resource,
  SPLTokenAmount,
  StellarSEP41TokenAmount,
  SupportedPaymentKindsResponse,
} from "../../../types";

/**
 * Builds payment requirements for a given price and network
 *
 * @param payTo - The address to receive payment
 * @param maxAmountRequired - The maximum amount required to pay for the resource
 * @param asset - The asset to pay for the resource
 * @param network - The network to use for payment
 * @param config - The configuration for the payment
 * @param resourceUrl - The URL of the resource being protected
 * @param method - The HTTP method to use for the payment
 * @param supported - The function to get the supported payments from the facilitator
 * @returns The payment requirements
 */
export async function buildExactStellarPaymentRequirements(
  payTo: string,
  maxAmountRequired: string,
  asset: ERC20TokenAmount["asset"] | SPLTokenAmount["asset"] | StellarSEP41TokenAmount["asset"],
  network: Network,
  config: PaymentMiddlewareConfig,
  resourceUrl: Resource,
  method: string,
  supported: () => Promise<SupportedPaymentKindsResponse>,
): Promise<PaymentRequirements> {
  const { description, mimeType, maxTimeoutSeconds, inputSchema, outputSchema, discoverable } =
    config;

  // get the supported payments from the facilitator
  const paymentKinds = await supported();

  // find the payment kind that matches the network and scheme
  let maxLedger: string | undefined;
  for (const kind of paymentKinds.kinds) {
    if (kind.network === network && kind.scheme === "exact") {
      maxLedger = kind?.extra?.maxLedger;
      break;
    }
  }

  if (!maxLedger) {
    throw new Error(`The facilitator did not provide a maxLedger for network: ${network}.`);
  }

  return {
    scheme: "exact",
    network,
    maxAmountRequired,
    resource: resourceUrl,
    description: description ?? "",
    mimeType: mimeType ?? "",
    payTo,
    maxTimeoutSeconds: maxTimeoutSeconds ?? 60,
    asset: asset.address,
    outputSchema: {
      input: {
        type: "http",
        method,
        discoverable: discoverable ?? true,
        ...inputSchema,
      },
      output: outputSchema,
    },
    extra: {
      maxLedger,
    },
  };
}
