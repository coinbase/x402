# Bazaar Discovery Debug Utilities

This module provides debugging utilities to help diagnose discovery refresh issues like those described in [issue #1659](https://github.com/coinbase/x402/issues/1659).

## Common Issues

- Discovery resource metadata not refreshing after seller updates
- Stale canonical resource URLs in discovery responses  
- Missing route information in bazaar search results
- Resources appearing unresponsive in discovery but working directly

## Quick Usage

```typescript
import { debugDiscoveryRefresh, withBazaar } from "@x402/extensions/bazaar";
import { HTTPFacilitatorClient } from "@x402/core/http";

// Set up facilitator client
const client = withBazaar(new HTTPFacilitatorClient({
  url: "https://api.cdp.coinbase.com/platform/v2/x402"
}));

// Debug a specific resource
const result = await debugDiscoveryRefresh(client, {
  resourceUrl: "https://restricted-party-screen.vercel.app/api/ofac-sanctions-screening/SBERBANK",
  checkLive: true,
  timeoutMs: 10000
});

console.log(result.report);
console.log("Issues:", result.issues);
console.log("Recommendations:", result.recommendations);
```

## Advanced Usage

```typescript
import { DiscoveryDebugClient, withBazaar } from "@x402/extensions/bazaar";

const client = withBazaar(new HTTPFacilitatorClient({ /* config */ }));
const debugClient = new DiscoveryDebugClient(client);

// Take multiple snapshots over time to track changes
const snapshot1 = await debugClient.takeSnapshot(
  { type: "http", limit: 50 },
  { checkLiveStatus: true, detectStaleness: true }
);

// Wait some time...
await new Promise(resolve => setTimeout(resolve, 60000));

const snapshot2 = await debugClient.takeSnapshot(
  { type: "http", limit: 50 },
  { checkLiveStatus: true, detectStaleness: true }
);

// Compare snapshots to detect changes
for (const resource of snapshot1) {
  const key = `${resource.resource.type}:${resource.resource.resource}`;
  const newer = snapshot2.find(s => 
    `${s.resource.type}:${s.resource.resource}` === key
  );
  
  if (newer) {
    const comparison = debugClient.compareSnapshots(resource, newer);
    if (!comparison.isIdentical || comparison.possibleStaleCache) {
      console.log(`${key}: ${comparison.summary}`);
    }
  }
}

// Generate comprehensive report
console.log(debugClient.generateReport());
```

## Detecting Specific Issues

### Stale Discovery Metadata

```typescript
// This will flag resources where discovery metadata appears stale
const result = await debugDiscoveryRefresh(client, {
  filters: { type: "http" },
  checkLive: true
});

const staleResources = result.snapshots.filter(s => s.debug?.isStale);
console.log(`Found ${staleResources.length} potentially stale resources`);
```

### Unresponsive Resources

```typescript
const result = await debugDiscoveryRefresh(client, {
  checkLive: true,
  timeoutMs: 5000
});

const unresponsive = result.snapshots.filter(s => s.debug?.isLive === false);
console.log(`Found ${unresponsive.length} unresponsive resources`);
```

### Route Changes Not Reflected in Discovery

```typescript
const debugClient = new DiscoveryDebugClient(client);

// Analyze a specific resource that recently changed its routes
const analysis = await debugClient.analyzeResource(
  "https://restricted-party-screen.vercel.app/api/ofac-sanctions-screening/SBERBANK",
  { checkLiveStatus: true, detectStaleness: true }
);

console.log("Issues found:", analysis.issues);
console.log("Recommendations:", analysis.recommendations);
```

## Integration with Issue #1659

The utilities in this module are specifically designed to help debug the issue described in [#1659](https://github.com/coinbase/x402/issues/1659):

> `restricted-party-screen.vercel.app` now serves an updated primary x402 route, but CDP discovery still returns only the older pre-deploy resource.

```typescript
// Check if discovery reflects the latest route changes
const result = await debugDiscoveryRefresh(client, {
  resourceUrl: "https://restricted-party-screen.vercel.app/api/ofac-sanctions-screening/SBERBANK",
  checkLive: true
});

// Look for staleness indicators
if (result.issues.some(issue => issue.includes("stale"))) {
  console.log("⚠️  Discovery metadata appears stale");
  console.log("The seller may have updated routes but discovery hasn't refreshed");
}

// Check if the resource is live but discovery shows old info  
const snapshot = result.snapshots[0];
if (snapshot?.debug?.isLive && snapshot?.debug?.isStale) {
  console.log("🔍 Live seller detected with stale discovery metadata");
  console.log("Contact facilitator support for cache refresh");
}
```

## What the Debugging Shows

1. **Live Status**: Whether the resource actually responds to requests
2. **Response Time**: How quickly the resource responds (performance indicator)
3. **Staleness Detection**: Heuristics to identify potentially outdated discovery metadata
4. **Change Tracking**: History of how discovery metadata changes over time
5. **Cache Issues**: Patterns that suggest discovery caching problems

## Common Patterns to Look For

- Resource is live but discovery shows very old `lastUpdated` timestamp
- Discovery metadata doesn't change even after seller redeploys
- Live requests succeed but discovery search doesn't find the resource
- Response times are good but discovery metadata suggests the resource is problematic

## Limitations

- Staleness detection uses heuristics and may not catch all cases
- Live status checking only does basic health checks (HEAD requests)
- Cannot directly detect route changes without access to seller's internal state
- Depends on facilitator's discovery API being accessible

## Contributing

These utilities are designed to be extended. Common enhancements might include:

- More sophisticated staleness detection
- Integration with seller health check endpoints  
- Automatic retry and recovery suggestions
- Historical trending analysis
- Integration with facilitator admin APIs for cache invalidation