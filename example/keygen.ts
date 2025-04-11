import { generatePrivateKey, privateKeyToAccount, type Address, type PrivateKeyAccount } from 'viem/accounts';

/**
 * Interface representing a generated wallet
 */
interface Wallet {
  privateKey: `0x${string}`;
  address: Address;
}

/**
 * Generates a random Ethereum wallet using viem
 * @returns {Wallet} An object containing the wallet information
 */
function generateWallet(): Wallet {
  const privateKey = generatePrivateKey();
  const account: PrivateKeyAccount = privateKeyToAccount(privateKey);

  return {
    privateKey,
    address: account.address
  };
}

function main(): void {
  try {	
    const wallet: Wallet = generateWallet();

    console.log(wallet);

  }
  catch (error) {
    console.error('Error generating wallet:', (error as Error).message);
    process.exit(1);
  }
}

main();
