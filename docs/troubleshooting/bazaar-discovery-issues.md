# Bazaar Discovery Troubleshooting Guide

This guide helps diagnose and resolve issues with x402 Bazaar discovery indexing, where properly configured endpoints fail to appear in facilitator discovery catalogs.

## Quick Diagnosis

If your x402 endpoints aren't appearing in discovery results despite having working payments and proper bazaar configuration, follow these steps:

### 1. Verify Your Configuration

**Check your 402 response includes all required fields:**

```bash
curl -s "https://your-domain.com/api/endpoint" | jq .
```

Required fields in 402 response:
- `accepts[0].discoverable: true`  
- `accepts[0].description: "clear description"`
- `accepts[0].mimeType: "application/json"`
- `accepts[0].resource: "https://your-domain.com/api/endpoint"`
- `accepts[0].outputSchema: {...}` with input/output structure
- `extensions.bazaar: {...}` with proper schema

### 2. Test Discovery Endpoint

**Check if your discovery document is accessible:**

```bash
curl -s "https://your-domain.com/.well-known/x402" | jq .
```

Should return:
```json
{
  "version": 1,
  "resources": [
    "POST /api/endpoint-1",
    "GET /api/endpoint-2"
  ]
}
```

### 3. Verify Payment Flow

**Ensure payments work end-to-end:**

```bash
# Test payment with x402 client
# This confirms facilitator can process your endpoint
```

If payments fail, fix payment integration before troubleshooting discovery.

### 4. Check Facilitator Discovery

**Query the facilitator's discovery endpoint:**

```bash
# CDP Facilitator
curl -s "https://api.cdp.coinbase.com/platform/v2/x402/discovery/resources" | \
  jq '.items[] | select(.resource | contains("your-domain.com"))'

# PayAI Facilitator  
curl -s "https://facilitator.payai.network/discovery/resources" | \
  jq '.items[] | select(.resource | contains("your-domain.com"))'
```

## Common Issues and Solutions

### Issue 1: Endpoints Not Indexed Despite Correct Configuration

**Symptoms:**
- 402 responses include all required bazaar fields
- Payments work successfully 
- Discovery document accessible
- Zero results in facilitator discovery API

**Diagnosis:**
This indicates an indexing pipeline issue rather than configuration problem.

**Solutions:**

#### A. Wait for Indexing Delay
Discovery indexing isn't real-time. Wait 24-48 hours after first successful payment.

#### B. Try Alternative Facilitators
Different facilitators maintain separate discovery indexes:

```javascript
// Test with PayAI facilitator instead of CDP
const facilitatorClient = new HTTPFacilitatorClient({
  url: "https://facilitator.payai.network"
});
```

#### C. Force Re-indexing (Advanced)
Some facilitators support manual re-indexing triggers:

```bash
# Contact facilitator support to manually trigger re-index
# Include your domain and endpoint URLs
```

### Issue 2: Missing Discovery Document

**Symptoms:**
- `curl https://your-domain.com/.well-known/x402` returns 404
- Endpoints work with direct payment

**Solution:**
Add discovery document endpoint:

```javascript
// Express.js
app.get('/.well-known/x402', (req, res) => {
  res.json({
    version: 1,
    resources: [
      "POST /api/endpoint-1",
      "GET /api/endpoint-2"
    ]
  });
});
```

### Issue 3: Invalid Discovery Metadata

**Symptoms:**
- Discovery document exists
- 402 responses missing bazaar extensions

**Solution:**
Verify bazaar extension in route config:

```typescript
const routes = {
  "GET /weather": {
    price: "$0.001",
    network: "eip155:8453", 
    resource: "0xYourAddress",
    description: "Get weather data",
    extensions: {
      bazaar: {
        discoverable: true,
        inputSchema: { /* ... */ },
        outputSchema: { /* ... */ }
      }
    }
  }
};
```

### Issue 4: Network/Asset Mismatch

**Symptoms:** 
- Some facilitators index your endpoints
- Others don't

**Root Cause:**
Facilitators may have different network/asset requirements.

**Solution:**
Support multiple networks in accepts array:

```json
{
  "accepts": [
    {
      "scheme": "exact",
      "network": "eip155:8453", 
      "asset": "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913",
      "discoverable": true,
      "description": "...",
      "outputSchema": { "..." }
    },
    {
      "scheme": "exact", 
      "network": "solana:5eykt4UsFv8P8NJdTREpY1vzqKqZKvdp",
      "asset": "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v",
      "discoverable": true,
      "description": "...",
      "outputSchema": { "..." }
    }
  ]
}
```

### Issue 5: Schema Validation Failures

**Symptoms:**
- Endpoints appear in some discovery results
- Missing from others or incomplete data

**Root Cause:**
Invalid JSON schemas in `outputSchema` or `inputSchema`.

**Solution:**
Validate your schemas:

```bash
# Use a JSON Schema validator
echo '{"type": "object", "properties": {...}}' | \
  npx ajv-cli validate --schema schema.json
```

## Advanced Debugging

### 1. Monitor Facilitator Logs

If you have access to facilitator logs, check for indexing errors:

```bash
# Look for your domain in facilitator logs
grep "your-domain.com" /var/log/facilitator/*.log
```

### 2. Test with Discovery Validator

Use the x402 discovery validator tool:

```bash
# Validate your discovery document
cd ~/Github/x402/tools
node discovery-validator.js https://your-domain.com/.well-known/x402

# Validate specific endpoint
node discovery-validator.js https://your-domain.com/api/endpoint
```

### 3. Compare Working Examples

Compare your configuration with known working endpoints:

```bash
# Check a working endpoint's 402 response
curl -s "https://working-service.com/api/endpoint" | \
  jq '.accepts[0] | {discoverable, description, outputSchema}'
```

### 4. Network Request Tracing

Monitor what the facilitator sees when indexing:

```bash
# Set up request logging to see facilitator crawler requests
tail -f /var/log/nginx/access.log | grep "facilitator"
```

## Getting Help

### 1. Gather Debug Information

When reporting discovery issues, include:

```bash
# Your discovery document
curl -s "https://your-domain.com/.well-known/x402"

# Sample 402 response  
curl -s "https://your-domain.com/api/endpoint"

# Facilitator discovery query results
curl -s "https://api.cdp.coinbase.com/platform/v2/x402/discovery/resources" | \
  jq '.items | length'
```

### 2. Report Issues

- **GitHub**: [coinbase/x402 issues](https://github.com/coinbase/x402/issues)
- **Discord**: #x402 channel in [CDP Discord](https://discord.com/invite/cdp)

Include:
- Domain and endpoint URLs
- Number of successful payments
- How long since first payment
- Discovery document accessibility
- 402 response samples

### 3. Expected Response Times

- **GitHub Issues**: 24-48 hours for technical issues
- **Discord**: Real-time community help
- **Critical Discovery Outages**: Use GitHub with `bug` label

## Known Issues

### CDP Facilitator Discovery Lag

**Issue**: CDP facilitator discovery indexing can lag 24-72 hours behind actual payments.

**Workaround**: Use PayAI facilitator for faster indexing or wait longer for CDP indexing.

**Status**: Being investigated by CDP team.

### PayAI Facilitator Schema Validation

**Issue**: PayAI facilitator may reject endpoints with complex nested schemas.

**Workaround**: Simplify `outputSchema` structure or use CDP facilitator.

**Status**: Fix in progress.

## Prevention

### 1. Pre-deployment Testing

Before deploying to production:

```bash
# Test discovery document
curl -s "https://staging.your-domain.com/.well-known/x402" | jq .

# Test 402 responses include bazaar extensions
curl -s "https://staging.your-domain.com/api/endpoint" | \
  jq '.extensions.bazaar'

# Validate payment flow works
```

### 2. Monitoring

Set up monitoring for discovery presence:

```javascript
// Check if your service appears in discovery
const response = await facilitator.listResources();
const isListed = response.items.some(item => 
  item.resource.includes('your-domain.com')
);

if (!isListed) {
  // Alert ops team
}
```

### 3. Multiple Facilitators

Support multiple facilitators for redundancy:

```typescript
const facilitators = [
  "https://api.cdp.coinbase.com/platform/v2/x402",
  "https://facilitator.payai.network"
];
```

---

This troubleshooting guide covers the most common Bazaar discovery issues. For specific problems not covered here, please open an issue with detailed debug information.