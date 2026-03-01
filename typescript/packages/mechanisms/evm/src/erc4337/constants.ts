import type { Hex } from "viem";
import { entryPoint07Address } from "viem/account-abstraction";

export { entryPoint07Address };

export const SAFE_4337_MODULE_ADDRESS =
  "0x75cf11467937ce3F2f357CE24ffc3DBF8fD5c226" as const satisfies Hex;

export const SAFE_WEBAUTHN_SHARED_SIGNER =
  "0xfD90FAd33ee8b58f32c00aceEad1358e4AFC23f9" as const satisfies Hex;

export const FCL_P256_VERIFIER =
  "0xA86e0054C51E4894D88762a017ECc5E5235f5DBA" as const satisfies Hex;

export const P256_OWNER_FACTORY =
  "0x349c03Eb61e26528cbf79F5D3Ba071FcA2aE82cB" as const satisfies Hex;

export const WEBAUTHN_SIGNER_FACTORY =
  "0xF7488fFbe67327ac9f37D5F722d83Fc900852Fbf" as const satisfies Hex;
