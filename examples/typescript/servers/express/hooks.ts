import { config } from "dotenv";
import express from "express";
import { paymentMiddleware, x402ResourceService } from "@x402/express";
import { ExactEvmService } from "@x402/evm";
config();

const evmAddress = process.env.EVM_ADDRESS as `0x${string}`;

if (!evmAddress) {
  console.error("Missing required environment variables");
  process.exit(1);
}

const resourceService = new x402ResourceService()
  .registerScheme("eip155:84532", new ExactEvmService())
  .onBeforeVerify(async context => {
    console.log("Before verify hook", context);
    // Abort verification by returning { abort: true, reason: string }
  })
  .onAfterVerify(async context => {
    console.log("After verify hook", context);
  })
  .onVerifyFailure(async context => {
    console.log("Verify failure hook", context);
    // Return a result with Recovered=true to recover from the failure
    // return { recovered: true, result: { isValid: true, invalidReason: "Recovered from failure" } };
  })
  .onBeforeSettle(async context => {
    console.log("Before settle hook", context);
    // Abort settlement by returning { abort: true, reason: string }
  })
  .onAfterSettle(async context => {
    console.log("After settle hook", context);
  })
  .onSettleFailure(async context => {
    console.log("Settle failure hook", context);
    // Return a result with Recovered=true to recover from the failure
    // return { recovered: true, result: { success: true, transaction: "0x123..." } };
  });

const app = express();

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
    resourceService,
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
