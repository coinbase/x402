# x402 CloudFront + Lambda@Edge

Add x402 payments to any web server without modifying your backend. Put CloudFront in front of your origin, and Lambda@Edge handles all payment logic at the edge.

> **Reference Implementation**: This is a reference approach demonstrating the pattern. Actual deployment and code bundling will depend on your project's infrastructure and build tooling (CDK, Terraform, SAM, Serverless Framework, etc.).

## Why This Approach?

- **Zero backend changes**: Your origin server stays untouched
- **Any origin, anywhere**: Works with any HTTP server — AWS, GCP, Azure, on-prem, or third-party APIs
- **Drop-in monetization**: Add payments to existing APIs in minutes
- **Edge performance**: Payment verification at CloudFront's global edge locations

## How It Works

```mermaid
sequenceDiagram
    participant Client
    participant CloudFront
    participant Lambda@Edge
    participant Facilitator as x402 Facilitator
    participant Origin as Your Origin

    Client->>CloudFront: Request /api/data
    CloudFront->>Lambda@Edge: origin-request event
    
    alt No payment header
        Lambda@Edge-->>Client: 402 Payment Required
    else Has PAYMENT-SIGNATURE header
        Lambda@Edge->>Facilitator: Verify payment
        Facilitator-->>Lambda@Edge: Valid
        Lambda@Edge->>Facilitator: Settle payment
        Facilitator-->>Lambda@Edge: Settled
        Lambda@Edge->>Origin: Forward request
        Origin-->>Client: Response
    end
```

Lambda@Edge intercepts requests, checks for payment, verifies with the facilitator, and only forwards paid requests to your origin. Your backend never sees unpaid requests.

## Quick Start

### 1. Copy the Lambda Source

Copy the `lambda/src/` files into your project and adapt the build process to your tooling.

> **Note**: The `lambda/package.json` uses `"@x402/core": "workspace:*"` for monorepo development. When copying this example to a standalone project, replace it with a specific version:
> ```json
> "@x402/core": "^2.2.0"
> ```

### 2. Configure Routes

Edit `config.ts` with your payment settings:

```typescript
export const CONFIG: X402Config = {
  facilitatorUrl: 'https://x402.org/facilitator',
  network: 'eip155:84532', // Base Sepolia testnet
  payTo: '0xYourAddress',
  routes: {
    '/api/*': { price: '$0.001', description: 'API access' },
    '/premium/**': { price: '$0.01', description: 'Premium content' },
  },
};
```

### 3. Deploy

Bundle and deploy the Lambda function using your preferred tooling (CDK, SAM, Terraform, etc.), then attach it to your CloudFront distribution's origin-request event.


## Networks

| Network      | ID             | Use        |
| ------------ | -------------- | ---------- |
| Base Sepolia | `eip155:84532` | Testing    |
| Base Mainnet | `eip155:8453`  | Production |

## File Structure

```
cloudfront-lambda-edge/
├── lambda/src/
│   ├── index.ts      # Handler
│   ├── config.ts     # Routes & settings
│   ├── payment.ts    # Facilitator client
│   └── responses.ts  # 402 formatting
└── cdk/              # Optional: Infrastructure as code
```

## Advanced Patterns

### WAF Integration for Bot Protection

AWS WAF associated with CloudFront to label bots or suspicious traffic. Lambda@Edge can then check these labels and require payment only for labeled requests:

```typescript
// In your Lambda@Edge handler
const isBot = request.headers['x-amzn-waf-bot']?.[0]?.value;

if (isBot) {
  // Require payment for bot traffic
  return requirePayment(request);
}
// Allow non-bot traffic through without payment
```

This lets you monetize bot/scraper traffic while keeping human users free.

### Caching Optimization

CloudFront caching can reduce facilitator and Lambda@Edge calls for repeated requests:

- **Unpaid requests**: Cache 402 responses so repeated requests without payment don't hit Lambda@Edge
- **Token-based payments**: Cache responses by payment token to serve repeated requests with the same token from edge cache

Configure cache behaviors to include `PAYMENT-SIGNATURE` header in the cache key, allowing paid responses to be cached per-token.

### Cookie-Based Sessions

The current implementation reads payment info from the `PAYMENT-SIGNATURE` header. For session-based flows (e.g., browser apps), you can switch to cookies:

```typescript
// Read from cookie instead of header
const paymentCookie = request.headers.cookie?.[0]?.value
  ?.split(';')
  .find(c => c.trim().startsWith('x402-payment='));

const paymentSignature = paymentCookie
  ? decodeURIComponent(paymentCookie.split('=')[1])
  : null;
```

This enables payment persistence across page navigations without requiring the client to attach headers to every request.

## Notes

- Lambda@Edge must deploy to `us-east-1`
- No env vars in Lambda@Edge — config is bundled
- Max 30s timeout for origin-request
- Add `PAYMENT-SIGNATURE` to CloudFront cache key headers
