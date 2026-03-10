import { config } from "dotenv";
import express from "express";
import { paymentMiddleware, x402ResourceServer } from "@x402/express";
import { ExactEvmScheme } from "@x402/evm/exact/server";
import { ExactAvmScheme } from "@x402/avm/exact/server";
import { HTTPFacilitatorClient } from "@x402/core/server";
config();

const evmAddress = process.env.EVM_ADDRESS as `0x${string}`;
const avmAddress = process.env.AVM_ADDRESS as string;
if (!evmAddress || !avmAddress) {
  console.error("Missing required environment variables");
  process.exit(1);
}

const facilitatorUrl = process.env.FACILITATOR_URL;
if (!facilitatorUrl) {
  console.error("❌ FACILITATOR_URL environment variable is required");
  process.exit(1);
}
const facilitatorClient = new HTTPFacilitatorClient({ url: facilitatorUrl });

const accepts: {
  scheme: string;
  price: string | ((context: { adapter: { getQueryParam?: (param: string) => string | undefined } }) => string);
  network: `${string}:${string}`;
  payTo: string;
}[] = [
  {
    scheme: "exact",
    price: context => {
      // Dynamic pricing based on HTTP request context
      const tier = context.adapter.getQueryParam?.("tier") ?? "standard";
      return tier === "premium" ? "$0.005" : "$0.001";
    },
    network: "eip155:84532",
    payTo: evmAddress,
  },
  {
    scheme: "exact",
    price: context => {
      const tier = context.adapter.getQueryParam?.("tier") ?? "standard";
      return tier === "premium" ? "$0.005" : "$0.001";
    },
    network: "algorand:SGO1GKSzyE7IEPItTxCByw9x8FmnrCDexi9/cOUJOiI=",
    payTo: avmAddress,
  },
];

const server = new x402ResourceServer(facilitatorClient)
  .register("eip155:84532", new ExactEvmScheme())
  .register("algorand:SGO1GKSzyE7IEPItTxCByw9x8FmnrCDexi9/cOUJOiI=", new ExactAvmScheme());

const app = express();

app.use(
  paymentMiddleware(
    {
      "GET /weather": {
        accepts,
        description: "Weather data",
        mimeType: "application/json",
      },
    },
    server,
  ),
);

app.get("/weather", (req, res) => {
  const tier = req.query.tier ?? "standard";

  if (tier === "premium") {
    // Premium tier gets detailed weather data
    res.send({
      report: {
        weather: "sunny",
        temperature: 70,
        humidity: 45,
        windSpeed: 12,
        precipitation: 0,
      },
    });
  } else {
    // Standard tier gets basic weather data
    res.send({
      report: {
        weather: "sunny",
        temperature: 70,
      },
    });
  }
});

app.listen(4021, () => {
  console.log(`Server listening at http://localhost:${4021}`);
});
