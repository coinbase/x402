---
"@x402/core": patch
---

Add comprehensive test coverage for findFacilitatorBySchemeAndNetwork utility function

This changeset adds 8 new test cases that provide comprehensive coverage for the previously untested `findFacilitatorBySchemeAndNetwork` utility function. The tests cover:

- Exact network matching
- Pattern matching with wildcards  
- Error conditions (unknown schemes, no matches)
- Complex object facilitators
- Multiple networks in sets
- Empty networks with pattern fallback

All existing tests continue to pass and the new tests verify the function works correctly across various scenarios.