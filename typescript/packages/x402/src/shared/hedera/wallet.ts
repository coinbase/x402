import { AccountId, Client, PrivateKey } from "@hashgraph/sdk";

/**
 * Represents a connected Hedera client instance.
 * This is a type alias for the Hedera SDK Client class.
 */
export type HederaConnectedClient = Client;

/**
 * Represents a Hedera signer with all necessary components for transaction signing.
 * 
 * @property client - The connected Hedera client instance
 * @property accountId - The account ID for the signer
 * @property privateKey - The private key for signing transactions
 */
export type HederaSigner = {
  client: Client;
  accountId: AccountId;
  privateKey: PrivateKey;
};

/**
 * Creates a Hedera client connected to the specified network.
 * 
 * This function establishes a connection to either Hedera testnet or mainnet
 * based on the provided network identifier. The client is configured with
 * the appropriate network endpoints and settings.
 * 
 * @param network - The network to connect to ("hedera-testnet" or "hedera-mainnet")
 * @returns A Hedera client instance configured for the specified network
 * @throws Error if the network is not supported
 * 
 * @example
 * ```typescript
 * const testnetClient = createHederaConnectedClient("hedera-testnet");
 * const mainnetClient = createHederaConnectedClient("hedera-mainnet");
 * ```
 */
export function createHederaConnectedClient(network: string): HederaConnectedClient {
  if (network === "hedera-testnet") {
    return Client.forTestnet();
  } else if (network === "hedera-mainnet") {
    return Client.forMainnet();
  } else {
    throw new Error(`Unsupported Hedera network: ${network}`);
  }
}

/**
 * Creates a Hedera signer from private key string.
 * 
 * This function creates a complete Hedera signer by:
 * 1. Establishing a client connection to the specified network
 * 2. Parsing the private key from the provided string
 * 3. Converting the account ID string to an AccountId object
 * 4. Setting the client operator for transaction signing
 * 
 * @param network - The network to connect to ("hedera-testnet" or "hedera-mainnet")
 * @param privateKeyString - The ECDSA private key string (DER format)
 * @param accountId - The account ID string in format "0.0.{number}"
 * @returns A Hedera signer instance ready for transaction signing
 * @throws Error if network, private key, or account ID is invalid
 * 
 * @example
 * ```typescript
 * const signer = createHederaSigner(
 *   "hedera-testnet",
 *   "302e020100300506032b657004220420...",
 *   "0.0.123456"
 * );
 * ```
 */
export function createHederaSigner(
  network: string,
  privateKeyString: string,
  accountId: string
): HederaSigner {
  const client = createHederaConnectedClient(network);
  const privateKey = PrivateKey.fromStringECDSA(privateKeyString);
  const hederaAccountId = AccountId.fromString(accountId);

  client.setOperator(hederaAccountId, privateKey);

  return {
    client,
    accountId: hederaAccountId,
    privateKey
  };
}

/**
 * Checks if the given object is a valid Hedera signer.
 * 
 * This function performs a type guard to verify that an object contains
 * all the required properties of a HederaSigner: client, accountId, and privateKey.
 * 
 * @param wallet - The object to check for Hedera signer properties
 * @returns True if the object is a valid Hedera signer, false otherwise
 * 
 * @example
 * ```typescript
 * if (isHederaSigner(wallet)) {
 *   // wallet is guaranteed to be a HederaSigner
 *   await wallet.client.getAccountBalance(wallet.accountId);
 * }
 * ```
 */
export function isHederaSigner(wallet: any): wallet is HederaSigner {
  return wallet != null &&
    typeof wallet.client !== 'undefined' &&
    typeof wallet.accountId !== 'undefined' &&
    typeof wallet.privateKey !== 'undefined';
}