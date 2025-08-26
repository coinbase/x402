import {
  Provider,
  RpcProvider,
  Contract,
  constants,
  type ProviderInterface,
  type GetBlockResponse,
  type GetTransactionReceiptResponse,
  type BlockIdentifier,
} from "starknet";
import { Network } from "../../types/shared";

/**
 * Starknet connected client for read-only operations
 */
export interface StarknetConnectedClient {
  /** The underlying provider */
  provider: ProviderInterface;
  /** Network the client is connected to */
  network: Network;
  /** Chain ID */
  chainId: string;
}

/**
 * Creates a connected Starknet client for the specified network
 *
 * @param network - The Starknet network to connect to
 * @returns A connected client instance
 * @throws Error if the network is not supported
 */
export function createStarknetConnectedClient(network: string): StarknetConnectedClient {
  const provider = createStarknetProvider(network);
  const chainId = getStarknetChainId(network);

  return {
    provider,
    network: network as Network,
    chainId,
  };
}

/**
 * Creates a Starknet provider for the specified network
 *
 * @param network - The network to create a provider for
 * @returns A Starknet provider instance
 * @throws Error if the network is not supported
 */
export function createStarknetProvider(network: string): ProviderInterface {
  switch (network) {
    case "starknet":
      return new RpcProvider({ 
        nodeUrl: constants.NetworkName.SN_MAIN,
        chainId: constants.StarknetChainId.SN_MAIN,
      });
    case "starknet-sepolia":
      return new RpcProvider({ 
        nodeUrl: constants.NetworkName.SN_SEPOLIA,
        chainId: constants.StarknetChainId.SN_SEPOLIA,
      });
    default:
      throw new Error(`Unsupported Starknet network: ${network}`);
  }
}

/**
 * Gets the chain ID for a Starknet network
 *
 * @param network - The network name
 * @returns The chain ID as a string
 * @throws Error if the network is not supported
 */
export function getStarknetChainId(network: string): string {
  switch (network) {
    case "starknet":
      return constants.StarknetChainId.SN_MAIN;
    case "starknet-sepolia":
      return constants.StarknetChainId.SN_SEPOLIA;
    default:
      throw new Error(`Unsupported Starknet network: ${network}`);
  }
}

/**
 * Gets the latest block information
 *
 * @param client - The Starknet connected client
 * @returns The latest block information
 */
export async function getLatestBlock(client: StarknetConnectedClient): Promise<GetBlockResponse> {
  return await client.provider.getBlock("latest");
}

/**
 * Gets block information by number or hash
 *
 * @param client - The Starknet connected client
 * @param blockIdentifier - Block number, hash, or "latest"/"pending"
 * @returns The block information
 */
export async function getBlock(
  client: StarknetConnectedClient,
  blockIdentifier: BlockIdentifier,
): Promise<GetBlockResponse> {
  return await client.provider.getBlock(blockIdentifier);
}

/**
 * Gets transaction receipt by hash
 *
 * @param client - The Starknet connected client
 * @param transactionHash - The transaction hash
 * @returns The transaction receipt
 */
export async function getTransactionReceipt(
  client: StarknetConnectedClient,
  transactionHash: string,
): Promise<GetTransactionReceiptResponse> {
  return await client.provider.getTransactionReceipt(transactionHash);
}

/**
 * Creates a contract instance for interaction
 *
 * @param client - The Starknet connected client
 * @param contractAddress - The contract address
 * @param abi - The contract ABI
 * @returns A contract instance
 */
export function createContractInstance(
  client: StarknetConnectedClient,
  contractAddress: string,
  abi: any[],
): Contract {
  return new Contract(abi, contractAddress, client.provider);
}

/**
 * Gets the account nonce
 *
 * @param client - The Starknet connected client
 * @param accountAddress - The account address
 * @returns The account nonce
 */
export async function getAccountNonce(
  client: StarknetConnectedClient,
  accountAddress: string,
): Promise<string> {
  return await client.provider.getNonceForAddress(accountAddress);
}

/**
 * Calls a contract function (read-only)
 *
 * @param client - The Starknet connected client
 * @param contractAddress - The contract address
 * @param functionName - The function name to call
 * @param calldata - The function parameters
 * @param blockIdentifier - Optional block identifier
 * @returns The call result
 */
export async function callContract(
  client: StarknetConnectedClient,
  contractAddress: string,
  functionName: string,
  calldata: any[] = [],
  blockIdentifier?: BlockIdentifier,
) {
  return await client.provider.callContract({
    contractAddress,
    entrypoint: functionName,
    calldata,
  }, blockIdentifier);
}

/**
 * Gets storage value at a specific key
 *
 * @param client - The Starknet connected client
 * @param contractAddress - The contract address
 * @param key - The storage key
 * @param blockIdentifier - Optional block identifier
 * @returns The storage value
 */
export async function getStorageAt(
  client: StarknetConnectedClient,
  contractAddress: string,
  key: string,
  blockIdentifier?: BlockIdentifier,
): Promise<string> {
  return await client.provider.getStorageAt(contractAddress, key, blockIdentifier);
}
