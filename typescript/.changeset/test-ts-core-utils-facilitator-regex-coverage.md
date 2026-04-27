---
"@x402/core": patch
---

Add unit tests for `findFacilitatorBySchemeAndNetwork` (8 tests: exact match, missing scheme, missing network, pattern fallback, empty map, multi-scheme, set-priority-over-pattern, object facilitator) and `Base64EncodedRegex` (10 tests: no padding, single/double padding, empty string, full alphabet, JWT segment, illegal chars, too many padding chars). 18 new tests, zero prior coverage for both exports.
