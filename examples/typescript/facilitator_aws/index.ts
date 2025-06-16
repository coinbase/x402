/* eslint-env node */
import { config } from "dotenv";
import express from "express";
import serverless from "serverless-http";
import { verify, settle } from "x402/facilitator";
import {
  PaymentRequirementsSchema,
  PaymentRequirements,
  evm,
  PaymentPayload,
  PaymentPayloadSchema,
} from "x402/types";
import { SecretsManagerClient, GetSecretValueCommand } from "@aws-sdk/client-secrets-manager";

config();

// Initialize AWS Secrets Manager client
const secretsClient = new SecretsManagerClient({});

// Function to get the private key from environment or Secrets Manager
async function getPrivateKey(): Promise<string> {
  // For local development, use the .env file
  if (process.env.AWS_LAMBDA_FUNCTION_NAME === undefined) {
    if (!process.env.PRIVATE_KEY) {
      console.error("Missing PRIVATE_KEY in environment variables");
      process.exit(1);
    }
    return process.env.PRIVATE_KEY;
  }
  
  // For Lambda, get the key from Secrets Manager
  try {
    const secretArn = process.env.PRIVATE_KEY_SECRET_ARN;
    if (!secretArn) {
      throw new Error("Missing PRIVATE_KEY_SECRET_ARN environment variable");
    }
    
    const command = new GetSecretValueCommand({
      SecretId: secretArn,
    });
    
    const response = await secretsClient.send(command);
    if (!response.SecretString) {
      throw new Error("Secret value is empty");
    }
    
    return response.SecretString;
  } catch (error) {
    console.error("Error retrieving private key from Secrets Manager:", error);
    throw error;
  }
}

const { createClientSeiTestnet, createSignerSeiTestnet } = evm;

const app = express();

// Configure express to parse JSON bodies
app.use(express.json());

type VerifyRequest = {
  paymentPayload: PaymentPayload;
  paymentRequirements: PaymentRequirements;
};

type SettleRequest = {
  paymentPayload: PaymentPayload;
  paymentRequirements: PaymentRequirements;
};

const client = createClientSeiTestnet();

app.get("/verify", (req, res) => {
  res.json({
    endpoint: "/verify",
    description: "POST to verify x402 payments",
    body: {
      paymentPayload: "PaymentPayload",
      paymentRequirements: "PaymentRequirements",
    },
  });
});

app.post("/verify", async (req, res) => {
  try {
    const body: VerifyRequest = req.body;
    const paymentRequirements = PaymentRequirementsSchema.parse(body.paymentRequirements);
    const paymentPayload = PaymentPayloadSchema.parse(body.paymentPayload);
    const valid = await verify(client, paymentPayload, paymentRequirements);
    res.json(valid);
  } catch (error) {
    console.error("Error in /verify:", error);
    res.status(400).json({ error: "Invalid request" });
  }
});

app.get("/settle", (req, res) => {
  res.json({
    endpoint: "/settle",
    description: "POST to settle x402 payments",
    body: {
      paymentPayload: "PaymentPayload",
      paymentRequirements: "PaymentRequirements",
    },
  });
});

app.get("/supported", (req, res) => {
  res.json({
    kinds: [
      {
        x402Version: 1,
        scheme: "exact",
        network: "sei-testnet",
      },
    ],
  });
});

app.post("/settle", async (req, res) => {
  try {
    const privateKey = await getPrivateKey();
    const signer = createSignerSeiTestnet(privateKey as `0x${string}`);
    const body: SettleRequest = req.body;
    const paymentRequirements = PaymentRequirementsSchema.parse(body.paymentRequirements);
    const paymentPayload = PaymentPayloadSchema.parse(body.paymentPayload);
    const response = await settle(signer, paymentPayload, paymentRequirements);
    res.json(response);
  } catch (error) {
    console.error("Error in /settle:", error);
    res.status(400).json({ error: `Invalid request: ${error}` });
  }
});

// For local development
if (process.env.AWS_LAMBDA_FUNCTION_NAME === undefined) {
  app.listen(process.env.PORT || 3000, () => {
    console.log(`Server listening at http://localhost:${process.env.PORT || 3000}`);
  });
}

// Export the serverless handler for AWS Lambda
export const handler = serverless(app);
