import { config } from "dotenv";
import express from "express";
import {
  paymentMiddlewareFromHTTPServer,
  x402ResourceServer,
  x402HTTPResourceServer,
} from "@x402/express";
import { ExactEvmScheme } from "@x402/evm/exact/server";
import { ExactSvmScheme } from "@x402/svm/exact/server";
import { HTTPFacilitatorClient } from "@x402/core/server";
import {
  declareSIWxExtension,
  siwxResourceServerExtension,
  createSIWxSettleHook,
  createSIWxRequestHook,
  InMemorySIWxStorage,
  verifySIWxHeader,
} from "@x402/extensions/sign-in-with-x";
config();

const evmAddress = process.env.EVM_ADDRESS as `0x${string}`;
const svmAddress = process.env.SVM_ADDRESS as string | undefined;

if (!evmAddress && !svmAddress) {
  console.error("Missing EVM_ADDRESS or SVM_ADDRESS");
  // process.exit(1);
}

const facilitatorUrl = process.env.FACILITATOR_URL;
if (!facilitatorUrl) {
  console.error("Missing FACILITATOR_URL");
  process.exit(1);
}

const PORT = 4021;
const EVM_NETWORK = "eip155:84532" as const;
const SVM_NETWORK = "solana:EtWTRABZaYq6iMfeYKouRu166VU2xqa1" as const;

// Shared storage for tracking paid addresses
const storage = new InMemorySIWxStorage();

/**
 * Log SIWX events for visibility.
 *
 * @param event - The SIWX hook event
 * @param event.type - Event type (e.g., "payment_recorded", "access_granted")
 * @param event.resource - The resource path
 * @param event.address - Wallet address (optional)
 * @param event.error - Error message (optional)
 */
function onEvent(event: { type: string; resource: string; address?: string; error?: string }) {
  console.log(`[SIWX] ${event.type}`, event);
}

/**
 * Creates route configuration with SIWX extension.
 * Network, domain, and resourceUri are derived automatically from context.
 *
 * @param path - The resource path
 * @returns Route configuration object
 */
function routeConfig(path: string) {
  const acceptOptions: Array<{
    scheme: "exact";
    price: string;
    network: `${string}:${string}`;
    payTo: string;
  }> = [];

  if (evmAddress) {
    acceptOptions.push({
      scheme: "exact" as const,
      price: "$0.001",
      network: EVM_NETWORK,
      payTo: evmAddress,
    });
  }

  if (svmAddress) {
    acceptOptions.push({
      scheme: "exact" as const,
      price: "$0.001",
      network: SVM_NETWORK,
      payTo: svmAddress,
    });
  }

  return {
    accepts: acceptOptions,
    description: `Protected resource: ${path}`,
    mimeType: "application/json",
    extensions: declareSIWxExtension(),
  };
}

const routes = {
  "GET /weather": routeConfig("/weather"),
  "GET /joke": routeConfig("/joke"),
};

// Configure resource server with SIWX extension and settle hook
const facilitatorClient = new HTTPFacilitatorClient({ url: facilitatorUrl });
let resourceServer = new x402ResourceServer(facilitatorClient);

if (evmAddress) resourceServer = resourceServer.register(EVM_NETWORK, new ExactEvmScheme());
if (svmAddress) resourceServer = resourceServer.register(SVM_NETWORK, new ExactSvmScheme());

resourceServer = resourceServer
  .registerExtension(siwxResourceServerExtension)
  .onAfterSettle(createSIWxSettleHook({ storage }));

// Configure HTTP server with SIWX request hook
const httpServer = new x402HTTPResourceServer(resourceServer, routes).onProtectedRequest(
  createSIWxRequestHook({ storage, onEvent }),
);

const app = express();

// Auth-only route: SIWX signature required, no payment.
// declareSIWxExtension generates nonce/issuedAt directly (no enrichment pipeline).
app.get("/profile", async (req, res) => {
  const siwxHeader = req.headers["sign-in-with-x"] as string | undefined;
  const resourceUri = `http://localhost:${PORT}/profile`;

  if (!siwxHeader) {
    return res.status(402).json({
      extensions: declareSIWxExtension({
        domain: `localhost:${PORT}`,
        resourceUri,
        network: EVM_NETWORK,
        statement: "Sign in to view your profile",
        expirationSeconds: 300,
      }),
    });
  }

  const result = await verifySIWxHeader(siwxHeader, resourceUri);
  if (!result.valid) return res.status(401).json({ error: result.error });

  res.json({ address: result.address, data: "Your profile data" });
});

app.use(paymentMiddlewareFromHTTPServer(httpServer));

app.get("/weather", (_req, res) => res.json({ weather: "sunny", temperature: 72 }));
app.get("/joke", (_req, res) =>
  res.json({ joke: "Why do programmers prefer dark mode? Because light attracts bugs." }),
);

app.listen(PORT, () => {
  console.log(`Server running at http://localhost:${PORT}`);
  console.log(`Routes: GET /weather, GET /joke, GET /profile (auth-only)`);
});
