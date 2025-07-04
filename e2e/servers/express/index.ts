import express from "express";
import { Network, paymentMiddleware } from "x402-express";
import { facilitator } from "@coinbase/x402";
import dotenv from "dotenv";
import { getDefaultAsset } from "x402/shared";

dotenv.config();

const useCdpFacilitator = process.env.USE_CDP_FACILITATOR === 'true';
const network = process.env.NETWORK as Network;
const payTo = process.env.ADDRESS as `0x${string}`;
const port = process.env.PORT || "4021";

if (!payTo || !network) {
  console.error("Missing required environment variables");
  process.exit(1);
}

const asset = getDefaultAsset(network)

const app = express();

app.use(
  paymentMiddleware(
    payTo,
    {
      // Price defined as Money
      "GET /protected": {
        price: "$0.001",
        network,
      },
      // Price defined as ERC20TokenAmount
      "GET /protected-2": {
        price: {
          amount: "1000",
          asset: {
            address: asset.address,
            decimals: asset.decimals,
            eip712: {
              name: asset.eip712.name,
              version: asset.eip712.version,
            },
          }
        },
        network,
      },
    },
    useCdpFacilitator ? facilitator : undefined
  ),
);

app.get("/protected", (req, res) => {
  res.json({
    message: "Protected endpoint accessed successfully",
    timestamp: new Date().toISOString(),
  });
});

app.get("/health", (req, res) => {
  res.json({ status: "ok" });
});

app.post("/close", (req, res) => {
  res.json({ message: "Server shutting down" });
  console.log("Received shutdown request");
  process.exit(0);
});

app.listen(parseInt(port), () => {
  console.log(`Server listening at http://localhost:${port}`);
}); 