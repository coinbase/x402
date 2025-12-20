import { config } from "dotenv";
import express from "express";
import { paymentMiddleware, x402ResourceServer } from "@x402/express";
import { ExactEvmScheme } from "@x402/evm/exact/server";
import { ExactStellarScheme } from "@x402/stellar/exact/server";
import { HTTPFacilitatorClient } from "@x402/core/server";
config();

const evmAddress = process.env.EVM_ADDRESS as `0x${string}`;
const stellarAddress = process.env.STELLAR_ADDRESS;

const addressLookup = {
  US: evmAddress,
  UK: evmAddress,
  CA: evmAddress,
  AU: evmAddress,
  NZ: evmAddress,
  IE: evmAddress,
  FR: evmAddress,
} as Record<string, `0x${string}`>;

const stellarAddressLookup = {
  US: stellarAddress,
  UK: stellarAddress,
  CA: stellarAddress,
  AU: stellarAddress,
  NZ: stellarAddress,
  IE: stellarAddress,
  FR: stellarAddress,
} as Record<string, string>;

if (!evmAddress || !stellarAddress) {
  console.error("Missing required environment variables");
  process.exit(1);
}

const facilitatorUrl = process.env.FACILITATOR_URL;
if (!facilitatorUrl) {
  console.error("❌ FACILITATOR_URL environment variable is required");
  process.exit(1);
}
const facilitatorClient = new HTTPFacilitatorClient({ url: facilitatorUrl });

const app = express();

app.use(
  paymentMiddleware(
    {
      "GET /weather": {
        accepts: [
          {
            scheme: "exact",
            price: "$0.001",
            network: "eip155:84532",
            payTo: context => {
              // Dynamic payTo based on HTTP request context
              const country = context.adapter.getQueryParam?.("country") ?? "US";
              return addressLookup[country as keyof typeof addressLookup];
            },
          },
          {
            scheme: "exact",
            price: "$0.001",
            network: "stellar:testnet",
            payTo: context => {
              // Dynamic payTo based on HTTP request context
              const country = context.adapter.getQueryParam?.("country") ?? "US";
              return stellarAddressLookup[country as keyof typeof stellarAddressLookup];
            },
          },
        ],
        description: "Weather data",
        mimeType: "application/json",
      },
    },
    new x402ResourceServer(facilitatorClient)
      .register("eip155:84532", new ExactEvmScheme())
      .register("stellar:testnet", new ExactStellarScheme()),
  ),
);

app.get("/weather", (req, res) => {
  res.send({
    report: {
      weather: "sunny",
      temperature: 70,
    },
  });
});

app.listen(4021, () => {
  console.log(`Server listening at http://localhost:${4021}`);
});
