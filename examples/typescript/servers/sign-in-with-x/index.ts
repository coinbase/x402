import { config } from "dotenv";
import express from "express";
import { paymentMiddleware, x402ResourceServer } from "@x402/express";
import { ExactEvmScheme } from "@x402/evm/exact/server";
import { HTTPFacilitatorClient } from "@x402/core/server";
import { declareSIWxExtension } from "@x402/extensions/sign-in-with-x";
import { createSIWxMiddleware, recordPayment } from "./siwx-middleware";
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
const HOST = `localhost:${PORT}`;
const NETWORK = "eip155:84532" as const;

const facilitatorClient = new HTTPFacilitatorClient({ url: facilitatorUrl });

const resourceServer = new x402ResourceServer(facilitatorClient)
  .register(NETWORK, new ExactEvmScheme())
  .onAfterSettle(async ctx => {
    const payload = ctx.paymentPayload.payload as { authorization: { from: string } };
    const address = payload.authorization.from;
    const resource = new URL(ctx.paymentPayload.resource.url).pathname;
    recordPayment(resource, address);
  });

/**
 * Creates route config with SIWX extension.
 *
 * @param path - The route path
 * @returns Route configuration object
 */
function routeConfig(path: string) {
  return {
    accepts: [{ scheme: "exact", price: "$0.001", network: NETWORK, payTo: evmAddress }],
    description: `Protected resource: ${path}`,
    mimeType: "application/json",
    extensions: declareSIWxExtension({
      domain: HOST,
      resourceUri: `http://${HOST}${path}`,
      network: NETWORK,
    }),
  };
}

const routes = {
  "GET /weather": routeConfig("/weather"),
  "GET /joke": routeConfig("/joke"),
};

const app = express();
app.use(createSIWxMiddleware(HOST));

// Payment middleware - skipped for SIWX-authenticated users
const payment = paymentMiddleware(routes, resourceServer);
app.use((req, res, next) => (res.locals.siwxAuthenticated ? next() : payment(req, res, next)));

app.get("/weather", (req, res) => res.json({ weather: "sunny", temperature: 72 }));
app.get("/joke", (req, res) =>
  res.json({ joke: "Why do programmers prefer dark mode? Because light attracts bugs." }),
);

app.listen(PORT, () => {
  console.log(`Server running at http://localhost:${PORT}`);
  console.log(`Routes: GET /weather, GET /joke`);

  // For testing: pre-seed a payment if TEST_ADDRESS is set
  const testAddress = process.env.TEST_ADDRESS;
  if (testAddress) {
    recordPayment("/weather", testAddress);
    console.log(`Test mode: Pre-seeded payment for ${testAddress} on /weather`);
  }
});
