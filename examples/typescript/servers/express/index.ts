import { config } from "dotenv";
import express from "express";
import { paymentMiddleware, x402ResourceServer } from "@x402/express";
import { ExactEvmScheme } from "@x402/evm/exact/server";
import { ExactSvmScheme } from "@x402/svm/exact/server";
import { HTTPFacilitatorClient, HTTPRequestContext } from "@x402/core/server";
import { ResourceServerExtension, SettleResultContext } from "@x402/core/types";
config();

const evmAddress = process.env.EVM_ADDRESS as `0x${string}`;
const svmAddress = process.env.SVM_ADDRESS;
if (!evmAddress || !svmAddress) {
  console.error("Missing required environment variables");
  process.exit(1);
}

const facilitatorUrl = process.env.FACILITATOR_URL;
if (!facilitatorUrl) {
  console.error("❌ FACILITATOR_URL environment variable is required");
  process.exit(1);
}
const facilitatorClient = new HTTPFacilitatorClient({ url: facilitatorUrl });

// Type for HTTP transport context provided during settlement
interface HTTPTransportContext {
  httpContext: HTTPRequestContext;
  responseBody: Buffer;
}

// Example extension that demonstrates transportContext usage
const transportContextExtension: ResourceServerExtension = {
  key: "transport-context-demo",

  enrichSettlementResponse: async (
    _declaration: unknown,
    context: SettleResultContext,
  ): Promise<unknown> => {
    const httpData = context.transportContext as HTTPTransportContext | undefined;

    if (!httpData) {
      console.log("⚠️  No transport context available");
      return undefined;
    }

    // Log what we have access to
    console.log("\n📦 Transport Context Available:");
    console.log("   Request path:", httpData.httpContext.path);
    console.log("   Request method:", httpData.httpContext.method);
    console.log("   Response body:", httpData.responseBody.toString("utf-8"));

    // Return the data in the settlement response extensions
    return {
      request: {
        path: httpData.httpContext.path,
        method: httpData.httpContext.method,
      },
      responseBody: httpData.responseBody.toString("utf-8"),
    };
  },
};

const app = express();

const resourceServer = new x402ResourceServer(facilitatorClient)
  .register("eip155:84532", new ExactEvmScheme())
  .register("solana:EtWTRABZaYq6iMfeYKouRu166VU2xqa1", new ExactSvmScheme())
  .registerExtension(transportContextExtension);

app.use(
  paymentMiddleware(
    {
      "GET /weather": {
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
        description: "Weather data",
        mimeType: "application/json",
        extensions: {
          "transport-context-demo": {},
        },
      },
    },
    resourceServer,
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
