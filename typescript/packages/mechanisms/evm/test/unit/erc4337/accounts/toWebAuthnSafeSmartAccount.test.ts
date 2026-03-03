import { describe, expect, it, vi, beforeEach } from "vitest";
import type { Hex, PublicClient, Transport, Chain } from "viem";
import type { SmartAccount, WebAuthnAccount } from "viem/account-abstraction";
import { SAFE_4337_MODULE_ADDRESS, entryPoint07Address } from "../../../../src/erc4337/constants";

// Mock permissionless -- vi.mock is hoisted, so we cannot reference outer variables
vi.mock("permissionless/accounts", () => ({
  toSafeSmartAccount: vi.fn(),
}));

import { toWebAuthnSafeSmartAccount } from "../../../../src/erc4337/accounts/toWebAuthnSafeSmartAccount";
import { toSafeSmartAccount as permissionlessToSafe } from "permissionless/accounts";

describe("toWebAuthnSafeSmartAccount", () => {
  const mockClient = {} as PublicClient<Transport, Chain>;

  const mockWebAuthnAccount = {
    publicKey: "0x04" + "cc".repeat(32) + "dd".repeat(32),
    sign: vi.fn(),
  } as unknown as WebAuthnAccount;

  const mockBaseAccount = {
    address: "0xSafeAddress1234567890123456789012345678" as Hex,
    signUserOperation: vi.fn(),
  } as unknown as SmartAccount;

  beforeEach(() => {
    vi.clearAllMocks();
    (permissionlessToSafe as ReturnType<typeof vi.fn>).mockResolvedValue(mockBaseAccount);
  });

  it("should delegate to permissionless toSafeSmartAccount with correct params", async () => {
    const result = await toWebAuthnSafeSmartAccount({
      client: mockClient,
      webAuthnAccount: mockWebAuthnAccount,
    });

    expect(permissionlessToSafe).toHaveBeenCalledTimes(1);
    expect(permissionlessToSafe).toHaveBeenCalledWith(
      expect.objectContaining({
        client: mockClient,
        owners: [mockWebAuthnAccount],
        version: "1.5.0",
        entryPoint: {
          address: entryPoint07Address,
          version: "0.7",
        },
        safe4337ModuleAddress: SAFE_4337_MODULE_ADDRESS,
      }),
    );
    expect(result).toBe(mockBaseAccount);
  });

  it("should use default safe4337ModuleAddress when not provided", async () => {
    await toWebAuthnSafeSmartAccount({
      client: mockClient,
      webAuthnAccount: mockWebAuthnAccount,
    });

    expect(permissionlessToSafe).toHaveBeenCalledWith(
      expect.objectContaining({
        safe4337ModuleAddress: SAFE_4337_MODULE_ADDRESS,
      }),
    );
  });

  it("should use custom safe4337ModuleAddress when provided", async () => {
    const customModuleAddress = "0xCustomModule12345678901234567890123456789" as Hex;

    await toWebAuthnSafeSmartAccount({
      client: mockClient,
      webAuthnAccount: mockWebAuthnAccount,
      safe4337ModuleAddress: customModuleAddress,
    });

    expect(permissionlessToSafe).toHaveBeenCalledWith(
      expect.objectContaining({
        safe4337ModuleAddress: customModuleAddress,
      }),
    );
  });

  it("should use default entryPoint when not provided", async () => {
    await toWebAuthnSafeSmartAccount({
      client: mockClient,
      webAuthnAccount: mockWebAuthnAccount,
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

    await toWebAuthnSafeSmartAccount({
      client: mockClient,
      webAuthnAccount: mockWebAuthnAccount,
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

    await toWebAuthnSafeSmartAccount({
      client: mockClient,
      webAuthnAccount: mockWebAuthnAccount,
      safeAddress,
    });

    expect(permissionlessToSafe).toHaveBeenCalledWith(
      expect.objectContaining({
        address: safeAddress,
      }),
    );
  });

  it("should not pass address when safeAddress is not provided", async () => {
    await toWebAuthnSafeSmartAccount({
      client: mockClient,
      webAuthnAccount: mockWebAuthnAccount,
    });

    const callArgs = (permissionlessToSafe as ReturnType<typeof vi.fn>).mock.calls[0][0];
    expect(callArgs.address).toBeUndefined();
  });

  it("should pass safeWebAuthnSharedSignerAddress when provided", async () => {
    const sharedSignerAddress = "0xfD90FAd33ee8b58f32c00aceEad1358e4AFC23f9" as Hex;

    await toWebAuthnSafeSmartAccount({
      client: mockClient,
      webAuthnAccount: mockWebAuthnAccount,
      safeWebAuthnSharedSignerAddress: sharedSignerAddress,
    });

    expect(permissionlessToSafe).toHaveBeenCalledWith(
      expect.objectContaining({
        safeWebAuthnSharedSignerAddress: sharedSignerAddress,
      }),
    );
  });

  it("should not pass safeWebAuthnSharedSignerAddress when not provided", async () => {
    await toWebAuthnSafeSmartAccount({
      client: mockClient,
      webAuthnAccount: mockWebAuthnAccount,
    });

    const callArgs = (permissionlessToSafe as ReturnType<typeof vi.fn>).mock.calls[0][0];
    expect(callArgs.safeWebAuthnSharedSignerAddress).toBeUndefined();
  });
});
