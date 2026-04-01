import {
  AssetAmount,
  Network,
  PaymentRequirements,
  PaymentPayload,
  Price,
  SchemeNetworkServer,
  MoneyParser,
  SettleResponse,
  VerifyResponse,
} from "@x402/core/types";
import type {
  AfterSettleHook,
  AfterVerifyHook,
  BeforeSettleHook,
  SettleContext,
} from "@x402/core/server";
import { getDefaultAsset } from "../../shared/defaultAssets";
import { isDeferredDepositPayload, isDeferredVoucherPayload } from "../types";
import { InMemorySessionStorage, SessionStorage, SubchannelSession } from "./storage";

/**
 * Optional configuration for {@link DeferredEvmScheme} on the resource server.
 */
export interface DeferredEvmSchemeServerConfig {
  /** Session persistence; defaults to {@link InMemorySessionStorage}. */
  storage?: SessionStorage;
}

/**
 * Lowercases a service id for storage keys and comparisons.
 *
 * @param id - Hex service id string.
 * @returns Lowercased service id.
 */
function lowerServiceId(id: string): string {
  return id.toLowerCase();
}

/**
 * EVM server implementation for the Deferred payment scheme.
 * Handles price parsing, payment requirements enhancement with serviceId injection,
 * default asset resolution, and optional session lifecycle hooks for voucher/deposit flows.
 *
 * Register hooks explicitly on {@link x402ResourceServer}, e.g.:
 * `server.register(..., deferred).onAfterVerify(deferred.lifecycleHooks.onAfterVerify)...`
 */
export class DeferredEvmScheme implements SchemeNetworkServer {
  readonly scheme = "deferred";
  readonly lifecycleHooks: {
    onAfterVerify: AfterVerifyHook;
    onBeforeSettle: BeforeSettleHook;
    onAfterSettle: AfterSettleHook;
  };

  private moneyParsers: MoneyParser[] = [];
  private readonly storage: SessionStorage;

  /**
   * Creates the deferred server scheme for a registered service.
   *
   * @param serviceId - The on-chain service id for this resource.
   * @param config - Optional storage and other server settings.
   */
  constructor(
    private readonly serviceId: `0x${string}`,
    config?: DeferredEvmSchemeServerConfig,
  ) {
    this.storage = config?.storage ?? new InMemorySessionStorage();
    this.lifecycleHooks = {
      onAfterVerify: this.handleAfterVerify.bind(this),
      onBeforeSettle: this.handleBeforeSettle.bind(this),
      onAfterSettle: this.handleAfterSettle.bind(this),
    };
  }

  /**
   * Registers a custom money parser for price strings.
   *
   * @param parser - The money parser function to register.
   * @returns This instance for chaining.
   */
  registerMoneyParser(parser: MoneyParser): DeferredEvmScheme {
    this.moneyParsers.push(parser);
    return this;
  }

  /**
   * Parses a price into an asset amount for the target network.
   *
   * @param price - The price to parse (string, number, or AssetAmount).
   * @param network - The target network.
   * @returns Resolved token amount and asset metadata.
   */
  async parsePrice(price: Price, network: Network): Promise<AssetAmount> {
    if (typeof price === "object" && price !== null && "amount" in price) {
      if (!price.asset) {
        throw new Error(`Asset address must be specified for AssetAmount on network ${network}`);
      }
      return {
        amount: price.amount,
        asset: price.asset,
        extra: price.extra || {},
      };
    }

    const amount = this.parseMoneyToDecimal(price);

    for (const parser of this.moneyParsers) {
      const result = await parser(amount, network);
      if (result !== null) {
        return result;
      }
    }

    return this.defaultMoneyConversion(amount, network);
  }

  /**
   * Injects default asset metadata and this service id into payment requirements.
   *
   * @param paymentRequirements - The base payment requirements.
   * @param _supportedKind - The supported scheme/network kind (unused).
   * @param _supportedKind.x402Version - The x402 protocol version.
   * @param _supportedKind.scheme - The payment scheme name.
   * @param _supportedKind.network - The target network.
   * @param _supportedKind.extra - Optional extra metadata.
   * @param _extensionKeys - Extension keys to include (unused).
   * @returns Enhanced requirements with `serviceId` and token name/version in `extra`.
   */
  enhancePaymentRequirements(
    paymentRequirements: PaymentRequirements,
    _supportedKind: {
      x402Version: number;
      scheme: string;
      network: Network;
      extra?: Record<string, unknown>;
    },
    _extensionKeys: string[],
  ): Promise<PaymentRequirements> {
    void _supportedKind;
    void _extensionKeys;

    const assetInfo = getDefaultAsset(paymentRequirements.network as Network);

    return Promise.resolve({
      ...paymentRequirements,
      extra: {
        ...paymentRequirements.extra,
        serviceId: this.serviceId,
        name: assetInfo.name,
        version: assetInfo.version,
      },
    });
  }

  /**
   * Returns whether the given service id matches this scheme's service id (case-insensitive).
   *
   * @param id - On-chain service id from the payment payload.
   * @returns True when `id` refers to this resource server's deferred service.
   */
  private assertThisServiceId(id: `0x${string}`): boolean {
    return lowerServiceId(id) === lowerServiceId(this.serviceId);
  }

  /**
   * Persists deferred session state after a successful verify for voucher or deposit payloads.
   *
   * @param ctx - Resource server verify hook context.
   * @param ctx.paymentPayload - Client payment body for this request.
   * @param ctx.requirements - Payment requirements being verified against.
   * @param ctx.result - Facilitator verify outcome, including validity and payer.
   * @returns Promise that resolves when session storage has been updated.
   */
  private async handleAfterVerify(ctx: {
    paymentPayload: PaymentPayload;
    requirements: PaymentRequirements;
    result: VerifyResponse;
  }): Promise<void> {
    const { paymentPayload, requirements, result } = ctx;
    if (requirements.scheme !== "deferred" || !result.isValid || !result.payer) {
      return;
    }

    const raw = paymentPayload.payload as Record<string, unknown>;
    let sid: `0x${string}`;
    let payer: `0x${string}`;
    let signedCumulative: string;
    let nonce: number;
    let signature: `0x${string}`;

    if (isDeferredDepositPayload(raw)) {
      sid = raw.deposit.serviceId;
      payer = raw.deposit.payer;
      signedCumulative = raw.voucher.cumulativeAmount;
      nonce = raw.voucher.nonce;
      signature = raw.voucher.signature;
    } else if (isDeferredVoucherPayload(raw)) {
      sid = raw.serviceId;
      payer = raw.payer;
      signedCumulative = raw.cumulativeAmount;
      nonce = raw.nonce;
      signature = raw.signature;
    } else {
      return;
    }

    if (!this.assertThisServiceId(sid)) {
      return;
    }

    const ex = result.extra ?? {};
    const deposit =
      typeof ex.deposit === "string"
        ? ex.deposit
        : typeof ex.deposit === "number"
          ? String(ex.deposit)
          : "0";
    const totalClaimed =
      typeof ex.totalClaimed === "string"
        ? ex.totalClaimed
        : typeof ex.totalClaimed === "number"
          ? String(ex.totalClaimed)
          : "0";
    const withdrawRequestedAt =
      typeof ex.withdrawRequestedAt === "number"
        ? ex.withdrawRequestedAt
        : typeof ex.withdrawRequestedAt === "string"
          ? parseInt(ex.withdrawRequestedAt, 10) || 0
          : 0;

    const prev = await this.storage.get(lowerServiceId(sid), payer);
    const session: SubchannelSession = {
      serviceId: lowerServiceId(sid),
      payer: payer.toLowerCase(),
      chargedCumulativeAmount: prev?.chargedCumulativeAmount ?? "0",
      signedCumulativeAmount: signedCumulative,
      lastNonce: nonce,
      signature,
      deposit,
      totalClaimed,
      withdrawRequestedAt,
      lastRequestTimestamp: Date.now(),
    };
    await this.storage.set(lowerServiceId(sid), payer, session);
  }

  /**
   * Validates deferred voucher settlement against stored session and returns a synthetic settle result when allowed.
   *
   * @param ctx - Resource server settle hook context.
   * @returns Nothing when not applicable; otherwise abort/skip instructions for the server pipeline.
   */
  private async handleBeforeSettle(
    ctx: SettleContext,
  ): Promise<
    | void
    | { abort: true; reason: string; message?: string }
    | { skip: true; result: SettleResponse }
  > {
    const { paymentPayload, requirements } = ctx;
    if (requirements.scheme !== "deferred") {
      return;
    }

    const raw = paymentPayload.payload as Record<string, unknown>;
    if (!isDeferredVoucherPayload(raw)) {
      return;
    }

    if (!this.assertThisServiceId(raw.serviceId)) {
      return {
        abort: true,
        reason: "service_id_mismatch",
        message: "Deferred voucher serviceId does not match this server scheme",
      };
    }

    const session = await this.storage.get(lowerServiceId(raw.serviceId), raw.payer);
    if (!session) {
      return {
        abort: true,
        reason: "missing_deferred_session",
        message: "No session for payer; verify may not have completed",
      };
    }

    const increment = BigInt(requirements.amount);
    const signedCap = BigInt(raw.cumulativeAmount);
    const prevCharged = BigInt(session.chargedCumulativeAmount);
    const newCharged = prevCharged + increment;

    if (newCharged > signedCap) {
      return {
        abort: true,
        reason: "deferred_charge_exceeds_signed_cumulative",
        message: `Charged ${newCharged.toString()} exceeds signed cumulative ${signedCap.toString()}`,
      };
    }

    return {
      skip: true,
      result: {
        success: true,
        transaction: "",
        network: requirements.network,
        payer: raw.payer,
        amount: requirements.amount,
        extra: {
          chargedCumulativeAmount: newCharged.toString(),
          nonce: raw.nonce,
          serviceId: this.serviceId,
          deposit: session.deposit,
          totalClaimed: session.totalClaimed,
          withdrawRequestedAt: session.withdrawRequestedAt,
        },
      },
    };
  }

  /**
   * Updates stored session after settlement so charged totals and on-chain snapshots stay consistent.
   *
   * @param ctx - Resource server settle-after hook context.
   * @param ctx.paymentPayload - Client payment body for this request.
   * @param ctx.requirements - Payment requirements that were settled.
   * @param ctx.result - Successful settle outcome and facilitator extras.
   * @returns Promise that resolves when session storage has been updated.
   */
  private async handleAfterSettle(ctx: {
    paymentPayload: PaymentPayload;
    requirements: PaymentRequirements;
    result: SettleResponse;
  }): Promise<void> {
    const { paymentPayload, requirements, result } = ctx;
    if (requirements.scheme !== "deferred" || !result.success) {
      return;
    }

    const raw = paymentPayload.payload as Record<string, unknown>;

    if (isDeferredVoucherPayload(raw)) {
      if (!this.assertThisServiceId(raw.serviceId)) {
        return;
      }
      const ex = result.extra ?? {};
      const charged =
        typeof ex.chargedCumulativeAmount === "string"
          ? ex.chargedCumulativeAmount
          : typeof ex.chargedCumulativeAmount === "number"
            ? String(ex.chargedCumulativeAmount)
            : raw.cumulativeAmount;

      const deposit =
        typeof ex.deposit === "string"
          ? ex.deposit
          : typeof ex.deposit === "number"
            ? String(ex.deposit)
            : undefined;
      const totalClaimed =
        typeof ex.totalClaimed === "string"
          ? ex.totalClaimed
          : typeof ex.totalClaimed === "number"
            ? String(ex.totalClaimed)
            : undefined;
      const withdrawRequestedAt =
        typeof ex.withdrawRequestedAt === "number"
          ? ex.withdrawRequestedAt
          : typeof ex.withdrawRequestedAt === "string"
            ? parseInt(ex.withdrawRequestedAt, 10)
            : undefined;

      const prev = await this.storage.get(lowerServiceId(raw.serviceId), raw.payer);
      const session: SubchannelSession = {
        serviceId: lowerServiceId(raw.serviceId),
        payer: raw.payer.toLowerCase(),
        chargedCumulativeAmount: charged,
        signedCumulativeAmount: raw.cumulativeAmount,
        lastNonce: raw.nonce,
        signature: raw.signature,
        deposit: deposit ?? prev?.deposit ?? "0",
        totalClaimed: totalClaimed ?? prev?.totalClaimed ?? "0",
        withdrawRequestedAt:
          withdrawRequestedAt !== undefined && !Number.isNaN(withdrawRequestedAt)
            ? withdrawRequestedAt
            : (prev?.withdrawRequestedAt ?? 0),
        lastRequestTimestamp: Date.now(),
      };
      await this.storage.set(lowerServiceId(raw.serviceId), raw.payer, session);
      return;
    }

    if (isDeferredDepositPayload(raw)) {
      if (!this.assertThisServiceId(raw.deposit.serviceId)) {
        return;
      }
      const ex = result.extra ?? {};
      const depositSnap =
        typeof ex.deposit === "string"
          ? ex.deposit
          : typeof ex.deposit === "number"
            ? String(ex.deposit)
            : "0";
      const totalClaimedSnap =
        typeof ex.totalClaimed === "string"
          ? ex.totalClaimed
          : typeof ex.totalClaimed === "number"
            ? String(ex.totalClaimed)
            : "0";
      const withdrawAtSnap =
        typeof ex.withdrawRequestedAt === "number"
          ? ex.withdrawRequestedAt
          : typeof ex.withdrawRequestedAt === "string"
            ? parseInt(ex.withdrawRequestedAt, 10) || 0
            : 0;
      const chargedActual = requirements.amount;
      const signedCumulative = raw.voucher.cumulativeAmount;
      const session: SubchannelSession = {
        serviceId: lowerServiceId(raw.deposit.serviceId),
        payer: raw.deposit.payer.toLowerCase(),
        chargedCumulativeAmount: chargedActual,
        signedCumulativeAmount: signedCumulative,
        lastNonce: raw.voucher.nonce,
        signature: raw.voucher.signature,
        deposit: depositSnap,
        totalClaimed: totalClaimedSnap,
        withdrawRequestedAt: withdrawAtSnap,
        lastRequestTimestamp: Date.now(),
      };
      await this.storage.set(lowerServiceId(raw.deposit.serviceId), raw.deposit.payer, session);
      result.extra = {
        ...ex,
        serviceId: raw.deposit.serviceId,
        chargedCumulativeAmount: chargedActual,
        nonce: raw.voucher.nonce,
      };
    }
  }

  /**
   * Parses a money string or number into a decimal number.
   *
   * @param money - The money value to parse.
   * @returns The numeric amount.
   */
  private parseMoneyToDecimal(money: string | number): number {
    if (typeof money === "number") {
      return money;
    }

    const cleanMoney = money.replace(/^\$/, "").trim();
    const amount = parseFloat(cleanMoney);

    if (isNaN(amount)) {
      throw new Error(`Invalid money format: ${money}`);
    }

    return amount;
  }

  /**
   * Converts a dollar amount to the default token amount for the network.
   *
   * @param amount - The dollar amount as a number.
   * @param network - The target network.
   * @returns Asset amount using the default asset for the network.
   */
  private defaultMoneyConversion(amount: number, network: Network): AssetAmount {
    const assetInfo = getDefaultAsset(network);
    const tokenAmount = this.convertToTokenAmount(amount.toString(), assetInfo.decimals);

    return {
      amount: tokenAmount,
      asset: assetInfo.address,
      extra: {
        serviceId: this.serviceId,
        name: assetInfo.name,
        version: assetInfo.version,
      },
    };
  }

  /**
   * Converts a decimal string to a fixed-point integer token amount string.
   *
   * @param decimalAmount - The amount as a decimal string (e.g. "1.5").
   * @param decimals - The number of decimal places for the token.
   * @returns Non-negative integer string in smallest units.
   */
  private convertToTokenAmount(decimalAmount: string, decimals: number): string {
    const amount = parseFloat(decimalAmount);
    if (isNaN(amount)) {
      throw new Error(`Invalid amount: ${decimalAmount}`);
    }
    const [intPart, decPart = ""] = String(amount).split(".");
    const paddedDec = decPart.padEnd(decimals, "0").slice(0, decimals);
    const tokenAmount = (intPart + paddedDec).replace(/^0+/, "") || "0";
    return tokenAmount;
  }
}
