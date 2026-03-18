# Debugging Discovery Refresh Issues

This guide helps diagnose and resolve issues where the x402 bazaar discovery system doesn't properly refresh seller metadata after route updates.

## Background

The x402 discovery system allows facilitators to automatically catalog x402-enabled resources. However, issues can occur where:

1. **Stale metadata** - Discovery returns old route information after a seller has deployed updates
2. **Missing routes** - New primary routes aren't properly indexed
3. **Search failures** - Updated services don't appear in bazaar searches due to outdated metadata

**Related Issue**: [#1659 - Bazaar discovery does not refresh seller metadata after route update](https://github.com/coinbase/x402/issues/1659)

## Common Symptoms

### Symptom 1: Discovery Returns Old Route
```bash
# Seller deployed new primary route
https://my-api.com/v2/endpoint

# But discovery still returns old route  
https://my-api.com/v1/endpoint

# Even after successful paid requests on the new route
```

### Symptom 2: Bazaar Search Misses Updated Services
```bash
# Search for obvious keywords fails to find the service
npx awal@latest x402 bazaar search "my service keywords" --json
# Returns: [] (empty results)

# But the service is live and accepting payments
```

### Symptom 3: Stale lastUpdated Timestamps
```bash
# Discovery shows very old update timestamp
"lastUpdated": "2026-03-17T11:28:45.667Z"

# But live paid requests were made hours/days later
```

## Debug Tools

### CLI Debug Utility

Use the command-line debug tool to analyze discovery refresh issues:

```bash
# Navigate to the x402 typescript directory
cd typescript/packages/extensions

# Debug a specific resource
npx tsx src/bazaar/cli-debug.ts \
  https://api.cdp.coinbase.com/platform/v2/x402 \
  https://my-api.com/endpoint

# Example output:
🔍 Debugging discovery refresh for: https://my-api.com/endpoint
📡 Using facilitator: https://api.cdp.coinbase.com/platform/v2/x402

=== Discovery Refresh Analysis ===
Resource: https://my-api.com/endpoint
Last Updated: 2026-03-17T11:28:45.667Z (7234s ago)
Metadata Keys: category, version

⚠️ WARNING: 1 issue(s) found

Issues:
  • Resource is stale: last updated 120 minutes ago

Recommendations:
  • Check if the seller has redeployed and discovery needs to refresh
```

### Programmatic Debugging

Use the debug utilities in your own scripts:

```typescript
import { debugDiscoveryRefresh, formatAnalysisResults } from '@x402/extensions/bazaar';
import { HTTPFacilitatorClient } from '@x402/core/http';

const client = new HTTPFacilitatorClient("https://api.cdp.coinbase.com/platform/v2/x402");

// Debug a specific resource
const result = await debugDiscoveryRefresh(
  client, 
  "https://my-api.com/endpoint"
);

if (result.found && result.analysis) {
  console.log(formatAnalysisResults(result.analysis));
  
  if (result.analysis.severity !== 'none') {
    // Resource has issues - investigate further
  }
} else {
  console.error("Resource not found in discovery:", result.error);
}
```

### URL Canonicalization

The discovery system canonicalizes URLs by removing query parameters and fragments. Use the canonicalization utility to understand how URLs are processed:

```typescript
import { canonicalizeUrl } from '@x402/extensions/bazaar';

// These URLs all canonicalize to the same discovery key
canonicalizeUrl("https://api.com/search?q=test&limit=10");
canonicalizeUrl("https://api.com/search#section");
canonicalizeUrl("https://api.com/search?q=test#section");
// All return: "https://api.com/search"
```

## Troubleshooting Steps

### 1. Verify Resource is Live
First, confirm your resource is properly deployed and accepting payments:

```bash
# Test the new route directly
npx awal@latest x402 details "https://my-api.com/new-endpoint" --json

# Make a test payment
npx awal@latest x402 pay "https://my-api.com/new-endpoint" --params '{"query":"test"}'
```

### 2. Check Discovery Status
Use the debug tool to analyze the current discovery state:

```bash
npx tsx src/bazaar/cli-debug.ts \
  https://api.cdp.coinbase.com/platform/v2/x402 \
  https://my-api.com/new-endpoint
```

**Look for**:
- ❌ **"Resource not found"** - The new route isn't indexed yet
- ⚠️ **"Resource is stale"** - Discovery has old metadata
- ❌ **"Canonical URL mismatch"** - Discovery has a different route

### 3. Compare Expected vs Actual Metadata
If discovery finds your resource but metadata is wrong:

```typescript
import { debugDiscoveryRefresh } from '@x402/extensions/bazaar';

// Include expected metadata for comparison
const result = await debugDiscoveryRefresh(client, resourceUrl, {
  description: "My updated service description",
  category: "new_category",
  primaryRoute: "/v2/endpoint"
});

// The analysis will highlight metadata mismatches
```

### 4. Check Route Advertising
Verify your seller is properly advertising the new primary route:

```bash
# Check MCP/health catalog endpoint
curl "https://my-api.com/.well-known/agent-services.json"

# Check if new route is listed first
curl "https://my-api.com/api/health" | jq '.routes'
```

### 5. Force Discovery Refresh
Some facilitators support manual discovery refresh. Try making a paid request on the new route to trigger re-indexing:

```bash
# Make a live paid request on the new canonical route
npx awal@latest x402 pay "https://my-api.com/new-endpoint" \
  --params '{"test": "refresh"}' \
  --network base
```

## Resolution Patterns

### Pattern 1: Route Migration
When migrating from an old route to a new route:

1. **Deploy new route** with updated discovery metadata
2. **Make test payments** on the new route to trigger discovery
3. **Wait for refresh** (varies by facilitator, typically 15-60 minutes)
4. **Verify with debug tool** that discovery updated
5. **Update client configurations** to use new route
6. **Deprecate old route** after confirming discovery migration

### Pattern 2: Metadata Updates
When updating service metadata (description, category, pricing):

1. **Update discovery extensions** in your PaymentRequired responses
2. **Redeploy service** with new metadata
3. **Trigger discovery refresh** via test payment
4. **Verify metadata** with debug tool
5. **Test bazaar search** to confirm discoverability

### Pattern 3: Multiple Route Support
When adding new routes while keeping old ones:

1. **Ensure primary route** (first in MCP catalog) is the new one
2. **Include discovery extensions** on all routes
3. **Use consistent metadata** across routes
4. **Test canonicalization** to understand which route discovery indexes
5. **Monitor for split discovery** (multiple discovery entries)

## Best Practices

### For Service Developers

1. **Implement health endpoints** that show current route priorities
2. **Use discovery extensions** on all x402 routes
3. **Test discovery** after each deployment
4. **Monitor discovery freshness** in production
5. **Document expected discovery behavior** for your service

### For Facilitator Operators

1. **Implement discovery refresh triggers** on successful payments
2. **Monitor discovery freshness** and alert on stale resources
3. **Support manual refresh endpoints** for emergency updates
4. **Log discovery update decisions** for debugging
5. **Provide debug tools** for service developers

## Example Debug Session

Here's a complete example of debugging the issue from [#1659](https://github.com/coinbase/x402/issues/1659):

```bash
# 1. Test the live new route
npx awal@latest x402 details \
  "https://restricted-party-screen.vercel.app/api/ofac-sanctions-screening/SBERBANK" \
  --json

# 2. Debug discovery status  
npx tsx src/bazaar/cli-debug.ts \
  https://api.cdp.coinbase.com/platform/v2/x402 \
  https://restricted-party-screen.vercel.app/api/ofac-sanctions-screening/SBERBANK

# Expected issues:
# ❌ ERROR: Canonical URL mismatch: discovery has 
#     'https://restricted-party-screen.vercel.app/api/restricted-party/screen/SBERBANK', 
#     expected 'https://restricted-party-screen.vercel.app/api/ofac-sanctions-screening/SBERBANK'

# 3. Test bazaar search
npx awal@latest x402 bazaar search "ofac sanctions screening" --json

# Should return the service but might not due to stale metadata

# 4. Make a fresh payment to trigger refresh
npx awal@latest x402 pay \
  "https://restricted-party-screen.vercel.app/api/ofac-sanctions-screening/SBERBANK?minScore=90&limit=5" \
  --network base

# 5. Wait and recheck discovery (may take 15-60 minutes)
```

## Getting Help

1. **File issues** with specific debug tool output: [GitHub Issues](https://github.com/coinbase/x402/issues)
2. **Include discovery analysis** when reporting discovery problems
3. **Share facilitator logs** if you operate a facilitator
4. **Test with debug utilities** before filing issues
5. **Provide reproduction steps** with specific URLs and timestamps

## Contributing

The debug utilities are implemented in:
- `typescript/packages/extensions/src/bazaar/debug.ts` - Core debug logic
- `typescript/packages/extensions/src/bazaar/cli-debug.ts` - CLI interface  
- `typescript/packages/extensions/test/bazaar.debug.test.ts` - Test coverage

To improve the debug tools:
1. Add new analysis patterns to `analyzeDiscoveryRefresh()`
2. Extend formatting in `formatAnalysisResults()`  
3. Add CLI options to `cli-debug.ts`
4. Write tests for new functionality