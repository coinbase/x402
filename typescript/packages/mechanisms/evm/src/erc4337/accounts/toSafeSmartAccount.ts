import type { Hex, LocalAccount } from "viem";
import { concat, encodeAbiParameters, pad, toHex } from "viem";
import type { SmartAccount, WebAuthnAccount } from "viem/account-abstraction";
import { toSafeSmartAccount as toPermissionlessSafeSmartAccount } from "permissionless/accounts";

import type { P256Signer, ToSafeSmartAccountParams } from "./types";
import { toP256SafeSmartAccount } from "./toP256SafeSmartAccount";
import { toWebAuthnSafeSmartAccount } from "./toWebAuthnSafeSmartAccount";
import { encodeContractSignature } from "./encodeContractSignature";
import { computeSafeOpHash } from "./computeSafeOpHash";
import type { SafeOpHashParams } from "./computeSafeOpHash";
import {
  SAFE_4337_MODULE_ADDRESS,
  SAFE_WEBAUTHN_SHARED_SIGNER,
  entryPoint07Address,
} from "../constants";

/**
 * Creates a Safe SmartAccount with a unified signer configuration.
 *
 * Dispatches to the appropriate implementation based on `signerConfig.type`:
 * - `"p256"`: P256 contract owner (existing `toP256SafeSmartAccount`)
 * - `"webauthn"`: WebAuthn passkey via permissionless native support
 * - `"multi"`: Both P256 and WebAuthn owners on a single Safe
 *
 * @param params - Configuration including signer type and client
 * @returns A SmartAccount configured with the appropriate signer
 */
export async function toSafeSmartAccount(params: ToSafeSmartAccountParams): Promise<SmartAccount> {
  const { signerConfig } = params;

  switch (signerConfig.type) {
    case "p256":
      return toP256SafeSmartAccount({
        client: params.client,
        p256Signer: signerConfig.p256Signer,
        safeAddress: params.safeAddress,
        entryPoint: params.entryPoint,
        safe4337ModuleAddress: params.safe4337ModuleAddress,
      });

    case "webauthn":
      return toWebAuthnSafeSmartAccount({
        client: params.client,
        webAuthnAccount: signerConfig.webAuthnAccount,
        safeAddress: params.safeAddress,
        entryPoint: params.entryPoint,
        safe4337ModuleAddress: params.safe4337ModuleAddress,
        safeWebAuthnSharedSignerAddress: signerConfig.safeWebAuthnSharedSignerAddress,
      });

    case "multi":
      return buildMultiSignerAccount(params, signerConfig.signers, signerConfig.threshold ?? 1);
  }
}

/**
 * Creates a mock LocalAccount for use as a Safe owner placeholder.
 *
 * @param address - The address to use for the mock account
 * @returns A mock LocalAccount with the given address
 */
function createMockLocalAccount(address: Hex): LocalAccount {
  const notImplemented = () => {
    throw new Error("Mock owner: use signUserOperation instead");
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
 * Encodes a WebAuthn signature from raw sign() output into the ABI format
 * expected by Safe's WebAuthn verifier:
 * `(bytes authenticatorData, string clientDataFields, uint256[2] signature)`
 *
 * permissionless does not export this helper, so we implement it here.
 *
 * @param owner - The WebAuthn account to sign with
 * @param hash - The hash to sign
 * @returns The ABI-encoded WebAuthn signature
 */
async function encodeWebAuthnSignature(owner: WebAuthnAccount, hash: Hex): Promise<Hex> {
  const { signature: signatureData, webauthn } = await owner.sign({ hash });

  // Extract r, s from the DER-encoded P256 signature
  const sigBytes = signatureData.slice(2);
  const r = BigInt("0x" + sigBytes.slice(0, 64));
  const s = BigInt("0x" + sigBytes.slice(64, 128));

  // Extract the fields after "challenge":"..." from clientDataJSON
  const match = webauthn.clientDataJSON.match(
    /^\{"type":"webauthn.get","challenge":"[A-Za-z0-9\-_]{43}",(.*)\}$/,
  );
  const clientDataFields = match ? match[1] : "";

  return encodeAbiParameters(
    [
      { name: "authenticatorData", type: "bytes" },
      { name: "clientDataFields", type: "string" },
      { name: "signature", type: "uint256[2]" },
    ],
    [webauthn.authenticatorData, clientDataFields, [r, s]],
  );
}

/**
 * Builds a multi-signer Safe account with both P256 and WebAuthn owners.
 *
 * @param params - The Safe smart account parameters
 * @param signers - The signer configuration containing P256 and/or WebAuthn signers
 * @param signers.p256 - Optional P256 signer
 * @param signers.webAuthn - Optional WebAuthn account
 * @param threshold - The number of required signatures
 * @returns A SmartAccount with multi-signer support
 */
async function buildMultiSignerAccount(
  params: ToSafeSmartAccountParams,
  signers: { p256?: P256Signer; webAuthn?: WebAuthnAccount },
  threshold: number,
): Promise<SmartAccount> {
  if (!signers.p256 && !signers.webAuthn) {
    throw new Error("Multi-signer config requires at least one signer");
  }

  // If only one signer is provided, delegate to the single-signer function
  if (signers.p256 && !signers.webAuthn) {
    return toP256SafeSmartAccount({
      client: params.client,
      p256Signer: signers.p256,
      safeAddress: params.safeAddress,
      entryPoint: params.entryPoint,
      safe4337ModuleAddress: params.safe4337ModuleAddress,
    });
  }
  if (signers.webAuthn && !signers.p256) {
    const signerConfig = params.signerConfig;
    const sharedSignerAddr =
      signerConfig.type === "multi" ? signerConfig.safeWebAuthnSharedSignerAddress : undefined;
    return toWebAuthnSafeSmartAccount({
      client: params.client,
      webAuthnAccount: signers.webAuthn,
      safeAddress: params.safeAddress,
      entryPoint: params.entryPoint,
      safe4337ModuleAddress: params.safe4337ModuleAddress,
      safeWebAuthnSharedSignerAddress: sharedSignerAddr,
    });
  }

  // Both signers present
  const p256Signer = signers.p256!;
  const webAuthnAccount = signers.webAuthn!;

  const safe4337ModuleAddress = params.safe4337ModuleAddress ?? SAFE_4337_MODULE_ADDRESS;
  const entryPointAddress = params.entryPoint?.address ?? entryPoint07Address;

  const mockP256Owner = createMockLocalAccount(p256Signer.p256OwnerAddress);

  // Build account with both owners: mock LocalAccount for P256 + WebAuthnAccount
  const baseAccount = await toPermissionlessSafeSmartAccount({
    client: params.client,
    owners: [mockP256Owner, webAuthnAccount],
    version: "1.5.0",
    threshold: BigInt(threshold),
    ...(params.safeAddress ? { address: params.safeAddress } : {}),
    entryPoint: {
      address: entryPointAddress,
      version: "0.7",
    },
    safe4337ModuleAddress,
  });

  const chainId = await params.client.getChainId();

  if (threshold >= 2) {
    return buildThreshold2Account(
      baseAccount as SmartAccount,
      p256Signer,
      webAuthnAccount,
      chainId,
      safe4337ModuleAddress,
      entryPointAddress,
    );
  }

  // Threshold 1: P256 signs by default (no browser interaction needed)
  return buildThreshold1Account(
    baseAccount as SmartAccount,
    p256Signer,
    chainId,
    safe4337ModuleAddress,
    entryPointAddress,
  );
}

/**
 * Builds a threshold-1 account that signs with P256 by default.
 *
 * @param baseAccount - The base Safe smart account
 * @param p256Signer - The P256 signer for user operations
 * @param chainId - The chain ID for SafeOp hash computation
 * @param safe4337ModuleAddress - The Safe4337Module address
 * @param entryPointAddress - The EntryPoint address
 * @returns A SmartAccount with P256 signing
 */
function buildThreshold1Account(
  baseAccount: SmartAccount,
  p256Signer: P256Signer,
  chainId: number,
  safe4337ModuleAddress: Hex,
  entryPointAddress: Hex,
): SmartAccount {
  return {
    ...baseAccount,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    async signUserOperation(userOp: any) {
      const safeOpHash = computeSafeOpHash(
        extractSafeOpHashParams(userOp),
        chainId,
        safe4337ModuleAddress,
        entryPointAddress,
      );

      const { r, s } = await p256Signer.sign(safeOpHash);
      const rPadded = pad(r as Hex, { size: 32 });
      const sPadded = pad(s as Hex, { size: 32 });
      const p256Signature = concat([rPadded, sPadded]);

      const contractSig = encodeContractSignature(p256Signer.p256OwnerAddress, p256Signature);

      const validAfter = pad(toHex(0), { size: 6 });
      const validUntil = pad(toHex(0), { size: 6 });

      return concat([validAfter, validUntil, contractSig]);
    },
  } as SmartAccount;
}

/**
 * Builds a threshold-2 account requiring both P256 and WebAuthn signatures.
 *
 * @param baseAccount - The base Safe smart account
 * @param p256Signer - The P256 signer
 * @param webAuthnAccount - The WebAuthn account
 * @param chainId - The chain ID for SafeOp hash computation
 * @param safe4337ModuleAddress - The Safe4337Module address
 * @param entryPointAddress - The EntryPoint address
 * @returns A SmartAccount with dual-signer support
 */
function buildThreshold2Account(
  baseAccount: SmartAccount,
  p256Signer: P256Signer,
  webAuthnAccount: WebAuthnAccount,
  chainId: number,
  safe4337ModuleAddress: Hex,
  entryPointAddress: Hex,
): SmartAccount {
  return {
    ...baseAccount,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    async signUserOperation(userOp: any) {
      const safeOpHash = computeSafeOpHash(
        extractSafeOpHashParams(userOp),
        chainId,
        safe4337ModuleAddress,
        entryPointAddress,
      );

      // Sign with P256
      const { r, s } = await p256Signer.sign(safeOpHash);
      const rPadded = pad(r as Hex, { size: 32 });
      const sPadded = pad(s as Hex, { size: 32 });
      const p256SignatureData = concat([rPadded, sPadded]);

      // Sign with WebAuthn
      const webAuthnSignatureData = await encodeWebAuthnSignature(webAuthnAccount, safeOpHash);

      // Build sorted multi-signature
      // Safe requires signatures sorted by signer address (ascending)
      const p256SignerAddress = p256Signer.p256OwnerAddress.toLowerCase();
      const webAuthnSignerAddress = SAFE_WEBAUTHN_SHARED_SIGNER.toLowerCase();

      type SignerEntry = {
        address: string;
        data: Hex;
        dynamic: boolean;
        contractOwner: boolean;
      };

      const signerEntries: SignerEntry[] = [
        {
          address: p256SignerAddress,
          data: p256SignatureData,
          dynamic: true,
          contractOwner: true,
        },
        {
          address: webAuthnSignerAddress,
          data: webAuthnSignatureData,
          dynamic: true,
          contractOwner: false,
        },
      ].sort((a, b) => (a.address < b.address ? -1 : 1));

      const concatenatedSig = concatSafeSignatures(signerEntries);

      const validAfter = pad(toHex(0), { size: 6 });
      const validUntil = pad(toHex(0), { size: 6 });

      return concat([validAfter, validUntil, concatenatedSig]);
    },
  } as SmartAccount;
}

/**
 * Concatenates multiple Safe signatures with proper static/dynamic layout.
 *
 * @param entries - The signer entries to concatenate
 * @returns The concatenated signature bytes
 */
function concatSafeSignatures(
  entries: { address: string; data: Hex; dynamic: boolean; contractOwner: boolean }[],
): Hex {
  const staticPartSize = 65; // per signer
  const totalStaticSize = staticPartSize * entries.length;

  const staticParts: Hex[] = [];
  const dynamicParts: Hex[] = [];
  let dynamicOffset = totalStaticSize;

  for (const entry of entries) {
    if (entry.dynamic) {
      // Dynamic signature: static part points to dynamic data
      const r = pad(entry.address as Hex, { size: 32 });
      const s = pad(toHex(dynamicOffset), { size: 32 });
      const v = "0x00" as Hex;
      staticParts.push(concat([r, s, v]));

      // Dynamic part: length-prefixed data
      const dataBytes = (entry.data.length - 2) / 2;
      const length = pad(toHex(dataBytes), { size: 32 });
      dynamicParts.push(concat([length, entry.data]));

      // Advance offset: 32 bytes for length + actual data length
      dynamicOffset += 32 + dataBytes;
    } else {
      // ECDSA: direct 65-byte signature (not used in current multi-signer paths)
      staticParts.push(entry.data);
    }
  }

  return concat([...staticParts, ...dynamicParts]);
}

/**
 * Extracts SafeOpHashParams from a raw user operation object.
 *
 * @param userOp - The raw user operation to extract parameters from
 * @returns The extracted SafeOp hash parameters
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function extractSafeOpHashParams(userOp: any): SafeOpHashParams {
  const op = userOp as Record<string, unknown>;
  return {
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
}
