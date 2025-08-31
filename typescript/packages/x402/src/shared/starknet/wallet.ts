import {
  Account,
  Provider,
  RpcProvider,
  constants,
  ec,
  CallData,
  type AccountInterface,
  type ProviderInterface,
  type Call,
  type InvocationsDetails,
  type EstimateFeeDetails,
  type Signature,
} from "starknet";
import { Network } from "../../types/shared/network";

/**
 * Starknet signer interface that wraps Account functionality
 */
export interface StarknetSigner {
  /** The underlying Starknet account */
  account: AccountInterface;
  /** The provider instance */
  provider: ProviderInterface;
  /** The account address */
  address: string;
  /** Network the signer is connected to */
  network: Network;
}

/**
 * Creates a Starknet signer from a private key.
 *
 * @param network - The Starknet network to connect to
 * @param privateKey - The private key in hex format (with or without 0x prefix)
 * @returns A Starknet signer instance
 * @throws Error if the network is not supported or private key is invalid
 */
export async function createStarknetSigner(
  network: string,
  privateKey: string,
): Promise<StarknetSigner> {
  // Normalize private key format
  const normalizedPrivateKey = privateKey.startsWith("0x") ? privateKey : `0x${privateKey}`;
  
  // Validate private key
  if (!/^0x[0-9a-fA-F]{64}$/.test(normalizedPrivateKey)) {
    throw new Error("Invalid private key format. Expected 64-character hex string.");
  }

  // Get provider for the network
  const provider = getStarknetProvider(network);
  
  // Derive public key and address from private key
  const keyPair = ec.starkCurve.getStarkKey(normalizedPrivateKey);
  const publicKey = ec.starkCurve.getPublicKey(normalizedPrivateKey);
  
  // Calculate account address (using OpenZeppelin account contract class hash)
  const OZAccountClassHash = "0x061dac032f228abef9c6626f995015233097ae253a7f72d68552db02f2971b8f";
  const constructorCalldata = CallData.compile({ publicKey });
  const contractAddress = ec.starkCurve.getContractAddress(
    keyPair,
    OZAccountClassHash,
    constructorCalldata,
    0,
  );

  // Create account instance
  const account = new Account(provider, contractAddress, normalizedPrivateKey);

  return {
    account,
    provider,
    address: contractAddress,
    network: network as Network,
  };
}

/**
 * Type guard to check if an object is a Starknet signer
 *
 * @param signer - The object to check
 * @returns True if the object is a StarknetSigner, false otherwise
 */
export function isStarknetSigner(signer: unknown): signer is StarknetSigner {
  return (
    typeof signer === "object" &&
    signer !== null &&
    "account" in signer &&
    "provider" in signer &&
    "address" in signer &&
    "network" in signer &&
    typeof (signer as StarknetSigner).address === "string" &&
    typeof (signer as StarknetSigner).network === "string"
  );
}

/**
 * Creates a Starknet provider for the specified network
 *
 * @param network - The network to create a provider for
 * @returns A Starknet provider instance
 * @throws Error if the network is not supported
 */
function getStarknetProvider(network: string): ProviderInterface {
  switch (network) {
    case "starknet":
      return new RpcProvider({ nodeUrl: constants.NetworkName.SN_MAIN });
    case "starknet-sepolia":
      return new RpcProvider({ nodeUrl: constants.NetworkName.SN_SEPOLIA });
    default:
      throw new Error(`Unsupported Starknet network: ${network}`);
  }
}

/**
 * Estimates gas fees for a transaction
 *
 * @param signer - The Starknet signer
 * @param calls - Array of contract calls
 * @param details - Optional estimation details
 * @returns Fee estimation result
 */
export async function estimateStarknetFee(
  signer: StarknetSigner,
  calls: Call[],
  details?: EstimateFeeDetails,
) {
  return await signer.account.estimateFee(calls, details);
}

/**
 * Executes a transaction on Starknet
 *
 * @param signer - The Starknet signer
 * @param calls - Array of contract calls to execute
 * @param details - Optional invocation details
 * @returns Transaction response
 */
export async function executeStarknetTransaction(
  signer: StarknetSigner,
  calls: Call[],
  details?: InvocationsDetails,
) {
  return await signer.account.execute(calls, undefined, details);
}

/**
 * Signs a message with the Starknet account
 *
 * @param signer - The Starknet signer
 * @param message - The message to sign (as string or typed data)
 * @returns The signature
 */
export async function signStarknetMessage(
  signer: StarknetSigner,
  message: string | object,
): Promise<Signature> {
  if (typeof message === "string") {
    return await signer.account.signMessage(message);
  } else {
    // For typed data, we need to implement proper EIP-712 style signing
    // This is a simplified version - production code would need proper typed data handling
    return await signer.account.signMessage(JSON.stringify(message));
  }
}
