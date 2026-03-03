import { describe, expect, it, vi, beforeEach } from "vitest";
import type { Hex, PublicClient, Transport, Chain } from "viem";
import type { SmartAccount } from "viem/account-abstraction";
import type { P256Signer } from "../../../../src/erc4337/accounts/types";
import { SAFE_4337_MODULE_ADDRESS, entryPoint07Address } from "../../../../src/erc4337/constants";

// Mock permissionless -- vi.mock is hoisted, so we cannot reference outer variables
vi.mock("permissionless/accounts", () => ({
  toSafeSmartAccount: vi.fn(),
}));

import { toP256SafeSmartAccount } from "../../../../src/erc4337/accounts/toP256SafeSmartAccount";
import { toSafeSmartAccount as permissionlessToSafe } from "permissionless/accounts";

describe("toP256SafeSmartAccount", () => {
  const mockClient = {
    getChainId: vi.fn().mockResolvedValue(84532),
  } as unknown as PublicClient<Transport, Chain>;

  const mockP256Signer: P256Signer = {
    p256OwnerAddress: "0x1234567890123456789012345678901234567890" as Hex,
    sign: vi.fn().mockResolvedValue({
      r: "0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa" as Hex,
      s: "0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb" as Hex,
    }),
  };

  const mockBaseAccount = {
    address: "0xSafeAddress1234567890123456789012345678" as Hex,
    signUserOperation: vi.fn(),
    encodeCalls: vi.fn(),
    getNonce: vi.fn(),
  } as unknown as SmartAccount;

  beforeEach(() => {
    vi.clearAllMocks();
    (permissionlessToSafe as ReturnType<typeof vi.fn>).mockResolvedValue(mockBaseAccount);
  });

  it("should create SmartAccount with correct address from base account", async () => {
    const account = await toP256SafeSmartAccount({
      client: mockClient,
      p256Signer: mockP256Signer,
    });

    expect(account).toBeDefined();
    expect(account.address).toBe(mockBaseAccount.address);
  });

  it("should call permissionless toSafeSmartAccount with correct parameters", async () => {
    await toP256SafeSmartAccount({
      client: mockClient,
      p256Signer: mockP256Signer,
    });

    expect(permissionlessToSafe).toHaveBeenCalledWith(
      expect.objectContaining({
        client: mockClient,
        owners: expect.arrayContaining([
          expect.objectContaining({
            address: mockP256Signer.p256OwnerAddress,
          }),
        ]),
        version: "1.5.0",
        entryPoint: {
          address: entryPoint07Address,
          version: "0.7",
        },
        safe4337ModuleAddress: SAFE_4337_MODULE_ADDRESS,
      }),
    );
  });

  it("should use default safe4337ModuleAddress when not provided", async () => {
    await toP256SafeSmartAccount({
      client: mockClient,
      p256Signer: mockP256Signer,
    });

    expect(permissionlessToSafe).toHaveBeenCalledWith(
      expect.objectContaining({
        safe4337ModuleAddress: SAFE_4337_MODULE_ADDRESS,
      }),
    );
  });

  it("should use custom safe4337ModuleAddress when provided", async () => {
    const customModuleAddress = "0xCustomModule12345678901234567890123456789" as Hex;

    await toP256SafeSmartAccount({
      client: mockClient,
      p256Signer: mockP256Signer,
      safe4337ModuleAddress: customModuleAddress,
    });

    expect(permissionlessToSafe).toHaveBeenCalledWith(
      expect.objectContaining({
        safe4337ModuleAddress: customModuleAddress,
      }),
    );
  });

  it("should use default entryPoint when not provided", async () => {
    await toP256SafeSmartAccount({
      client: mockClient,
      p256Signer: mockP256Signer,
    });

    expect(permissionlessToSafe).toHaveBeenCalledWith(
      expect.objectContaining({
        entryPoint: {
          address: entryPoint07Address,
          version: "0.7",
        },
      }),
    );
  });

  it("should use custom entryPoint when provided", async () => {
    const customEntryPoint = "0xCustomEntryPoint123456789012345678901234" as Hex;

    await toP256SafeSmartAccount({
      client: mockClient,
      p256Signer: mockP256Signer,
      entryPoint: {
        address: customEntryPoint,
        version: "0.7",
      },
    });

    expect(permissionlessToSafe).toHaveBeenCalledWith(
      expect.objectContaining({
        entryPoint: {
          address: customEntryPoint,
          version: "0.7",
        },
      }),
    );
  });

  it("should pass safeAddress when provided", async () => {
    const safeAddress = "0xSafeAddress123456789012345678901234567890" as Hex;

    await toP256SafeSmartAccount({
      client: mockClient,
      p256Signer: mockP256Signer,
      safeAddress,
    });

    expect(permissionlessToSafe).toHaveBeenCalledWith(
      expect.objectContaining({
        address: safeAddress,
      }),
    );
  });

  it("should not pass address when safeAddress is not provided", async () => {
    await toP256SafeSmartAccount({
      client: mockClient,
      p256Signer: mockP256Signer,
    });

    const callArgs = (permissionlessToSafe as ReturnType<typeof vi.fn>).mock.calls[0][0];
    expect(callArgs.address).toBeUndefined();
  });

  describe("mock local account methods", () => {
    it("should create a mock owner with correct address", async () => {
      await toP256SafeSmartAccount({
        client: mockClient,
        p256Signer: mockP256Signer,
      });

      const callArgs = (permissionlessToSafe as ReturnType<typeof vi.fn>).mock.calls[0][0];
      const owner = callArgs.owners[0];
      expect(owner.address).toBe(mockP256Signer.p256OwnerAddress);
      expect(owner.type).toBe("local");
      expect(owner.source).toBe("custom");
    });

    it("should throw correct error message from mock signMessage", async () => {
      await toP256SafeSmartAccount({
        client: mockClient,
        p256Signer: mockP256Signer,
      });

      const callArgs = (permissionlessToSafe as ReturnType<typeof vi.fn>).mock.calls[0][0];
      const owner = callArgs.owners[0];
      expect(() => owner.signMessage()).toThrow(
        "P256 contract owner: use signUserOperation instead",
      );
    });

    it("should throw correct error message from mock signTypedData", async () => {
      await toP256SafeSmartAccount({
        client: mockClient,
        p256Signer: mockP256Signer,
      });

      const callArgs = (permissionlessToSafe as ReturnType<typeof vi.fn>).mock.calls[0][0];
      const owner = callArgs.owners[0];
      expect(() => owner.signTypedData()).toThrow(
        "P256 contract owner: use signUserOperation instead",
      );
    });

    it("should throw correct error message from mock signTransaction", async () => {
      await toP256SafeSmartAccount({
        client: mockClient,
        p256Signer: mockP256Signer,
      });

      const callArgs = (permissionlessToSafe as ReturnType<typeof vi.fn>).mock.calls[0][0];
      const owner = callArgs.owners[0];
      expect(() => owner.signTransaction()).toThrow(
        "P256 contract owner: use signUserOperation instead",
      );
    });

    it("should throw correct error message from mock sign", async () => {
      await toP256SafeSmartAccount({
        client: mockClient,
        p256Signer: mockP256Signer,
      });

      const callArgs = (permissionlessToSafe as ReturnType<typeof vi.fn>).mock.calls[0][0];
      const owner = callArgs.owners[0];
      expect(() => owner.sign()).toThrow("P256 contract owner: use signUserOperation instead");
    });
  });

  it("should override signUserOperation on the returned account", async () => {
    const account = await toP256SafeSmartAccount({
      client: mockClient,
      p256Signer: mockP256Signer,
    });

    // The returned account should have a signUserOperation method
    expect(typeof account.signUserOperation).toBe("function");
    // It should NOT be the base account's signUserOperation
    expect(account.signUserOperation).not.toBe(mockBaseAccount.signUserOperation);
  });
});
