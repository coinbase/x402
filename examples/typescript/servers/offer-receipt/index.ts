import { config } from "dotenv";
import express from "express";
import { paymentMiddleware, x402ResourceServer } from "@x402/express";
import { ExactEvmScheme } from "@x402/evm/exact/server";
import { ExactSvmScheme } from "@x402/svm/exact/server";
import { HTTPFacilitatorClient } from "@x402/core/server";
import {
  createOfferReceiptExtension,
  createJWSOfferReceiptIssuer,
  declareOfferReceiptExtension,
} from "@x402/extensions/offer-receipt";
import { createJWSSignerFromPrivateKey } from "./jws-signer";
config();

const evmAddress = process.env.EVM_ADDRESS as `0x${string}`;
const svmAddress = process.env.SVM_ADDRESS;
if (!evmAddress || !svmAddress) {
  console.error("Missing EVM_ADDRESS or SVM_ADDRESS environment variable");
  process.exit(1);
}

const facilitatorUrl = process.env.FACILITATOR_URL;
if (!facilitatorUrl) {
  console.error("❌ FACILITATOR_URL environment variable is required");
  process.exit(1);
}

// For production, use a proper key management solution (HSM, KMS, etc.)
// This example uses a simple private key for demonstration
const signingPrivateKey = process.env.SIGNING_PRIVATE_KEY;
if (!signingPrivateKey) {
  console.error("❌ SIGNING_PRIVATE_KEY environment variable is required");
  process.exit(1);
}

const facilitatorClient = new HTTPFacilitatorClient({ url: facilitatorUrl });

// Create a JWS signer for signing offers and receipts
// The kid (key identifier) should be a DID URL that resolves to the public key
const kid = `did:web:${process.env.SERVER_DOMAIN || "localhost"}#key-1`;
const jwsSigner = createJWSSignerFromPrivateKey(signingPrivateKey, kid);
const offerReceiptIssuer = createJWSOfferReceiptIssuer(kid, jwsSigner);

const app = express();

// Create the resource server with the offer-receipt extension registered
const resourceServer = new x402ResourceServer(facilitatorClient)
  .register("eip155:84532", new ExactEvmScheme())
  .register("solana:EtWTRABZaYq6iMfeYKouRu166VU2xqa1", new ExactSvmScheme())
  .registerExtension(createOfferReceiptExtension(offerReceiptIssuer));

app.use(
  paymentMiddleware(
    {
      "GET /weather": {
        accepts: [
          {
            scheme: "exact",
            // Note: "price" is SDK syntactic sugar that converts to "amount" in atomic units
            // The wire protocol uses "amount" per the x402 spec
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
          // Declare the offer-receipt extension for this route
          // includeTxHash: false (default) for privacy, true for verifiability
          ...declareOfferReceiptExtension({ includeTxHash: false }),
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
  console.log("Offer-receipt extension enabled - responses will include signed offers/receipts");
});
