---
"@x402/extensions": minor
---

Add debugging utilities for Bazaar discovery refresh issues

Adds comprehensive debugging tools to help diagnose and resolve issues where the x402 bazaar discovery system doesn't properly refresh seller metadata after route updates.

**New utilities:**
- `canonicalizeUrl()` - Canonicalizes URLs by removing query parameters and fragments
- `analyzeDiscoveryRefresh()` - Analyzes discovery resources for staleness and other issues
- `debugDiscoveryRefresh()` - Full debugging workflow for facilitator resources
- `formatAnalysisResults()` - Console-friendly formatting of analysis results
- `cliDebugDiscovery()` - CLI interface for debugging (for `cli-debug.ts`)

**Key features:**
- Detects stale discovery metadata (1+ hours old)
- Identifies extremely stale resources (24+ hours old)  
- Finds canonical URL mismatches between discovery and expected routes
- Validates URL canonicalization (no query params/fragments stored)
- Checks for empty/incomplete metadata
- Provides specific recommendations for each issue type

**Addresses GitHub issue #1659** - "Bazaar discovery does not refresh seller metadata after route update"

**Usage:**
```typescript
import { debugDiscoveryRefresh } from '@x402/extensions/bazaar';
const result = await debugDiscoveryRefresh(client, "https://my-api.com/endpoint");
if (result.found && result.analysis) {
  console.log(formatAnalysisResults(result.analysis));
}
```

**CLI usage:**
```bash
npx tsx src/bazaar/cli-debug.ts https://facilitator-url https://resource-url
```

Includes comprehensive test coverage and documentation in `docs/debugging-discovery-refresh.md`.