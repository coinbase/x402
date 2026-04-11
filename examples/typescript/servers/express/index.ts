import { config } from "dotenv";
import { paymentMiddleware, x402ResourceServer } from "@x402/express";
import { ExactEvmScheme } from "@x402/evm/exact/server";
import { ExactSvmScheme } from "@x402/svm/exact/server";
import { HTTPFacilitatorClient } from "@x402/core/server";

import { createApp } from "./app";
import { readEnvConfig } from "./server-utils";

config();

const env = readEnvConfig(process.env);
const facilitatorClient = new HTTPFacilitatorClient({ url: env.facilitatorUrl });

const paidMiddleware = paymentMiddleware(
  {
    "GET /weather": {
      accepts: [
        {
          scheme: "exact",
          price: "$0.001",
          network: "eip155:84532",
          payTo: env.evmAddress,
        },
        {
          scheme: "exact",
          price: "$0.001",
          network: "solana:EtWTRABZaYq6iMfeYKouRu166VU2xqa1",
          payTo: env.svmAddress,
        },
      ],
      description: "Weather data",
      mimeType: "application/json",
    },
  },
  new x402ResourceServer(facilitatorClient)
    .register("eip155:84532", new ExactEvmScheme())
    .register("solana:EtWTRABZaYq6iMfeYKouRu166VU2xqa1", new ExactSvmScheme()),
);

const app = createApp(paidMiddleware);
const server = app.listen(env.port, () => {
  console.log(`Server listening at http://localhost:${env.port}`);
});

const shutdown = () => {
  server.close(() => {
    process.exit(0);
  });
};

process.once("SIGINT", shutdown);
process.once("SIGTERM", shutdown);
