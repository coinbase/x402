import type { Hex, PublicClient, WalletClient } from "viem";
import type { FactoryDeployResult } from "./types";

export const P256_OWNER_FACTORY_ABI = [
  {
    type: "function",
    name: "createP256Owner",
    inputs: [
      { name: "x", type: "uint256" },
      { name: "y", type: "uint256" },
    ],
    outputs: [{ name: "", type: "address" }],
    stateMutability: "nonpayable",
  },
  {
    type: "function",
    name: "computeAddress",
    inputs: [
      { name: "x", type: "uint256" },
      { name: "y", type: "uint256" },
    ],
    outputs: [{ name: "", type: "address" }],
    stateMutability: "view",
  },
  {
    type: "function",
    name: "isDeployed",
    inputs: [
      { name: "x", type: "uint256" },
      { name: "y", type: "uint256" },
    ],
    outputs: [{ name: "", type: "bool" }],
    stateMutability: "view",
  },
] as const;

/**
 * Computes the deterministic address for a P256Owner contract.
 *
 * @param client - The public client for contract reads
 * @param factoryAddress - The P256OwnerFactory contract address
 * @param x - The P256 public key x-coordinate
 * @param y - The P256 public key y-coordinate
 * @returns The computed P256Owner contract address
 */
export async function computeP256OwnerAddress(
  client: PublicClient,
  factoryAddress: Hex,
  x: bigint,
  y: bigint,
): Promise<Hex> {
  const addr = await client.readContract({
    address: factoryAddress,
    abi: P256_OWNER_FACTORY_ABI,
    functionName: "computeAddress",
    args: [x, y],
  });
  return addr as Hex;
}

/**
 * Checks whether a P256Owner contract is already deployed.
 *
 * @param client - The public client for contract reads
 * @param factoryAddress - The P256OwnerFactory contract address
 * @param x - The P256 public key x-coordinate
 * @param y - The P256 public key y-coordinate
 * @returns Whether the P256Owner contract is deployed
 */
export async function isP256OwnerDeployed(
  client: PublicClient,
  factoryAddress: Hex,
  x: bigint,
  y: bigint,
): Promise<boolean> {
  return client.readContract({
    address: factoryAddress,
    abi: P256_OWNER_FACTORY_ABI,
    functionName: "isDeployed",
    args: [x, y],
  });
}

/**
 * Deploys a P256Owner contract via the factory, or returns the existing address if already deployed.
 *
 * @param walletClient - The wallet client for sending transactions
 * @param publicClient - The public client for contract reads
 * @param factoryAddress - The P256OwnerFactory contract address
 * @param x - The P256 public key x-coordinate
 * @param y - The P256 public key y-coordinate
 * @returns The deployment result including address and deployment status
 */
export async function deployP256Owner(
  walletClient: WalletClient,
  publicClient: PublicClient,
  factoryAddress: Hex,
  x: bigint,
  y: bigint,
): Promise<FactoryDeployResult> {
  const alreadyDeployed = await isP256OwnerDeployed(publicClient, factoryAddress, x, y);
  const address = await computeP256OwnerAddress(publicClient, factoryAddress, x, y);

  if (alreadyDeployed) {
    return { address, alreadyDeployed: true };
  }

  const account = walletClient.account;
  if (!account) {
    throw new Error("WalletClient must have an account configured");
  }

  const txHash = await walletClient.writeContract({
    address: factoryAddress,
    abi: P256_OWNER_FACTORY_ABI,
    functionName: "createP256Owner",
    args: [x, y],
    account,
    chain: undefined,
  });
  await publicClient.waitForTransactionReceipt({ hash: txHash });

  return { address, txHash, alreadyDeployed: false };
}
