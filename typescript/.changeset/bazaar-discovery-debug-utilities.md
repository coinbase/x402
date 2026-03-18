---
'@x402/extensions': minor
---

Add comprehensive debugging utilities for Bazaar discovery refresh issues. Includes `DiscoveryDebugClient` for tracking discovery state changes over time, snapshot comparison tools to detect stale cache issues, and `debugDiscoveryRefresh` utility for quick diagnosis of discovery problems. Addresses issue #1659 where discovery metadata doesn't refresh after seller route updates.