import {
  AssetAmount,
  Network,
  PaymentFlowConfig,
  PaymentRequirements,
  Price,
  SchemeNetworkServer,
  MoneyParser,
  SupportedKind,
} from "@x402/core/types";
import { UptoEvmScheme } from "@x402/evm/upto/server";
import { assertBaseNetwork, isBaseNetwork } from "../../networks";

/**
 * Base resource-server implementation for the Upto payment scheme.
 *
 * Thin pass-through wrapper around the generic EVM {@link UptoEvmScheme}
 * (`@x402/evm`). Base (`eip155:8453` / `eip155:84532`) has no
 * resource-server-side differences from generic EVM today - this class
 * exists as an explicit, overridable seam so Base-specific pricing/asset
 * behavior can be introduced later without changing the public
 * `@x402/base` API surface.
 *
 * `parsePrice` and `enhancePaymentRequirements` reject any network outside
 * `eip155:8453` / `eip155:84532` - see {@link assertBaseNetwork}. Registering
 * this scheme under a network (or wildcard pattern) outside Base's scope
 * fails fast at `x402ResourceServer.initialize()` via
 * {@link BaseScheme.validateFacilitatorSupport}.
 */
export class BaseScheme implements SchemeNetworkServer {
  readonly scheme = "upto";
  readonly defaultAssetTransferMethod: string;
  readonly paymentFlows: Readonly<Record<string, PaymentFlowConfig>>;
  private readonly uptoEvmScheme: UptoEvmScheme;

  /**
   * Creates a new BaseScheme server instance.
   */
  constructor() {
    this.uptoEvmScheme = new UptoEvmScheme();
    this.defaultAssetTransferMethod = this.uptoEvmScheme.defaultAssetTransferMethod;
    this.paymentFlows = this.uptoEvmScheme.paymentFlows;
  }

  /**
   * Register a custom money parser in the parser chain. Passes through to
   * the underlying {@link UptoEvmScheme}.
   *
   * @param parser - Custom function to convert amount to AssetAmount (or null to skip)
   * @returns This scheme instance, for chaining
   */
  registerMoneyParser(parser: MoneyParser): BaseScheme {
    this.uptoEvmScheme.registerMoneyParser(parser);
    return this;
  }

  /**
   * Decimals for a known default asset, or undefined off-Base or when
   * unrecognized. Otherwise passes through to the underlying
   * {@link UptoEvmScheme}.
   *
   * @param asset - Asset address or symbol
   * @param network - Target network
   * @returns Decimals when the asset is a known Base default; otherwise undefined
   */
  getAssetDecimals(asset: string, network: Network): number | undefined {
    if (!isBaseNetwork(network)) return undefined;
    return this.uptoEvmScheme.getAssetDecimals(asset, network);
  }

  /**
   * Parses a price into an asset amount. Delegates to the underlying
   * {@link UptoEvmScheme} after asserting `network` is in Base's scope.
   *
   * @param price - The price to parse
   * @param network - The network to use
   * @returns Promise that resolves to the parsed asset amount
   * @throws When `network` is not `eip155:8453` / `eip155:84532`
   */
  async parsePrice(price: Price, network: Network): Promise<AssetAmount> {
    assertBaseNetwork(network, "BaseScheme.parsePrice");
    return this.uptoEvmScheme.parsePrice(price, network);
  }

  /**
   * Builds payment requirements for this scheme/network combination.
   * Delegates to the underlying {@link UptoEvmScheme} after asserting
   * `supportedKind.network` is in Base's scope.
   *
   * @param paymentRequirements - The base payment requirements
   * @param supportedKind - The supported kind from facilitator
   * @param supportedKind.x402Version - The x402 version
   * @param supportedKind.scheme - The logical payment scheme
   * @param supportedKind.network - The network identifier in CAIP-2 format
   * @param supportedKind.extra - Optional extra metadata regarding scheme/network implementation details
   * @param extensionKeys - Extension keys supported by the facilitator (unused)
   * @returns Payment requirements ready to be sent to clients
   * @throws When `supportedKind.network` is not `eip155:8453` / `eip155:84532`
   */
  async enhancePaymentRequirements(
    paymentRequirements: PaymentRequirements,
    supportedKind: {
      x402Version: number;
      scheme: string;
      network: Network;
      extra?: Record<string, unknown>;
    },
    extensionKeys: string[],
  ): Promise<PaymentRequirements> {
    assertBaseNetwork(supportedKind.network, "BaseScheme.enhancePaymentRequirements");
    return this.uptoEvmScheme.enhancePaymentRequirements(
      paymentRequirements,
      supportedKind,
      extensionKeys,
    );
  }

  /**
   * Fails server startup when this scheme is registered against a network
   * outside Base's scope, so a mis-registration (e.g. under a wildcard
   * pattern that also matches non-Base chains) surfaces at
   * `x402ResourceServer.initialize()` instead of at first payment.
   *
   * @param network - The network identifier being validated.
   * @param supportedKind - The facilitator's advertised kind for this scheme/network (unused).
   * @param extensionKeys - Extensions advertised by the facilitator (unused).
   * @returns A problem message when `network` is outside Base's scope, or void when valid.
   */
  validateFacilitatorSupport(
    network: Network,
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    supportedKind: SupportedKind,
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    extensionKeys: string[],
  ): string | void {
    if (!isBaseNetwork(network)) {
      return `@x402/base only supports eip155:8453 and eip155:84532, but was registered for ${network}`;
    }
  }
}
