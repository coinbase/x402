import { ERC8257_ABI, type ERC8257Tool } from './bindings';
import { createPublicClient, http } from 'viem';

export class ArkheClient {
  private client;
  constructor(private contractAddress: string) {
    this.client = createPublicClient({
        transport: http()
    });
  }

  async getTool(hash: `0x${string}`): Promise<ERC8257Tool> {
    return this.client.readContract({
      address: this.contractAddress as `0x${string}`,
      abi: ERC8257_ABI,
      functionName: 'getTool',
      args: [hash],
    }) as Promise<ERC8257Tool>;
  }
}
export * from './agentfield_bridge';
