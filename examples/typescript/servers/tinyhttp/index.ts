import { config } from "dotenv";
import { App } from "@tinyhttp/app";
import { paymentMiddleware, Network, Resource } from "x402-tinyhttp";

config();

const facilitatorUrl = process.env.FACILITATOR_URL as Resource;
const payTo = process.env.ADDRESS as `0x${string}`;
const network = process.env.NETWORK as Network;

if (!facilitatorUrl || !payTo || !network) {
  console.error("Missing required environment variables");
  process.exit(1);
}

const app = new App();

console.log("Server is running");

app.use(
  paymentMiddleware(
    payTo,
    {
      "/weather": {
        price: "$0.001",
        network,
      },
    },
    {
      url: facilitatorUrl,
    },
  ),
);

app.get("/weather", (req, res) => {
  return res.json({
    report: {
      weather: "sunny",
      temperature: 70,
    },
  });
});

app.listen(4021); 