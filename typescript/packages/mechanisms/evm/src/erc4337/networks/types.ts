export interface ChainInfo {
  readonly chainId: number;
  readonly name: string;
  readonly v1Name: string;
  readonly caip2: CAIP2Identifier;
  readonly rpcUrl: string;
  readonly blockExplorerUrl: string;
  readonly usdcAddress: `0x${string}`;
  readonly safeTransactionServiceUrl?: string;
  readonly testnet: boolean;
}

export type CAIP2Identifier = `eip155:${number}`;

export type NetworkInput = string | number;
