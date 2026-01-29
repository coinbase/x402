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
  declareSIWxExtension,
  siwxResourceServerExtension,
  createSIWxSettleHook,
  createSIWxRequestHook,
  InMemorySIWxStorage,
} from "@x402/extensions/sign-in-with-x";
config();

const evmAddress = process.env.EVM_ADDRESS as `0x${string}`;
if (!evmAddress) {
  console.error("Missing EVM_ADDRESS");
  process.exit(1);
}

const facilitatorUrl = process.env.FACILITATOR_URL;
if (!facilitatorUrl) {
  console.error("Missing FACILITATOR_URL");
  process.exit(1);
}

const PORT = 4021;
const NETWORK = "eip155:84532" as const;

// Shared storage for tracking paid addresses
const storage = new InMemorySIWxStorage();

// Log SIWX events for visibility
function onEvent(event: { type: string; resource: string; address?: string; error?: string }) {
  console.log(`[SIWX] ${event.type}`, event);
}

// Configure resource server with SIWX extension and settle hook
const facilitatorClient = new HTTPFacilitatorClient({ url: facilitatorUrl });
const resourceServer = new x402ResourceServer(facilitatorClient)
  .register(NETWORK, new ExactEvmScheme())
  .registerExtension(siwxResourceServerExtension)
  .onAfterSettle(createSIWxSettleHook({ storage }));

/**
 * Creates route configuration with SIWX extension.
 * Network, domain, and resourceUri are derived automatically from context.
 *
 * @param path - The resource path
 * @returns Route configuration object
 */
function routeConfig(path: string) {
  return {
    accepts: [{ scheme: "exact", price: "$0.001", network: NETWORK, payTo: evmAddress }],
    description: `Protected resource: ${path}`,
    mimeType: "application/json",
    extensions: declareSIWxExtension(),
  };
}

const routes = {
  "GET /weather": routeConfig("/weather"),
  "GET /joke": routeConfig("/joke"),
};

// Configure HTTP server with SIWX request hook
const httpServer = new x402HTTPResourceServer(resourceServer, routes).onProtectedRequest(
  createSIWxRequestHook({ storage, onEvent }),
);

const app = express();
app.use(paymentMiddlewareFromHTTPServer(httpServer));

app.get("/weather", (_req, res) => res.json({ weather: "sunny", temperature: 72 }));
app.get("/joke", (_req, res) =>
  res.json({ joke: "Why do programmers prefer dark mode? Because light attracts bugs." }),
);

app.listen(PORT, () => {
  console.log(`Server running at http://localhost:${PORT}`);
  console.log(`Routes: GET /weather, GET /joke`);
});
