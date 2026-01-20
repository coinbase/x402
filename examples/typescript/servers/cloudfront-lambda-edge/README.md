# x402 CloudFront + Lambda@Edge

Add x402 payments to any web server without modifying your backend. Put CloudFront in front of your origin, and Lambda@Edge handles all payment logic at the edge.

> **Reference Implementation**: This is a reference approach demonstrating the pattern. Actual deployment and code bundling will depend on your project's infrastructure and build tooling (CDK, Terraform, SAM, Serverless Framework, etc.).

## Why This Approach?

- **Zero backend changes**: Your origin server stays untouched
- **Any origin, anywhere**: Works with any HTTP server — AWS, GCP, Azure, on-prem, or third-party APIs
- **Drop-in monetization**: Add payments to existing APIs in minutes
- **Edge performance**: Payment verification at CloudFront's global edge locations
- **Uses @x402/core**: Leverages `x402HTTPResourceServer` for consistent behavior with other x402 implementations

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

Copy the `lambda/src/` directory into your project and adapt the build process to your tooling.

> **Note**: The `lambda/package.json` uses `workspace:*` for monorepo development. When copying this example to a standalone project, replace with specific versions:
> ```json
> "@x402/core": "^2.2.0",
> "@x402/evm": "^2.2.0"
> ```

### 2. Configure Payment Settings

Edit `server.ts` to configure your deployment. All configuration is at the top of the file:

```typescript
// Payment configuration
const FACILITATOR_URL = 'https://x402.org/facilitator';
const PAY_TO = '0xYourPaymentAddressHere';  // Your wallet address
const NETWORK = 'eip155:84532';              // Base Sepolia (testnet) or 'eip155:8453' (mainnet)
```

### 3. Configure Routes

Define which routes require payment in the `ROUTES` constant in `server.ts`:

```typescript
const ROUTES: RoutesConfig = {
  '/api/*': {
    accepts: {
      scheme: 'exact',
      network: 'eip155:84532',
      payTo: '0xYourAddress',
      price: '$0.001',
    },
    description: 'API access',
  },
  '/api/premium/**': {
    accepts: {
      scheme: 'exact',
      network: 'eip155:84532',
      payTo: '0xYourAddress',
      price: '$0.01',
    },
    description: 'Premium API access',
  },
};
```

The route configuration uses the same `RouteConfig` type from `@x402/core/server`, ensuring consistency with other x402 implementations.

### 4. Deploy

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
│   ├── index.ts      # Lambda handler
│   ├── adapter.ts    # CloudFrontHTTPAdapter for x402
│   ├── server.ts     # x402HTTPResourceServer setup & routes
│   └── responses.ts  # Lambda@Edge response helpers
└── cdk/              # Optional: Infrastructure as code
```

The implementation uses `x402HTTPResourceServer` from `@x402/core` with a custom `CloudFrontHTTPAdapter` that translates CloudFront request format to the standard `HTTPAdapter` interface.

## Advanced Patterns

### WAF Integration for Bot Protection

AWS WAF associated with CloudFront to label bots or suspicious traffic. Lambda@Edge can then check these labels and require payment only for labeled requests:

```typescript
// In your Lambda@Edge handler, before processing
const isBot = request.headers['x-amzn-waf-bot']?.[0]?.value;

if (isBot) {
  // Add bot-specific routes or pricing
}
```

This lets you monetize bot/scraper traffic while keeping human users free.

### Caching Optimization

CloudFront caching can reduce facilitator and Lambda@Edge calls for repeated requests:

- **Unpaid requests**: Cache 402 responses so repeated requests without payment don't hit Lambda@Edge
- **Token-based payments**: Cache responses by payment token to serve repeated requests with the same token from edge cache

Configure cache behaviors to include `PAYMENT-SIGNATURE` header in the cache key, allowing paid responses to be cached per-token.

### Cookie-Based Sessions

The current implementation reads payment info from the `PAYMENT-SIGNATURE` header. For session-based flows (e.g., browser apps), you can extend the `CloudFrontHTTPAdapter` to read from cookies:

```typescript
getHeader(name: string): string | undefined {
  if (name.toLowerCase() === 'payment-signature') {
    // Check cookie first
    const cookie = this.request.headers.cookie?.[0]?.value;
    const match = cookie?.match(/x402-payment=([^;]+)/);
    if (match) return decodeURIComponent(match[1]);
  }
  return this.request.headers[name.toLowerCase()]?.[0]?.value;
}
```

This enables payment persistence across page navigations without requiring the client to attach headers to every request.

## Notes

- Lambda@Edge must deploy to `us-east-1`
- No env vars in Lambda@Edge — config is bundled in the code
- Max 30s timeout for origin-request
- Add `PAYMENT-SIGNATURE` to CloudFront cache key headers
- Server is initialized lazily on first request and reused across invocations
- **Paywall disabled**: HTML paywall for browsers is disabled by default since Lambda@Edge responses are limited to 1MB. For browser-based payment flows, you can have Lambda@Edge dynamically generate and upload the paywall HTML to S3, then use origin routing to serve the hosted HTML for a seamless experience.
