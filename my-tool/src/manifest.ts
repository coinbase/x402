import { defineManifest } from "@opensea/tool-sdk"

// Tip: Use resolver functions to read env vars at request time instead of
// at module-init time:
//   endpoint: env => env.TOOL_ENDPOINT!,
//   creatorAddress: env => env.CREATOR_ADDRESS!,
export const manifest = defineManifest({
  type: "https://ercs.ethereum.org/ERCS/erc-8257#tool-manifest-v1",
  name: "my-tool",
  description: "ARKHE HTTP GATEWAY tool",
  endpoint: "http://localhost:8700",
  inputs: {
    type: "object",
    properties: {
      query: { type: "string", description: "Input query" },
    },
    required: ["query"],
  },
  outputs: {
    type: "object",
    properties: {
      result: { type: "string" },
    },
  },
  creatorAddress: "0x0000000000000000000000000000000000000000",
})
