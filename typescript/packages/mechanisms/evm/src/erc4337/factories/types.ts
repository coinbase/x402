import type { Hex } from "viem";
import { FCL_P256_VERIFIER, P256_OWNER_FACTORY, WEBAUTHN_SIGNER_FACTORY } from "../constants";

export const FACTORY_ADDRESSES: FactoryAddresses = {
  p256OwnerFactory: P256_OWNER_FACTORY,
  webAuthnSignerFactory: WEBAUTHN_SIGNER_FACTORY,
  fclP256Verifier: FCL_P256_VERIFIER,
};

export interface FactoryAddresses {
  p256OwnerFactory: Hex;
  webAuthnSignerFactory: Hex;
  fclP256Verifier: Hex;
}

export interface FactoryDeployResult {
  address: Hex;
  txHash?: Hex;
  alreadyDeployed: boolean;
}

export interface OwnerAddresses {
  p256OwnerAddress: Hex;
  webAuthnSignerAddress: Hex;
}
