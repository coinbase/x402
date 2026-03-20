import { config } from "dotenv";
import express from "express";
import { paymentMiddleware, x402ResourceServer } from "@x402/express";
import { ExactEvmScheme } from "@x402/evm/exact/server";
import { ExactSvmScheme } from "@x402/svm/exact/server";
import { HTTPFacilitatorClient } from "@x402/core/server";
import { declareDiscoveryExtension } from "@x402/extensions/bazaar";
config();

const evmAddress = process.env.EVM_ADDRESS as `0x${string}`;
const svmAddress = process.env.SVM_ADDRESS;
if (!evmAddress || !svmAddress) {
  console.error("Missing required environment variables");
  process.exit(1);
}

const facilitatorUrl = process.env.FACILITATOR_URL;
if (!facilitatorUrl) {
  console.error("FACILITATOR_URL environment variable is required");
  process.exit(1);
}
const facilitatorClient = new HTTPFacilitatorClient({ url: facilitatorUrl });

const app = express();

app.use(
  paymentMiddleware(
    {
      "GET /weather/:city": {
        accepts: [
          {
            scheme: "exact",
            price: "$0.001",
            network: "eip155:84532",
            payTo: evmAddress,
          },
          {
            scheme: "exact",
            price: "$0.001",
            network: "solana:EtWTRABZaYq6iMfeYKouRu166VU2xqa1",
            payTo: svmAddress,
          },
        ],
        description: "Weather data for a city",
        mimeType: "application/json",
        extensions: {
          ...declareDiscoveryExtension({
            pathParamsSchema: {
              properties: { city: { type: "string", description: "City name slug" } },
              required: ["city"],
            },
            output: {
              example: { city: "san-francisco", weather: "foggy", temperature: 60 },
            },
          }),
        },
      },
    },
    new x402ResourceServer(facilitatorClient)
      .register("eip155:84532", new ExactEvmScheme())
      .register("solana:EtWTRABZaYq6iMfeYKouRu166VU2xqa1", new ExactSvmScheme()),
  ),
);

app.get("/weather/:city", (req, res) => {
  const city = req.params.city;

  const weatherData: Record<string, { weather: string; temperature: number }> = {
    "san-francisco": { weather: "foggy", temperature: 60 },
    "new-york": { weather: "cloudy", temperature: 55 },
    tokyo: { weather: "rainy", temperature: 65 },
  };

  const data = weatherData[city] || { weather: "sunny", temperature: 70 };

  res.send({ city, weather: data.weather, temperature: data.temperature });
});

app.listen(4021, () => {
  console.log(`Server listening at http://localhost:${4021}`);
});
