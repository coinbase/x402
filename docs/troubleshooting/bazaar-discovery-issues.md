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

**Real-world example:** The convrgent.ai team reported this exact issue in GitHub issue #1461 - 19 successful payments through CDP facilitator, perfect 402 responses, but zero endpoints appearing in discovery after several days.

**Diagnosis:**
This indicates an indexing pipeline issue rather than configuration problem.

**Solutions:**

#### A. Wait for Extended Indexing Delay
**CDP Facilitator:** Indexing can take 3-7 days, not 24-48 hours as initially expected. The discovery pipeline appears to batch process endpoints weekly.

**PayAI Facilitator:** Typically indexes within 6-12 hours of first successful payment.

```bash
# Monitor discovery count over time
echo "$(date): $(curl -s 'https://api.cdp.coinbase.com/platform/v2/x402/discovery/resources' | jq '.items | length') total resources"
```

#### B. Validate Exact Field Requirements

The CDP facilitator has stricter validation than the specification. Ensure all fields match working examples:

```bash
# Check a known working endpoint's exact format
curl -s "https://api.chatgpt.com/v1/chat/completions" -H "Accept: application/vnd.x402+json" | \
  jq '.accepts[0] | {discoverable, description, mimeType, resource, outputSchema}'

# Compare with your endpoint
curl -s "https://your-domain.com/api/endpoint" -H "Accept: application/vnd.x402+json" | \
  jq '.accepts[0] | {discoverable, description, mimeType, resource, outputSchema}'
```

#### C. Try Alternative Facilitators
Different facilitators maintain separate discovery indexes:

```javascript
// Test with PayAI facilitator instead of CDP
const facilitatorClient = new HTTPFacilitatorClient({
  url: "https://facilitator.payai.network"
});
```

#### D. Verify Complete Payment Settlement
Ensure payments are fully settled, not just verified:

```bash
# Check that transactions appear on-chain
# For Base mainnet (CDP facilitator)
curl -s "https://api.basescan.org/api?module=account&action=txlist&address=YOUR_PAYTO_ADDRESS&startblock=0&endblock=99999999&sort=desc&apikey=YourApiKey" | \
  jq '.result[:5]'
```

#### E. Contact Facilitator Support
If waiting 7+ days with perfect configuration:

**CDP Facilitator:**
- File GitHub issue with `discovery` label
- Include: domain, successful payment count, sample 402 response
- Reference issue #1461 for similar cases

**PayAI Facilitator:**
- Discord: #facilitator-support
- Email: support@payai.network

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

## Specific Issue Patterns

### CDP Facilitator Discovery Pipeline Issues

Based on reports like issue #1461, several patterns have emerged with CDP facilitator discovery:

#### Pattern: Extended Indexing Delay
**Timeline observed:**
- Days 1-3: Zero endpoints appear despite successful payments
- Days 4-7: Some endpoints may appear in search but not in full listing
- Days 8-14: Full indexing typically completes

**Debugging steps:**
```bash
# 1. Confirm your endpoints aren't indexed at all
DOMAIN="your-domain.com"
curl -s "https://api.cdp.coinbase.com/platform/v2/x402/discovery/resources" | \
  jq --arg domain "$DOMAIN" '.items[] | select(.resource | contains($domain))'

# 2. Check if search finds your endpoints even if listing doesn't
curl -s "https://api.cdp.coinbase.com/platform/v2/x402/discovery/resources?search=your-keyword" | \
  jq --arg domain "$DOMAIN" '.items[] | select(.resource | contains($domain))'

# 3. Monitor the total resource count for changes
curl -s "https://api.cdp.coinbase.com/platform/v2/x402/discovery/resources" | \
  jq '.items | length'
# If count hasn't changed in days, indexing may be paused
```

#### Pattern: Selective Endpoint Indexing
Some endpoints from the same domain appear while others don't:

**Debugging approach:**
```bash
# Compare 402 responses between indexed and non-indexed endpoints
diff -u <(curl -s "https://your-domain.com/working-endpoint" | jq '.accepts[0]') \
        <(curl -s "https://your-domain.com/missing-endpoint" | jq '.accepts[0]')

# Look for subtle differences in:
# - outputSchema complexity
# - description content (some keywords may be filtered)
# - exact field formatting
```

#### Pattern: Domain Allowlist Issues
New domains may require manual approval:

**Indicators:**
- Well-established services appear immediately
- New domains never appear regardless of configuration

**Solutions:**
- Contact CDP support with domain verification
- Reference successful payments as proof of legitimacy
- Consider subdomain strategy if main domain is blocked

### Next.js App Router Specific Issues

For Next.js implementations like the convrgent.ai case:

```typescript
// Ensure middleware correctly wraps x402 responses
export async function middleware(request: NextRequest) {
  // This can cause discovery issues if incorrect
  if (request.headers.get('accept')?.includes('application/vnd.x402+json')) {
    // Must include exact bazaar metadata structure
    return new Response(JSON.stringify({
      x402Version: 2,
      resource: {
        url: request.url,
        description: "...", // Must match accepts[0].description exactly
        mimeType: "application/json"
      },
      accepts: [{
        // ... exact format from working examples
      }],
      extensions: {
        bazaar: {
          // Must be present and valid
        }
      }
    }), {
      status: 402,
      headers: { 'Content-Type': 'application/vnd.x402+json' }
    });
  }
}
```

### Validation Commands

**Complete validation checklist:**
```bash
ENDPOINT="https://your-domain.com/api/endpoint"

# 1. Basic 402 response structure
curl -s "$ENDPOINT" -H "Accept: application/vnd.x402+json" | \
  jq 'has("x402Version") and has("accepts") and has("extensions")'

# 2. Required bazaar fields present
curl -s "$ENDPOINT" -H "Accept: application/vnd.x402+json" | \
  jq '.accepts[0] | has("discoverable") and has("description") and has("outputSchema")'

# 3. Discovery document accessibility
curl -s "https://your-domain.com/.well-known/x402" | jq -e .

# 4. Payment flow validation
# Replace with actual payment test using x402 client

# 5. Compare with known working endpoint
WORKING="https://api.chatgpt.com/v1/chat/completions"
diff -u <(curl -s "$WORKING" -H "Accept: application/vnd.x402+json" | jq '.accepts[0] | keys | sort') \
        <(curl -s "$ENDPOINT" -H "Accept: application/vnd.x402+json" | jq '.accepts[0] | keys | sort')
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

## Reporting Issues

### Based on Issue #1461: Complete Debug Report

When reporting discovery issues similar to #1461, provide this complete information:

```bash
# 1. Service details
echo "Domain: your-domain.com"
echo "Endpoints: $(curl -s 'https://your-domain.com/.well-known/x402' | jq '.resources | length')"
echo "Discovery document: https://your-domain.com/.well-known/x402"

# 2. Payment verification
echo "Successful payments: [count from your logs]"
echo "Facilitator: CDP (api.cdp.coinbase.com)"
echo "Network: eip155:8453 (Base mainnet)"
echo "Token: USDC (0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913)"

# 3. Configuration verification
curl -s "https://your-domain.com/api/sample-endpoint" -H "Accept: application/vnd.x402+json" | \
  jq '{
    x402Version,
    resource: .resource,
    accepts: .accepts[0] | {
      discoverable,
      description,
      mimeType,
      resource,
      outputSchema: (.outputSchema != null)
    },
    extensions: {
      bazaar: (.extensions.bazaar != null)
    }
  }'

# 4. Discovery status check
TOTAL_RESOURCES=$(curl -s "https://api.cdp.coinbase.com/platform/v2/x402/discovery/resources" | jq '.items | length')
YOUR_RESOURCES=$(curl -s "https://api.cdp.coinbase.com/platform/v2/x402/discovery/resources" | jq --arg domain "your-domain.com" '.items[] | select(.resource | contains($domain))' | wc -l)
echo "Total CDP resources: $TOTAL_RESOURCES"
echo "Your resources found: $YOUR_RESOURCES"

# 5. Timeline
echo "First successful payment: [date]"
echo "Issue report date: $(date)"
echo "Days elapsed: [calculate difference]"
```

### Template for GitHub Issues

```markdown
## Bazaar Discovery Issue

**Domain:** your-domain.com  
**Endpoints:** 14 x402-gated APIs  
**First payment:** YYYY-MM-DD  
**Days elapsed:** XX days  

### Configuration Status ✅
- [x] All payments succeeding through CDP facilitator
- [x] `discoverable: true` in accepts[0]
- [x] Complete `outputSchema` present
- [x] `extensions.bazaar` metadata included
- [x] Discovery document accessible at `/.well-known/x402`

### Debug Information
**Total successful payments:** 19  
**Facilitator:** CDP (`api.cdp.coinbase.com`)  
**Network:** Base mainnet (eip155:8453)  
**Payment token:** USDC  

**Sample 402 response:**
```json
{
  "x402Version": 2,
  "accepts": [{
    "discoverable": true,
    "description": "Clear description of service",
    "outputSchema": { "valid": "schema" }
  }],
  "extensions": {
    "bazaar": { "info": "present" }
  }
}
```

**Discovery status:**
- CDP total resources: ~13,619 (unchanged for X days)
- Our resources found: 0
- Search results: 0 matches for domain/keywords

### Similar Cases
This appears identical to issue #1180 (fatihai.app) - working payments but missing from discovery.
```

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

### CDP Facilitator Discovery Lag (Critical)

**Issue**: CDP facilitator discovery indexing experiencing severe delays of 7-14 days, not the documented 24-48 hours.

**Evidence**: 
- Issue #1461: convrgent.ai with 19 successful payments, perfect configuration, no discovery after 5+ days
- Issue #1180: fatihai.app similar pattern  
- Multiple Discord reports of same issue since February 2026

**Current Timeline Observed:**
- Days 1-7: Zero indexing despite working payments
- Days 8-14: Gradual appearance of some endpoints
- Total resource count in CDP discovery API unchanged for weeks

**Workarounds**: 
1. Use PayAI facilitator for reliable 6-12 hour indexing
2. Support multiple facilitators for redundancy
3. Be prepared to wait 2+ weeks for CDP indexing

**Status**: Critical issue under investigation by CDP team. Consider this a known limitation rather than configuration problem.

### PayAI Facilitator Schema Validation

**Issue**: PayAI facilitator may reject endpoints with complex nested schemas in `outputSchema`.

**Workaround**: Simplify `outputSchema` structure or use CDP facilitator (if willing to wait for indexing).

**Status**: Fix in progress.

### Next.js App Router Middleware Compatibility

**Issue**: Next.js middleware implementations may not properly format bazaar extensions.

**Symptoms**: Endpoints work with direct payment but discovery metadata malformed.

**Solution**: Ensure middleware returns exact same format as working examples.

**Status**: Documentation improvement needed for Next.js specific patterns.

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