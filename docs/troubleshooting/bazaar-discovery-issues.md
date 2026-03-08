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
- Payments work successfully (10+ successful transactions)
- Discovery document accessible
- Zero results in facilitator discovery API
- Several days to weeks have passed since first payment

**Diagnosis:**
This indicates an indexing pipeline issue rather than configuration problem. Based on reports from issue #1461 and similar cases, this appears to be a systemic issue with CDP facilitator indexing.

**Solutions:**

#### A. Extended Wait for CDP Indexing Delay
Discovery indexing has significantly longer delays than documented:

- **Documented**: 24-48 hours after first payment
- **Reality (as of March 2026)**: **7-14 days** for CDP facilitator indexing
- Some services report waiting **3+ weeks** with no indexing despite perfect configuration

**Check indexing status:**
```bash
# Check total discovery count over time to see if indexer is active
curl -s "https://api.cdp.coinbase.com/platform/v2/x402/discovery/resources" | jq '.totalCount'

# If this number isn't changing over days, indexer may be stalled
```

#### B. Detailed Configuration Verification for Extended Delays

If waiting 7-14+ days, re-verify configuration matches working examples exactly:

```bash
# Compare your 402 response to a known working endpoint
curl -s "https://your-domain.com/api/endpoint" > your-response.json
curl -s "https://tiamat.live/api/summarize" > working-response.json

# Check for any differences in required fields
diff <(jq -S '.accepts[0] | {discoverable, description, mimeType, resource, outputSchema}' your-response.json) \
     <(jq -S '.accepts[0] | {discoverable, description, mimeType, resource, outputSchema}' working-response.json)
```

**Critical Next.js App Router considerations:**
- Ensure middleware properly handles OPTIONS requests
- Verify 402 responses have correct CORS headers
- Test that discovery endpoint returns proper Content-Type

```typescript
// Next.js App Router - ensure proper headers
export async function GET(request: Request) {
  return new Response(JSON.stringify(discoveryDoc), {
    headers: {
      'Content-Type': 'application/json',
      'Access-Control-Allow-Origin': '*',
    }
  });
}
```

#### C. Try Alternative Facilitators
Different facilitators maintain separate discovery indexes with different performance characteristics:

```javascript
// Test with PayAI facilitator (typically faster indexing)
const facilitatorClient = new HTTPFacilitatorClient({
  url: "https://facilitator.payai.network"
});

// Or try self-hosted facilitator for immediate indexing
const facilitatorClient = new HTTPFacilitatorClient({
  url: "https://your-facilitator.com"
});
```

#### D. Escalation for Indexing Issues

If 14+ days pass with perfect configuration and no indexing:

**1. Report as critical infrastructure issue:**
```bash
# Create GitHub issue with this exact title format:
# "Critical: CDP Discovery Indexer not processing domain.com after X successful payments over Y days"

# Include this debug data:
echo "Domain: $(curl -s https://your-domain.com/.well-known/x402 | jq -r '.domain // "your-domain.com"')"
echo "Discovery accessible: $(curl -s -o /dev/null -w "%{http_code}" https://your-domain.com/.well-known/x402)"
echo "Total payments: X successful over Y days"
echo "CDP discovery total: $(curl -s https://api.cdp.coinbase.com/platform/v2/x402/discovery/resources | jq -r '.totalCount')"
```

**2. CDP support channel escalation:**
- Discord: @mention CDP team in #x402 channel
- Include: domain, payment count, days waited, exact issue #1461 reference

**3. Request manual indexing trigger:**
Some cases require manual intervention from CDP team to trigger indexing pipeline.

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

**Complete issue template (based on #1461 format):**

```markdown
## Problem

Endpoints not appearing in Bazaar discovery despite correct metadata and successful payments

## Setup

- **SDK versions**: @x402/core@X.Y.Z, @x402/evm@X.Y.Z, @x402/extensions@X.Y.Z
- **Facilitator**: CDP (`api.cdp.coinbase.com`) or PayAI (`facilitator.payai.network`)
- **Network**: Base mainnet (`eip155:8453`) / Solana / etc.
- **Server**: Framework (Next.js App Router / Express / etc.)
- **Domain**: your-domain.com

## What we did

1. Built N x402-gated API endpoints
2. Added `bazaarResourceServerExtension` to x402ResourceServer
3. Created `declareDiscoveryExtension()` metadata for each endpoint  
4. Added required fields to `accepts[0]`: discoverable, description, mimeType, resource, outputSchema
5. Included `extensions.bazaar` in 402 responses
6. Completed N successful payments through facilitator (verified + settled)

## Verification

```bash
# Discovery document accessible
curl -s "https://your-domain.com/.well-known/x402" | jq .

# Sample 402 response with all required fields
curl -s "https://your-domain.com/api/endpoint" | jq '{accepts: .accepts, extensions: .extensions}'

# Zero results in facilitator discovery
curl -s "https://api.cdp.coinbase.com/platform/v2/x402/discovery/resources" | jq '.items[] | select(.resource | contains("your-domain.com"))'
```

## Timeline

- First payment: YYYY-MM-DD
- Days waited: X days since first payment
- Total successful payments: N payments over X days
- Discovery status: Not indexed

## Similar Reports

Reference issue #1461 (Convrgent) and any other similar reports
```

### 3. Expected Response Times

- **GitHub Issues**: 24-48 hours for technical issues
- **Discord**: Real-time community help
- **Critical Discovery Outages**: Use GitHub with `bug` label

## Known Issues

### Critical: CDP Facilitator Discovery Indexing Delays (March 2026)

**Issue**: CDP facilitator discovery indexing has severe delays far exceeding documentation:

- **Documented timeline**: 24-48 hours after first payment
- **Actual timeline**: 7-14 days minimum, some reports of 3+ weeks
- **Affected services**: Multiple confirmed cases (#1461 Convrgent, #1180 Fatihai, others)
- **Perfect configuration**: All affected services have correct metadata and successful payments

**Root cause**: Indexing pipeline appears to be stalled or severely backlogged

**Evidence:**
- Discovery total count not increasing over time
- Zero indexing despite perfect configuration
- Manual verification shows all requirements met

**Workarounds:**
1. Use PayAI facilitator for faster indexing (typically 1-2 days)
2. Escalate to CDP team for manual indexing trigger
3. Reference issue #1461 when reporting similar problems

**Status**: 🚨 **Critical infrastructure issue** - CDP team investigating indexing pipeline

### Next.js App Router Discovery Issues

**Issue**: Some Next.js App Router implementations fail discovery due to middleware interactions.

**Symptoms**: 
- Discovery document returns 200 but content-type issues
- OPTIONS requests not handled properly 
- CORS headers missing from discovery responses

**Solution**: Ensure proper headers in app/api routes:

```typescript
export async function GET() {
  return new Response(JSON.stringify(discoveryDoc), {
    headers: {
      'Content-Type': 'application/json',
      'Access-Control-Allow-Origin': '*',
    }
  });
}
```

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