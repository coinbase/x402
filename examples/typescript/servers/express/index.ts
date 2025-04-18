import { config } from "dotenv";
import express from "express";
import { configurePaymentMiddleware, Resource, Network } from "x402-express";

config();

const { FACILITATOR_URL, ADDRESS, NETWORK, PORT } = process.env;

if (!FACILITATOR_URL || !ADDRESS || !NETWORK || !PORT) {
  console.error("Missing required environment variables");
  process.exit(1);
}

const app = express();
const port = parseInt(PORT);

const paymentMiddleware = configurePaymentMiddleware({
  facilitatorUrl: FACILITATOR_URL as Resource,
  address: ADDRESS as `0x${string}`,
  network: NETWORK as Network,
});

app.get(
  "/weather",
  paymentMiddleware("$0.001", {
    resource: `http://localhost:${port}/weather`,
  }),
  (req, res) => {
    res.send({
      report: {
        weather: "sunny",
        temperature: 70,
      },
    });
  },
);

app.listen(port, () => {
  console.log(`Server listening at http://localhost:${port}`);
});
