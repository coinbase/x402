/* eslint-env node */
const dotenv = require("dotenv");
const express = require("express");
const serverless = require("serverless-http");
const { verify, settle } = require("x402/facilitator");
const {
  PaymentRequirementsSchema,
  PaymentPayloadSchema,
  evm,
} = require("x402/types");
const { SecretsManagerClient, GetSecretValueCommand } = require("@aws-sdk/client-secrets-manager");

dotenv.config();

const { createConnectedClient, createSigner } = evm;

// Initialize AWS Secrets Manager client
const secretsClient = new SecretsManagerClient({});

// Function to get the private key from environment or Secrets Manager
async function getPrivateKey() {
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

const app = express();

// Configure express to parse JSON bodies
app.use(express.json());

const client = createConnectedClient("sei-testnet");

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
    const body = req.body;
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
    const signer = createSigner("sei-testnet", privateKey);
    const body = req.body;
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

// Export the app for potential use in other files
module.exports = app;

// Export the serverless handler for AWS Lambda
module.exports.handler = serverless(app);
