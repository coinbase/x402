import type { Hex, PublicClient, WalletClient } from "viem";
import type { FactoryDeployResult } from "./types";

/**
 * RIP-7212 P256 precompile address, available on L2s (Base, Optimism, Arbitrum, etc.).
 * When set in the top 16 bits of the `verifiers` uint176, the SafeWebAuthnSignerProxy
 * uses this precompile for P256 verification instead of making an external call to the
 * fallback verifier. This is required for ERC-4337 compatibility (ERC-7562 forbids
 * external calls during UserOp validation).
 */
export const RIP_7212_PRECOMPILE = 0x100n;

/**
 * Computes the `verifiers` uint176 value for SafeWebAuthnSignerFactory.
 *
 * Layout: top 16 bits = precompile address, bottom 160 bits = fallback verifier.
 * When precompile is set, the signer proxy tries the precompile first (allowed by
 * ERC-7562) and falls back to the contract verifier only if the precompile is
 * unavailable.
 *
 * @param fallbackVerifier - Address of the fallback P256 verifier contract
 * @param precompile - Precompile address (e.g. RIP_7212_PRECOMPILE). Pass null/0n to disable.
 * @returns The computed verifiers uint176 value
 */
export function computeVerifiers(
  fallbackVerifier: Hex,
  precompile: bigint | null = RIP_7212_PRECOMPILE,
): bigint {
  const fallback = BigInt(fallbackVerifier);
  if (!precompile) return fallback;
  return (precompile << 160n) | fallback;
}

export const WEBAUTHN_SIGNER_FACTORY_ABI = [
  {
    type: "function",
    name: "createSigner",
    inputs: [
      { name: "x", type: "uint256" },
      { name: "y", type: "uint256" },
      { name: "verifiers", type: "uint176" },
    ],
    outputs: [{ name: "signer", type: "address" }],
    stateMutability: "nonpayable",
  },
  {
    type: "function",
    name: "getSigner",
    inputs: [
      { name: "x", type: "uint256" },
      { name: "y", type: "uint256" },
      { name: "verifiers", type: "uint176" },
    ],
    outputs: [{ name: "signer", type: "address" }],
    stateMutability: "view",
  },
] as const;

/**
 * Computes the deterministic address for a WebAuthn signer proxy.
 *
 * @param client - The public client for contract reads
 * @param factoryAddress - The SafeWebAuthnSignerFactory address
 * @param verifierAddress - The fallback P256 verifier contract address
 * @param x - The P256 public key x-coordinate
 * @param y - The P256 public key y-coordinate
 * @param precompile - The RIP-7212 precompile address, or null to disable
 * @returns The computed signer proxy address
 */
export async function computeWebAuthnSignerAddress(
  client: PublicClient,
  factoryAddress: Hex,
  verifierAddress: Hex,
  x: bigint,
  y: bigint,
  precompile: bigint | null = RIP_7212_PRECOMPILE,
): Promise<Hex> {
  const verifiers = computeVerifiers(verifierAddress, precompile);
  const addr = await client.readContract({
    address: factoryAddress,
    abi: WEBAUTHN_SIGNER_FACTORY_ABI,
    functionName: "getSigner",
    args: [x, y, verifiers],
  });
  return addr as Hex;
}

/**
 * Checks whether a WebAuthn signer proxy is deployed at the given address.
 *
 * @param client - The public client for bytecode checks
 * @param signerAddress - The expected signer proxy address
 * @returns Whether the signer proxy has code deployed
 */
export async function isWebAuthnSignerDeployed(
  client: PublicClient,
  signerAddress: Hex,
): Promise<boolean> {
  const code = await client.getCode({ address: signerAddress });
  return !!code && code !== "0x";
}

/**
 * Deploys a WebAuthn signer proxy via the factory, or returns the existing address if already deployed.
 *
 * @param walletClient - The wallet client for sending transactions
 * @param publicClient - The public client for contract reads
 * @param factoryAddress - The SafeWebAuthnSignerFactory address
 * @param verifierAddress - The fallback P256 verifier contract address
 * @param x - The P256 public key x-coordinate
 * @param y - The P256 public key y-coordinate
 * @param precompile - The RIP-7212 precompile address, or null to disable
 * @returns The deployment result including address and deployment status
 */
export async function deployWebAuthnSigner(
  walletClient: WalletClient,
  publicClient: PublicClient,
  factoryAddress: Hex,
  verifierAddress: Hex,
  x: bigint,
  y: bigint,
  precompile: bigint | null = RIP_7212_PRECOMPILE,
): Promise<FactoryDeployResult> {
  const verifiers = computeVerifiers(verifierAddress, precompile);

  const signerAddress = (await publicClient.readContract({
    address: factoryAddress,
    abi: WEBAUTHN_SIGNER_FACTORY_ABI,
    functionName: "getSigner",
    args: [x, y, verifiers],
  })) as Hex;

  const deployed = await isWebAuthnSignerDeployed(publicClient, signerAddress);
  if (deployed) {
    return { address: signerAddress, alreadyDeployed: true };
  }

  const account = walletClient.account;
  if (!account) {
    throw new Error("WalletClient must have an account configured");
  }

  const txHash = await walletClient.writeContract({
    address: factoryAddress,
    abi: WEBAUTHN_SIGNER_FACTORY_ABI,
    functionName: "createSigner",
    args: [x, y, verifiers],
    account,
    chain: undefined,
  });
  await publicClient.waitForTransactionReceipt({ hash: txHash });

  return { address: signerAddress, txHash, alreadyDeployed: false };
}
