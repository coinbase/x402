import { describe, it } from "vitest";
import { ExactEvmScheme as ExactEvmClient } from "@x402/evm/exact/client";
import { ExactEvmScheme as ExactEvmServer } from "@x402/evm/exact/server";
import { ExactEvmScheme as ExactEvmFacilitator } from "@x402/evm/exact/facilitator";
import { UptoEvmScheme as UptoEvmClient } from "@x402/evm/upto/client";
import { UptoEvmScheme as UptoEvmServer } from "@x402/evm/upto/server";
import { UptoEvmScheme as UptoEvmFacilitator } from "@x402/evm/upto/facilitator";
import { AuthCaptureEvmScheme } from "@x402/evm/auth-capture/client";
import { BatchSettlementEvmScheme as BatchSettlementEvmClient } from "@x402/evm/batch-settlement/client";
import { BatchSettlementEvmScheme as BatchSettlementEvmServer } from "@x402/evm/batch-settlement/server";
import { BatchSettlementEvmScheme as BatchSettlementEvmFacilitator } from "@x402/evm/batch-settlement/facilitator";
import { BaseScheme as BaseExactClient } from "../../src/exact/client/scheme";
import { BaseScheme as BaseExactServer } from "../../src/exact/server/scheme";
import { BaseScheme as BaseExactFacilitator } from "../../src/exact/facilitator/scheme";
import { BaseScheme as BaseUptoClient } from "../../src/upto/client/scheme";
import { BaseScheme as BaseUptoServer } from "../../src/upto/server/scheme";
import { BaseScheme as BaseUptoFacilitator } from "../../src/upto/facilitator/scheme";
import { BaseScheme as BaseAuthCaptureClient } from "../../src/auth-capture/client/scheme";
import { BaseScheme as BaseBatchSettlementClient } from "../../src/batch-settlement/client/scheme";
import { BaseScheme as BaseBatchSettlementServer } from "../../src/batch-settlement/server/scheme";
import { BaseScheme as BaseBatchSettlementFacilitator } from "../../src/batch-settlement/facilitator/scheme";

/**
 * For each `@x402/evm` scheme class `@x402/base` wraps, reflects over its
 * prototype and asserts every public method also exists on the corresponding
 * `BaseScheme` wrapper's prototype. Catches a future `@x402/evm` method
 * getting added without a matching `@x402/base` delegation.
 *
 * Only covers prototype methods, not instance-field hooks (`schemeHooks`,
 * `findDefaultAsset`, etc.) assigned in constructors - those are covered by
 * the per-scheme unit tests instead. `ignore` excludes `@x402/evm`-internal
 * helpers that are `private` at the type level but still visible on the
 * runtime prototype.
 */
function assertPrototypeDelegation(
  label: string,
  EvmClass: { readonly prototype: object },
  BaseClass: { readonly prototype: object },
  ignore: readonly string[] = [],
): void {
  const evmMembers = Object.getOwnPropertyNames(EvmClass.prototype).filter(
    name => name !== "constructor" && !ignore.includes(name),
  );
  const baseProto = BaseClass.prototype as Record<string, unknown>;

  for (const member of evmMembers) {
    it(`${label}: forwards "${member}"`, () => {
      if (typeof baseProto[member] !== "function") {
        throw new Error(
          `${label}: "${member}" exists on the @x402/evm class prototype but is not a ` +
            `function on the @x402/base wrapper's prototype - it looks like a delegation gap.`,
        );
      }
    });
  }
}

describe("delegation parity (@x402/evm -> @x402/base)", () => {
  describe("exact", () => {
    assertPrototypeDelegation("client", ExactEvmClient, BaseExactClient);
    assertPrototypeDelegation("server", ExactEvmServer, BaseExactServer, [
      "defaultMoneyConversion", // private helper, not part of the public SchemeNetworkServer surface
    ]);
    assertPrototypeDelegation("facilitator", ExactEvmFacilitator, BaseExactFacilitator);
  });

  describe("upto", () => {
    assertPrototypeDelegation("client", UptoEvmClient, BaseUptoClient);
    assertPrototypeDelegation("server", UptoEvmServer, BaseUptoServer, [
      "defaultMoneyConversion", // private helper, not part of the public SchemeNetworkServer surface
    ]);
    assertPrototypeDelegation("facilitator", UptoEvmFacilitator, BaseUptoFacilitator);
  });

  describe("auth-capture", () => {
    assertPrototypeDelegation("client", AuthCaptureEvmScheme, BaseAuthCaptureClient);
  });

  describe("batch-settlement", () => {
    assertPrototypeDelegation("client", BatchSettlementEvmClient, BaseBatchSettlementClient, [
      "normalizeStrategyDepositAmount", // private helper, not part of the public SchemeNetworkClient surface
      "deps", // private helper, not part of the public SchemeNetworkClient surface
      "resolveDepositAmount", // private helper, not part of the public SchemeNetworkClient surface
      "createVoucherPayload", // private helper, not part of the public SchemeNetworkClient surface
    ]);
    assertPrototypeDelegation("server", BatchSettlementEvmServer, BaseBatchSettlementServer, [
      "defaultMoneyConversion", // private helper, not part of the public SchemeNetworkServer surface
    ]);
    assertPrototypeDelegation(
      "facilitator",
      BatchSettlementEvmFacilitator,
      BaseBatchSettlementFacilitator,
    );
  });
});
