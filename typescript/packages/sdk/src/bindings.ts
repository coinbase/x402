export const ERC8257_ABI = [
  {
    "inputs": [{"internalType": "bytes32", "name": "hash", "type": "bytes32"}],
    "name": "getTool",
    "outputs": [
      {
        "components": [
          {"internalType": "string", "name": "name", "type": "string"},
          {"internalType": "string", "name": "metadataURI", "type": "string"},
          {"internalType": "bytes32", "name": "checksum", "type": "bytes32"}
        ],
        "internalType": "struct ERC8257Tool",
        "name": "",
        "type": "tuple"
      }
    ],
    "stateMutability": "view",
    "type": "function"
  }
] as const;

export interface ERC8257Tool {
  name: string;
  metadataURI: string;
  checksum: `0x${string}`;
}
