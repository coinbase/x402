import { config } from "dotenv";
import { paymentMiddleware, x402ResourceServer } from "@x402/hono";
import { ExactEvmServer } from "@x402/evm";
import { Hono } from "hono";

config();

const evmAddress = process.env.EVM_ADDRESS as `0x${string}`;

if (!evmAddress) {
  console.error("Missing required environment variables");
  process.exit(1);
}

const ResourceServer = new x402ResourceServer()
  .registerScheme("eip155:84532", new ExactEvmServer())
  .onBeforeVerify(async (context) => {
    console.log("Before verify hook", context);
    // Abort verification by returning { abort: true, reason: string }
  })
  .onAfterVerify(async (context) => {
    console.log("After verify hook", context);
  })
  .onVerifyFailure(async (context) => {
    console.log("Verify failure hook", context);
    // Return a result with Recovered=true to recover from the failure
    // return { recovered: true, result: { isValid: true, invalidReason: "Recovered from failure" } };
  })
  .onBeforeSettle(async (context) => {
    console.log("Before settle hook", context);
    // Abort settlement by returning { abort: true, reason: string }
  })
  .onAfterSettle(async (context) => {
    console.log("After settle hook", context);
  })
  .onSettleFailure(async (context) => {
    console.log("Settle failure hook", context);
    // Return a result with Recovered=true to recover from the failure
    // return { recovered: true, result: { success: true, transaction: "0x123..." } };
  })

const app = new Hono();

app.use(
  paymentMiddleware({
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
  }, ResourceServer)
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
