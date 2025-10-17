# x402-middy

Middy middleware integration for the x402 Payment Protocol. This package allows you to easily add paywall functionality to your AWS Lambda functions using the x402 protocol and Middy middleware engine.

## Installation

```bash
npm install x402-middy @middy/core
```

## Quick Start

```typescript
import middy from "@middy/core";
import { x402Middleware } from "x402-middy";
import type { APIGatewayProxyEvent, APIGatewayProxyResult } from "aws-lambda";

const baseHandler = async (
  event: APIGatewayProxyEvent
): Promise<APIGatewayProxyResult> => {
  return {
    statusCode: 200,
    body: JSON.stringify({ message: "This content is behind a paywall" }),
  };
};

export const handler = middy(baseHandler).use(
  x402Middleware({
    payTo: "0xYourAddress",
    price: "$0.10",
    network: "base-sepolia",
    config: {
      description: "Access to premium content",
    },
  })
);
```

## Configuration

The `x402Middleware` function accepts an options object with the following parameters:

### Required Parameters

- `payTo`: Your receiving address (`0x${string}` for EVM or Solana address string)
- `price`: Price in USD (e.g., `"$0.10"`) or token amount
- `network`: Network to use (e.g., `"base"`, `"base-sepolia"`, `"solana"`, `"solana-devnet"`)

### Optional Parameters

- `config`: Payment configuration options
- `facilitator`: Configuration for the x402 facilitator service
- `paywall`: Configuration for the built-in paywall UI

See the Middleware Options section below for detailed configuration options.

## Middleware Options

### X402MiddlewareOptions

```typescript
interface X402MiddlewareOptions {
  payTo: Address | SolanaAddress;
  price: string | number | ERC20TokenAmount;
  network: Network;
  config?: X402Config;
  facilitator?: FacilitatorConfig;
  paywall?: PaywallConfig;
}
```

### Payment Configuration (X402Config)

```typescript
interface X402Config {
  description?: string;               // Description of the payment
  mimeType?: string;                  // MIME type of the resource
  maxTimeoutSeconds?: number;         // Maximum time for payment (default: 60)
  inputSchema?: unknown;              // JSON schema for the request
  outputSchema?: unknown;             // JSON schema for the response
  customPaywallHtml?: string;         // Custom HTML for the paywall
  resource?: Resource;                // Resource URL (defaults to request URL)
  discoverable?: boolean;             // Whether the resource is discoverable (default: true)
}
```

### Facilitator Configuration

```typescript
type FacilitatorConfig = {
  url: string;                        // URL of the x402 facilitator service
  createAuthHeaders?: CreateHeaders;  // Optional function to create authentication headers
};
```

### Paywall Configuration

For more on paywall configuration options, refer to the [paywall README](../x402/src/paywall/README.md).

```typescript
type PaywallConfig = {
  cdpClientKey?: string;              // Your CDP Client API Key
  appName?: string;                   // Name displayed in the paywall wallet selection modal
  appLogo?: string;                   // Logo for the paywall wallet selection modal
  sessionTokenEndpoint?: string;      // API endpoint for Coinbase Onramp session authentication
};
```

## Optional: Coinbase Onramp Integration

**Note**: Onramp integration is completely optional. Your x402 paywall will work perfectly without it. This feature is for users who want to provide an easy way for their customers to fund their wallets directly from the paywall.

When configured, a "Get more USDC" button will appear in your paywall, allowing users to purchase USDC directly through Coinbase Onramp.

### Quick Setup

#### 1. Create the Session Token Lambda Function

Create a separate Lambda function for generating session tokens:

```typescript
import { handler } from "x402-middy/session-token";

export { handler };
```

Or wrap it with middy for additional middleware:

```typescript
import middy from "@middy/core";
import { handler as sessionTokenHandler } from "x402-middy/session-token";

export const handler = middy(sessionTokenHandler);
```

#### 2. Configure Your Middleware

Add `sessionTokenEndpoint` to your middleware configuration. This tells the paywall where to find your session token API:

```typescript
export const handler = middy(baseHandler).use(
  x402Middleware({
    payTo: "0xYourAddress",
    price: "$0.10",
    network: "base-sepolia",
    paywall: {
      sessionTokenEndpoint: "/api/x402/session-token",
      cdpClientKey: "your-cdp-client-key",
    },
  })
);
```

**Important**: The `sessionTokenEndpoint` must match the API Gateway path to your session token Lambda. You can use any path you prefer - just make sure both the route and configuration use the same path. Without this configuration, the "Get more USDC" button will be hidden.

#### 3. Get CDP API Keys

1. Go to [CDP Portal](https://portal.cdp.coinbase.com/)
2. Navigate to your project's **[API Keys](https://portal.cdp.coinbase.com/projects/api-keys)**
3. Click **Create API key**
4. Download and securely store your API key

#### 4. Enable Onramp Secure Initialization in CDP Portal

1. Go to [CDP Portal](https://portal.cdp.coinbase.com/)
2. Navigate to **Payments → [Onramp & Offramp](https://portal.cdp.coinbase.com/products/onramp)**
3. Toggle **"Enforce secure initialization"** to **Enabled**

#### 5. Set Environment Variables

Add your CDP API keys to your Lambda environment variables:

```bash
CDP_API_KEY_ID=your_secret_api_key_id_here
CDP_API_KEY_SECRET=your_secret_api_key_secret_here
```

In AWS Lambda, you can set these in:
- AWS Console: Lambda → Configuration → Environment variables
- Serverless Framework: `serverless.yml` environment section
- SAM: `template.yaml` environment section
- CDK: Lambda function environment property

### How Onramp Works

Once set up, your x402 paywall will automatically show a "Get more USDC" button when users need to fund their wallets.

1. **Generates session token**: Your Lambda function securely creates a session token using CDP's API
2. **Opens secure onramp**: User is redirected to Coinbase Onramp with the session token
3. **No exposed data**: Wallet addresses and app IDs are never exposed in URLs

### Troubleshooting Onramp

#### Common Issues

1. **"Missing CDP API credentials"**
   - Ensure `CDP_API_KEY_ID` and `CDP_API_KEY_SECRET` are set in Lambda environment variables
   - Verify you're using **Secret API Keys**, not Client API Keys

2. **"Failed to generate session token"**
   - Check your CDP Secret API key has proper permissions
   - Verify your project has Onramp enabled

3. **API route not found**
   - Ensure your API Gateway is configured to route to the session token Lambda
   - Check that your route path matches your `sessionTokenEndpoint` configuration
   - Verify the Lambda deployment and API Gateway integration

## Example: Serverless Framework

```yaml
# serverless.yml
service: my-paywall-api

provider:
  name: aws
  runtime: nodejs20.x
  environment:
    CDP_API_KEY_ID: ${env:CDP_API_KEY_ID}
    CDP_API_KEY_SECRET: ${env:CDP_API_KEY_SECRET}

functions:
  protectedContent:
    handler: handler.protectedHandler
    events:
      - httpApi:
          path: /content
          method: GET

  sessionToken:
    handler: session-token.handler
    events:
      - httpApi:
          path: /api/x402/session-token
          method: POST
```

## Example: AWS SAM

```yaml
# template.yaml
AWSTemplateFormatVersion: '2010-09-09'
Transform: AWS::Serverless-2016-10-31

Globals:
  Function:
    Runtime: nodejs20.x
    Environment:
      Variables:
        CDP_API_KEY_ID: !Ref CdpApiKeyId
        CDP_API_KEY_SECRET: !Ref CdpApiKeySecret

Resources:
  ProtectedContentFunction:
    Type: AWS::Serverless::Function
    Properties:
      Handler: handler.protectedHandler
      Events:
        ApiEvent:
          Type: HttpApi
          Properties:
            Path: /content
            Method: GET

  SessionTokenFunction:
    Type: AWS::Serverless::Function
    Properties:
      Handler: session-token.handler
      Events:
        ApiEvent:
          Type: HttpApi
          Properties:
            Path: /api/x402/session-token
            Method: POST

Parameters:
  CdpApiKeyId:
    Type: String
    NoEcho: true
  CdpApiKeySecret:
    Type: String
    NoEcho: true
```

## Resources

- [x402 Protocol](https://x402.org)
- [CDP Documentation](https://docs.cdp.coinbase.com)
- [CDP Discord](https://discord.com/invite/cdp)
- [Middy Documentation](https://middy.js.org/)
