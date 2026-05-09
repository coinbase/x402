# Ecosystem Integration Guide

This guide helps developers integrate x402 into their APIs and services for inclusion in the x402 ecosystem directory.

## Overview

The x402 ecosystem consists of APIs, services, and infrastructure that accept USDC micropayments for access. Projects range from AI services and data APIs to facilitators and developer tools.

## Integration Steps

### 1. Choose Your Integration Pattern

**API Service**: Add x402 payment gates to existing REST endpoints
**Facilitator**: Provide x402 payment processing for other services  
**Infrastructure**: Build tooling that supports x402 payments
**Client Library**: Create SDKs that work with x402-enabled services

### 2. Technical Integration

#### For API Services

1. **Install x402 middleware** for your framework:
   ```bash
   # Node.js/Express
   npm install @x402/express
   
   # Python/FastAPI
   pip install x402-fastapi
   
   # Go
   go get github.com/coinbase/x402/go/middleware
   ```

2. **Configure payment requirements**:
   ```javascript
   // Express example
   const x402 = require('@x402/express');
   
   app.use('/api/premium', x402({
     amount: '0.01', // 0.01 USDC
     recipient: '0x...',
     network: 'base',
     schemes: ['exact']
   }));
   ```

3. **Add discovery endpoints**:
   ```javascript
   // /.well-known/x402.json
   {
     "version": "2.0",
     "capabilities": {
       "verify": true,
       "settle": true
     },
     "facilitators": [{
       "url": "https://facilitator.example.com",
       "networks": ["eip155:8453"],
       "schemes": ["exact"],
       "assets": ["USDC"]
     }]
   }
   ```

#### For Facilitators

1. **Implement the x402 protocol**:
   - `/verify` - Validate payment requirements
   - `/settle` - Process the actual payment

2. **Handle multiple payment schemes**:
   - `exact` - Fixed amount payments
   - `upto` - Maximum amount with actual usage billing

3. **Support multiple networks**:
   - Base (eip155:8453) - Primary network
   - Polygon (eip155:137) - Alternative network
   - Solana - For SPL tokens

### 3. Testing Integration

#### Test Payment Flow

1. **Set up testnet environment**:
   ```bash
   # Use Base Sepolia for testing
   export X402_NETWORK=base-sepolia
   export X402_FACILITATOR_URL=https://facilitator.x402.org
   ```

2. **Test 402 responses**:
   ```bash
   curl -I https://your-api.com/premium-endpoint
   # Should return: HTTP/1.1 402 Payment Required
   # With X402-Accept-Crypto header
   ```

3. **Test payment settlement**:
   ```bash
   # Use x402 CLI tool
   npx @x402/cli pay https://your-api.com/premium-endpoint
   ```

#### Validate Discovery

1. **Check discovery endpoint**:
   ```bash
   curl https://your-api.com/.well-known/x402.json | jq
   ```

2. **Validate against schema**:
   ```bash
   npx @x402/cli validate https://your-api.com
   ```

### 4. Production Deployment

#### Security Checklist

- [ ] Payment verification is cryptographically secure
- [ ] Rate limiting prevents abuse
- [ ] Private keys are securely managed
- [ ] HTTPS is enforced for all endpoints
- [ ] Payment amounts are validated server-side

#### Monitoring

1. **Track key metrics**:
   - Payment success rate
   - Failed verification attempts  
   - Revenue per endpoint
   - User retention

2. **Set up alerts** for:
   - Facilitator downtime
   - Failed payment rate > 5%
   - Unusual payment patterns

### 5. Ecosystem Submission

#### Required Information

When submitting to the ecosystem directory, include:

1. **Basic Info**:
   - Project name and description
   - Category (Services/Infrastructure/Facilitators/etc.)
   - Live URL and documentation

2. **Technical Details**:
   - Supported networks (Base, Polygon, Solana, etc.)
   - Payment schemes (exact, upto)
   - API endpoints and pricing

3. **Discovery URLs**:
   - `/.well-known/x402.json` - Payment capabilities
   - `/openapi.json` or `/docs` - API documentation
   - `/.well-known/agent-card.json` - Agent information (if applicable)

#### Submission Process

1. **Fork the repository**:
   ```bash
   gh repo fork coinbase/x402
   ```

2. **Create a new branch**:
   ```bash
   git checkout -b ecosystem/add-your-project
   ```

3. **Submit via GitHub PR** with:
   - Updated ecosystem directory
   - Verification that your service is live
   - Documentation links

### 6. Best Practices

#### Pricing Strategy

- **Start low**: Begin with $0.001-$0.01 per call
- **Value-based**: Price according to computational cost or data value
- **Tiered**: Offer different pricing for different quality levels

#### User Experience

- **Clear pricing**: Display costs prominently in documentation
- **Fast responses**: Aim for <200ms payment verification
- **Good errors**: Return helpful error messages for payment failures

#### Agent Integration

1. **Provide MCP servers** for Claude/ChatGPT integration:
   ```json
   {
     "mcpServers": {
       "your-service": {
         "command": "npx",
         "args": ["your-mcp-server"],
         "env": {
           "X402_FACILITATOR_URL": "https://facilitator.x402.org"
         }
       }
     }
   }
   ```

2. **Support auto-discovery** through standard patterns:
   - OpenAPI specs with x402 extensions
   - Bazaar discovery integration
   - Agent registration via ERC-8004

## Common Integration Patterns

### Data API Service

Perfect for: Market data, AI inference, specialized databases

```javascript
// Rate-limited free tier + paid premium
app.get('/api/data', rateLimiter(10, 'hour'), handler);
app.get('/api/data', x402({ amount: '0.005' }), handler);
```

### AI Inference Service

Perfect for: LLM APIs, image generation, specialized models

```python
# FastAPI with usage-based pricing
@app.post("/generate")
@x402_required(scheme="upto", max_amount="0.50")
async def generate_text(prompt: str):
    tokens = await generate(prompt)
    # Bill based on actual tokens used
    await bill_usage(len(tokens) * 0.001)
```

### Facilitator Service

Perfect for: Payment processing, multi-network support

```go
// Go facilitator implementation
func (f *Facilitator) Verify(req VerifyRequest) (*VerifyResponse, error) {
    // Validate payment requirements
    // Return verification proof
}

func (f *Facilitator) Settle(req SettleRequest) (*SettleResponse, error) {
    // Process actual payment
    // Return settlement confirmation
}
```

## Troubleshooting

### Common Issues

1. **402 not returned**: Check middleware configuration
2. **Payment fails**: Verify facilitator URL and network
3. **Discovery not found**: Ensure `.well-known/x402.json` is accessible
4. **Invalid signatures**: Check private key and message formatting

### Debug Tools

```bash
# Test payment flow
npx @x402/cli debug https://your-api.com/endpoint

# Validate discovery document
npx @x402/cli validate-discovery https://your-api.com

# Monitor payments
npx @x402/cli monitor --endpoint https://your-api.com
```

## Getting Help

- **Documentation**: [x402.org/docs](https://x402.org/docs)
- **Examples**: Check the [examples directory](../../examples/)
- **Community**: Join discussions in ecosystem PRs
- **Issues**: For protocol questions, create detailed reproduction cases

## Next Steps

1. **Test your integration** thoroughly on testnets
2. **Monitor performance** and optimize for your use case
3. **Submit to ecosystem** via GitHub PR
4. **Iterate based on feedback** from the community

The x402 ecosystem thrives on high-quality integrations that provide real value to AI agents and human users alike. Focus on reliable service, clear documentation, and fair pricing.