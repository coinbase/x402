import { AccountId, Client, PrivateKey } from "@hashgraph/sdk";

export type HederaConnectedClient = Client;
export type HederaSigner = {
  client: Client;
  accountId: AccountId;
  privateKey: PrivateKey;
};

/**
 * Creates a Hedera client connected to the specified network
 * 
 * @param network - The network to connect to
 * @returns A Hedera client instance
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
 * Creates a Hedera signer from private key string
 * 
 * @param network - The network to connect to
 * @param privateKeyString - The private key string
 * @param accountId - The account ID string
 * @returns A Hedera signer instance
 */
export function createHederaSigner(
  network: string, 
  privateKeyString: string,
  accountId: string
): HederaSigner {
  const client = createHederaConnectedClient(network);
  const privateKey = PrivateKey.fromStringED25519(privateKeyString);
  const hederaAccountId = AccountId.fromString(accountId);
  
  client.setOperator(hederaAccountId, privateKey);
  
  return {
    client,
    accountId: hederaAccountId,
    privateKey
  };
}

/**
 * Checks if the given object is a Hedera signer
 * 
 * @param wallet - The wallet to check
 * @returns True if the wallet is a Hedera signer
 */
export function isHederaSigner(wallet: any): wallet is HederaSigner {
  return wallet && 
         typeof wallet.client !== 'undefined' && 
         typeof wallet.accountId !== 'undefined' && 
         typeof wallet.privateKey !== 'undefined';
}