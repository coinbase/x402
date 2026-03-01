import type { Hex, LocalAccount } from "viem";
import { concat, pad, toHex } from "viem";
import type { SmartAccount } from "viem/account-abstraction";
import { toSafeSmartAccount } from "permissionless/accounts";

import type { ToP256SafeSmartAccountParams } from "./types";
import { encodeContractSignature } from "./encodeContractSignature";
import type { SafeOpHashParams } from "./computeSafeOpHash";
import { computeSafeOpHash } from "./computeSafeOpHash";
import { SAFE_4337_MODULE_ADDRESS, entryPoint07Address } from "../constants";

/**
 * Creates a mock LocalAccount that has the P256Owner contract address.
 *
 * This is needed because `toSafeSmartAccount` requires a `LocalAccount` owner,
 * but our actual signer is a P256Owner contract (ERC-1271). The mock provides
 * the correct address so the Safe is configured with the right owner. The
 * signing methods are never called since we override `signUserOperation`.
 *
 * @param address - The address to use for the mock account
 * @returns A mock LocalAccount with the given address
 */
function createMockLocalAccount(address: Hex): LocalAccount {
  const notImplemented = () => {
    throw new Error("P256 contract owner: use signUserOperation instead");
  };

  return {
    address,
    type: "local",
    source: "custom",
    publicKey: "0x" as Hex,
    signMessage: notImplemented,
    signTypedData: notImplemented,
    signTransaction: notImplemented,
    sign: notImplemented,
  } as unknown as LocalAccount;
}

/**
 * Creates a Safe SmartAccount that signs UserOperations with a P256 contract owner.
 *
 * This wraps permissionless's `toSafeSmartAccount` and overrides `signUserOperation`
 * to produce P256 signatures in Safe's contract signature format (v=0). The resulting
 * account is compatible with `SafeAccountSigner` and `ExactEvmSchemeERC4337`.
 *
 * @param params - Configuration for the P256 Safe smart account
 * @returns A SmartAccount that signs with P256 in Safe contract signature format
 */
export async function toP256SafeSmartAccount(
  params: ToP256SafeSmartAccountParams,
): Promise<SmartAccount> {
  const safe4337ModuleAddress = params.safe4337ModuleAddress ?? SAFE_4337_MODULE_ADDRESS;
  const entryPointAddress = params.entryPoint?.address ?? entryPoint07Address;

  const mockOwner = createMockLocalAccount(params.p256Signer.p256OwnerAddress);

  const baseAccount = await toSafeSmartAccount({
    client: params.client,
    owners: [mockOwner],
    version: "1.5.0",
    ...(params.safeAddress ? { address: params.safeAddress } : {}),
    entryPoint: {
      address: entryPointAddress,
      version: "0.7",
    },
    safe4337ModuleAddress,
  });

  const chainId = await params.client.getChainId();

  return {
    ...baseAccount,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    async signUserOperation(userOp: any) {
      const op = userOp as Record<string, unknown>;
      // Compute the SafeOp EIP-712 hash (what Safe4337Module verifies)
      const hashParams: SafeOpHashParams = {
        sender: op.sender as Hex,
        nonce: BigInt(op.nonce as bigint),
        factory: (op.factory as Hex) ?? null,
        factoryData: (op.factoryData as Hex) ?? null,
        callData: op.callData as Hex,
        verificationGasLimit: BigInt(op.verificationGasLimit as bigint),
        callGasLimit: BigInt(op.callGasLimit as bigint),
        preVerificationGas: BigInt(op.preVerificationGas as bigint),
        maxPriorityFeePerGas: BigInt(op.maxPriorityFeePerGas as bigint),
        maxFeePerGas: BigInt(op.maxFeePerGas as bigint),
        paymaster: (op.paymaster as Hex) ?? null,
        paymasterVerificationGasLimit: op.paymasterVerificationGasLimit
          ? BigInt(op.paymasterVerificationGasLimit as bigint)
          : null,
        paymasterPostOpGasLimit: op.paymasterPostOpGasLimit
          ? BigInt(op.paymasterPostOpGasLimit as bigint)
          : null,
        paymasterData: (op.paymasterData as Hex) ?? null,
      };
      const safeOpHash = computeSafeOpHash(
        hashParams,
        chainId,
        safe4337ModuleAddress,
        entryPointAddress,
      );

      // Sign the SafeOp hash with P256
      const { r, s } = await params.p256Signer.sign(safeOpHash);

      // Encode r || s as 64-byte signature
      const rPadded = pad(r as Hex, { size: 32 });
      const sPadded = pad(s as Hex, { size: 32 });
      const p256Signature = concat([rPadded, sPadded]);

      // Wrap in Safe contract signature format (v=0)
      const contractSig = encodeContractSignature(
        params.p256Signer.p256OwnerAddress,
        p256Signature,
      );

      // Safe4337Module expects: validAfter (6 bytes) || validUntil (6 bytes) || signatures
      const validAfter = pad(toHex(0), { size: 6 });
      const validUntil = pad(toHex(0), { size: 6 });

      return concat([validAfter, validUntil, contractSig]);
    },
  } as SmartAccount;
}
