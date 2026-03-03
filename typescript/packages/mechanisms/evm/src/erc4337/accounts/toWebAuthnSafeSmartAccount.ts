import type { Hex } from "viem";
import type { SmartAccount, WebAuthnAccount } from "viem/account-abstraction";
import { toSafeSmartAccount } from "permissionless/accounts";
import type { PublicClient, Transport, Chain } from "viem";
import { SAFE_4337_MODULE_ADDRESS, entryPoint07Address } from "../constants";

export type ToWebAuthnSafeSmartAccountParams = {
  client: PublicClient<Transport, Chain>;
  webAuthnAccount: WebAuthnAccount;
  safeAddress?: Hex;
  entryPoint?: { address: Hex; version: "0.7" };
  safe4337ModuleAddress?: Hex;
  safeWebAuthnSharedSignerAddress?: Hex;
};

/**
 * Creates a Safe SmartAccount that signs UserOperations with a WebAuthn passkey.
 *
 * @param params - Configuration for the WebAuthn Safe smart account
 * @returns A SmartAccount that signs with WebAuthn passkeys
 */
export async function toWebAuthnSafeSmartAccount(
  params: ToWebAuthnSafeSmartAccountParams,
): Promise<SmartAccount> {
  const safe4337ModuleAddress = params.safe4337ModuleAddress ?? SAFE_4337_MODULE_ADDRESS;
  const entryPointAddress = params.entryPoint?.address ?? entryPoint07Address;

  const baseAccount = await toSafeSmartAccount({
    client: params.client,
    owners: [params.webAuthnAccount],
    version: "1.5.0",
    ...(params.safeAddress ? { address: params.safeAddress } : {}),
    entryPoint: {
      address: entryPointAddress,
      version: "0.7",
    },
    safe4337ModuleAddress,
    ...(params.safeWebAuthnSharedSignerAddress
      ? { safeWebAuthnSharedSignerAddress: params.safeWebAuthnSharedSignerAddress }
      : {}),
  });

  return baseAccount as SmartAccount;
}
