type Network = {
  name: string;
  caip2: `${string}:${string}`;
  v1Name?: string;
  rpcUrl: string;
}

export const NETWORKS = [
  {
    name: 'Base Sepolia',
    caip2: 'eip155:84532',
    v1Name: 'base-sepolia',
    rpcUrl: process.env.BASE_SEPOLIA_RPC_URL || 'https://sepolia.base.org',
  },
  {
    name: "Solana Devnet",
    caip2: 'solana:EtWTRABZaYq6iMfeYKouRu166VU2xqa1',
    v1Name: 'solana-devnet',
    rpcUrl: process.env.SOLANA_DEVNET_RPC_URL || 'https://api.devnet.solana.com',
  },
  {
    name: 'Base',
    caip2: 'eip155:8453',
    v1Name: 'base',
    rpcUrl: process.env.BASE_RPC_URL || 'https://mainnet.base.org',
  },
  {
    name: "Solana",
    caip2: 'solana:5eykt4UsFv8P8NJdTREpY1vzqKqZKvdp',
    v1Name: 'solana-devnet',
    rpcUrl: process.env.SOLANA_RPC_URL || 'https://api.mainnet-beta.solana.com',
  },
] satisfies Network[];

export const getNetwork = (network: string): Network | undefined => {
  let result = NETWORKS.find(n => n.caip2 === network);
  if (!result) {
    result = NETWORKS.find(n => n.v1Name === network);
  }
  return result;
}