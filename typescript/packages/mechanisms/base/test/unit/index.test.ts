import { describe, it, expect } from "vitest";
import type { BaseClientSigner, BaseFacilitatorSigner } from "../../src";
import {
  BaseScheme,
  BaseUptoScheme,
  BaseAuthCaptureScheme,
  BaseBatchSettlementScheme,
} from "../../src";
import { BaseScheme as ClientBaseScheme } from "../../src/exact/client";
import { BaseScheme as ServerBaseScheme } from "../../src/exact/server";
import { BaseScheme as FacilitatorBaseScheme } from "../../src/exact/facilitator";
import { BaseScheme as ClientBaseUptoScheme } from "../../src/upto/client";
import { BaseScheme as ClientBaseAuthCaptureScheme } from "../../src/auth-capture/client";
import { BaseScheme as ClientBaseBatchSettlementScheme } from "../../src/batch-settlement/client";

describe("@x402/base", () => {
  it("should export BaseScheme (exact client) from the package root", () => {
    expect(BaseScheme).toBeDefined();
    expect(BaseScheme).toBe(ClientBaseScheme);
  });

  it("should export BaseUptoScheme (upto client) from the package root", () => {
    expect(BaseUptoScheme).toBeDefined();
    expect(BaseUptoScheme).toBe(ClientBaseUptoScheme);
  });

  it("should export BaseAuthCaptureScheme (auth-capture client) from the package root", () => {
    expect(BaseAuthCaptureScheme).toBeDefined();
    expect(BaseAuthCaptureScheme).toBe(ClientBaseAuthCaptureScheme);
  });

  it("should export BaseBatchSettlementScheme (batch-settlement client) from the package root", () => {
    expect(BaseBatchSettlementScheme).toBeDefined();
    expect(BaseBatchSettlementScheme).toBe(ClientBaseBatchSettlementScheme);
  });

  it("should create a client instance", () => {
    const mockSigner: BaseClientSigner = {
      address: "0x1234567890123456789012345678901234567890",
      signTypedData: async () => "0xmocksignature",
    };
    const client = new ClientBaseScheme(mockSigner);
    expect(client.scheme).toBe("exact");
  });

  it("should create a server instance", () => {
    const server = new ServerBaseScheme();
    expect(server.scheme).toBe("exact");
  });

  it("should create a facilitator instance", () => {
    const mockSigner: Pick<BaseFacilitatorSigner, "getAddresses"> = {
      getAddresses: () => ["0x1234567890123456789012345678901234567890"],
    };
    const facilitator = new FacilitatorBaseScheme(mockSigner as BaseFacilitatorSigner);
    expect(facilitator.scheme).toBe("exact");
  });
});
