import { config } from "dotenv";
import express from "express";
import {
  paymentMiddlewareFromHTTPServer,
  x402ResourceServer,
  x402HTTPResourceServer,
} from "@x402/express";
import { ExactEvmScheme } from "@x402/evm/exact/server";
import { HTTPFacilitatorClient } from "@x402/core/server";
import {
  createTokenGateExtension,
  declareTokenGateExtension,
  createTokenGateRequestHook,
  type TokenGateHookEvent,
} from "@x402/extensions/token-gate";
import { baseSepolia } from "viem/chains";
config();

const evmAddress = process.env.EVM_ADDRESS as `0x${string}`;
const tokenContractAddress = process.env.TOKEN_CONTRACT_ADDRESS as `0x${string}`;

if (!evmAddress) {
  console.error("Missing EVM_ADDRESS");
  process.exit(1);
}

if (!tokenContractAddress) {
  console.error("Missing TOKEN_CONTRACT_ADDRESS");
  process.exit(1);
}

const facilitatorUrl = process.env.FACILITATOR_URL;
if (!facilitatorUrl) {
  console.error("Missing FACILITATOR_URL");
  process.exit(1);
}

const PORT = 4022;
const EVM_NETWORK = "eip155:84532" as const; // Base Sepolia

/** ERC-721 contract to gate access on. */
const NFT_CONTRACT = {
  address: tokenContractAddress,
  chain: baseSepolia,
  type: "ERC-721" as const,
};

/**
 * Log token-gate events for visibility.
 *
 * @param event - The token-gate hook event
 */
function onEvent(event: TokenGateHookEvent) {
  console.log(`[token-gate] ${event.type}`, event);
}

const routes = {
  "GET /weather": {
    accepts: [{ scheme: "exact" as const, price: "$0.001", network: EVM_NETWORK, payTo: evmAddress }],
    description: "Weather data — free for NFT holders",
    mimeType: "application/json",
    extensions: {
      ...declareTokenGateExtension({
        contracts: [NFT_CONTRACT],
        message: "NFT holders get free access",
      }),
    },
  },
  "GET /joke": {
    accepts: [{ scheme: "exact" as const, price: "$0.001", network: EVM_NETWORK, payTo: evmAddress }],
    description: "Joke content — free for NFT holders",
    mimeType: "application/json",
    extensions: {
      ...declareTokenGateExtension({
        contracts: [NFT_CONTRACT],
        message: "NFT holders get free access",
      }),
    },
  },
};

// Configure resource server with token-gate extension
const facilitatorClient = new HTTPFacilitatorClient({ url: facilitatorUrl });
const resourceServer = new x402ResourceServer(facilitatorClient)
  .register(EVM_NETWORK, new ExactEvmScheme())
  .registerExtension(createTokenGateExtension());

// Configure HTTP server with token-gate request hook
const httpServer = new x402HTTPResourceServer(resourceServer, routes).onProtectedRequest(
  createTokenGateRequestHook({
    contracts: [NFT_CONTRACT],
    access: "free",
    onEvent,
  }),
);

const app = express();

app.use(paymentMiddlewareFromHTTPServer(httpServer));

app.get("/weather", (_req, res) => res.json({ weather: "sunny", temperature: 72 }));
app.get("/joke", (_req, res) =>
  res.json({ joke: "Why do programmers prefer dark mode? Because light attracts bugs." }),
);

app.listen(PORT, () => {
  console.log(`Server running at http://localhost:${PORT}`);
  console.log(`NFT contract: ${tokenContractAddress} (Base Sepolia)`);
  console.log(`Routes: GET /weather, GET /joke`);
  console.log(`NFT holders access these routes for free. Others pay $0.001 USDC.`);
});
