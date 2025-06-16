# x402 Facilitator AWS Lambda Example

This is an example implementation of an x402 facilitator service that handles payment verification and settlement for the x402 payment protocol, deployed as an AWS Lambda function using AWS CDK.

For production use, we recommend using:
- Testnet: https://x402.org/facilitator
- Production: https://api.cdp.coinbase.com/platform/v2/x402

## Overview

The facilitator provides two main endpoints:
- `/verify`: Verifies x402 payment payloads
- `/settle`: Settles x402 payments by signing and broadcasting transactions

This example demonstrates how to:
1. Set up an Express server wrapped with serverless-http for AWS Lambda
2. Deploy the facilitator using AWS CDK with API Gateway integration
3. Securely store and retrieve private keys using AWS Secrets Manager
4. Integrate with the x402 protocol's verification and settlement functions
5. Handle payment payload validation and error cases

## Prerequisites

- Node.js v20+ (install via [nvm](https://github.com/nvm-sh/nvm))
- pnpm v10 (install via [pnpm.io/installation](https://pnpm.io/installation))
- AWS CLI configured with appropriate credentials
- AWS CDK installed globally (`npm install -g aws-cdk`)
- A valid Ethereum private key for Base Sepolia
- Base Sepolia testnet ETH for transaction fees

## Local Development Setup

1. Install and build all packages from the typescript examples root:
```bash
cd ..
pnpm install
pnpm build
cd facilitator_aws
```

2. Create a `.env` file with the following variables:
```env
PRIVATE_KEY=0xYourPrivateKey
```

3. Start the server locally:
```bash
pnpm dev
```

The server will start on http://localhost:3000

## AWS Lambda Deployment

### 1. Build the Lambda function

```bash
pnpm build
```

This will create a bundled version of the application in the `dist` directory.

### 2. Deploy using CDK

First, bootstrap your AWS environment if you haven't already:

```bash
pnpm cdk:bootstrap
```

Then deploy the stack:

```bash
pnpm cdk:deploy
```

### 3. Set up the Private Key in AWS Secrets Manager

After deployment, the CDK stack will create a secret in AWS Secrets Manager and output its ARN. You'll need to set the value of this secret:

1. Go to the AWS Console
2. Navigate to Secrets Manager
3. Find the secret named `x402-facilitator-private-key`
4. Click "Retrieve secret value" and then "Edit"
5. Enter your private key (including the `0x` prefix)
6. Click "Save"

The Lambda function is configured with permissions to read this secret and will retrieve it at runtime.

### 4. Cleanup

To remove all deployed resources:

```bash
pnpm cdk:destroy
```

## API Endpoints

Once deployed, the API Gateway will expose the following endpoints:

### GET /verify
Returns information about the verify endpoint.

### POST /verify
Verifies an x402 payment payload.

Request body:
```typescript
{
  paymentPayload: PaymentPayload;
  paymentRequirements: PaymentRequirements;
}
```

### GET /settle
Returns information about the settle endpoint.

### POST /settle
Settles an x402 payment by signing and broadcasting the transaction.

Request body:
```typescript
{
  paymentPayload: PaymentPayload;
  paymentRequirements: PaymentRequirements;
}
```

### GET /supported
Returns information about supported payment schemes and networks.

## CDK Infrastructure

The CDK stack creates the following AWS resources:

- AWS Lambda function with the facilitator code
- API Gateway REST API with routes for all endpoints
- AWS Secrets Manager secret for storing the private key
- Appropriate IAM roles and permissions for the Lambda to access the secret

## Security Considerations

This example demonstrates a secure way to handle private keys in a serverless environment:

1. The private key is stored in AWS Secrets Manager, not in environment variables
2. The Lambda function has IAM permissions to read the secret
3. The secret is retrieved at runtime only when needed
4. The private key is never logged or exposed in the Lambda configuration

## Learning Resources

This example is designed to help you understand how x402 facilitators work. For more information about the x402 protocol and its implementation, visit:
- [x402 Protocol Documentation](https://x402.org)
- [Coinbase Developer Platform](https://www.coinbase.com/developer-platform)
- [AWS CDK Documentation](https://docs.aws.amazon.com/cdk/latest/guide/home.html)
- [AWS Lambda Documentation](https://docs.aws.amazon.com/lambda/latest/dg/welcome.html)
- [AWS Secrets Manager Documentation](https://docs.aws.amazon.com/secretsmanager/latest/userguide/intro.html)
