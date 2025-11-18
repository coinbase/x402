import { config } from "dotenv";
import { paymentMiddleware, x402ResourceServer } from "@x402/hono";
import { Hono } from "hono";
import { ExactEvmServer } from "@x402/evm";
config();

const evmAddress = process.env.EVM_ADDRESS as `0x${string}`;
const svmAddress = process.env.SVM_ADDRESS;

if (!evmAddress || !svmAddress) {
  console.error("Missing required environment variables");
  process.exit(1);
}

const app = new Hono();

app.use(
  paymentMiddleware(
    {
      "GET /weather": {
        accepts: {
          scheme: "exact",
          price: "$0.001",
          network: "eip155:84532",
          payTo: evmAddress,
        },
        description: "Weather data",
        mimeType: "application/json",
      },
    },
    new x402ResourceServer().registerScheme(
      "eip155:84532",
      new ExactEvmServer().registerMoneyParser(async (amount, network) => {
        // Custom money parser such that on the Gnosis Chain (xDai) network, we use Wrapped XDAI (WXDAI) when describing money
        // NOTE: Wrapped XDAI is not an EIP-3009 complaint token, and would fail the current ExactEvm implementation. This example is for demonstration purposes
        if (network == "eip155:100") {
          return {
            amount: BigInt(Math.round(amount * 1e18)).toString(),
            asset: "0xe91d153e0b41518a2ce8dd3d7944fa863463a97d",
            extra: { token: "Wrapped XDAI" },
          };
        }
        return null;
      }),
    ),
  ),
);

app.get("/weather", (c) => {
  return c.json({
    report: {
      weather: "sunny",
      temperature: 70,
    },
  });
});

export default {
  port: 4021,
  fetch: app.fetch,
};

console.log(`Server listening at http://localhost:4021`);
