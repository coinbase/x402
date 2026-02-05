import { config } from "dotenv";
import { paymentMiddleware, x402ResourceServer } from "@x402/hono";
import { ExactEvmScheme } from "@x402/evm/exact/server";
import { ExactSvmScheme } from "@x402/svm/exact/server";
import { ExactStellarScheme } from "@x402/stellar/exact/server";
import { HTTPFacilitatorClient } from "@x402/core/server";
import { Hono } from "hono";
import { serve } from "@hono/node-server";
import { PaymentOption } from "@x402/core/http";
config();

const evmAddress = process.env.EVM_ADDRESS as `0x${string}`;
const svmAddress = process.env.SVM_ADDRESS;
const stellarAddress = process.env.STELLAR_ADDRESS;
if (!evmAddress && !svmAddress && !stellarAddress) {
  console.error(
    "❌ At least one address must be provided: EVM_ADDRESS, SVM_ADDRESS, or STELLAR_ADDRESS",
  );
  process.exit(1);
}

const facilitatorUrl = process.env.FACILITATOR_URL;
if (!facilitatorUrl) {
  console.error("❌ FACILITATOR_URL environment variable is required");
  process.exit(1);
}
const facilitatorClient = new HTTPFacilitatorClient({ url: facilitatorUrl });

// Build `accepts` array and register schemes based on configured networks
const accepts: PaymentOption[] = [];
const resourceServer = new x402ResourceServer(facilitatorClient);

if (evmAddress) {
  resourceServer.register("eip155:84532", new ExactEvmScheme());
  accepts.push({
    scheme: "exact",
    price: "$0.001",
    network: "eip155:84532",
    payTo: evmAddress,
  });
}
if (svmAddress) {
  resourceServer.register("solana:EtWTRABZaYq6iMfeYKouRu166VU2xqa1", new ExactSvmScheme());
  accepts.push({
    scheme: "exact",
    price: "$0.001",
    network: "solana:EtWTRABZaYq6iMfeYKouRu166VU2xqa1",
    payTo: svmAddress,
  });
}
if (stellarAddress) {
  resourceServer.register("stellar:testnet", new ExactStellarScheme());
  accepts.push({
    scheme: "exact",
    price: "$0.001",
    network: "stellar:testnet",
    payTo: stellarAddress,
  });
}

const app = new Hono();

app.use(
  paymentMiddleware(
    {
      "GET /weather": {
        accepts,
        description: "Weather data",
        mimeType: "application/json",
      },
    },
    resourceServer,
  ),
);

app.get("/weather", c => {
  return c.json({
    report: {
      weather: "sunny",
      temperature: 70,
    },
  });
});

const PORT = 4021;
serve({
  fetch: app.fetch,
  port: PORT,
});

console.log(`Server listening at http://localhost:${PORT}`);
