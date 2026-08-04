---
"@x402/extensions": patch
---

Hardened `validateDiscoveryExtension` against a server-side request forgery (SSRF) / local file disclosure vulnerability (CWE-918) in the Bazaar discovery extension: `schema` arrives in the client's payment payload, and JSON Schema validators generally resolve `$ref`/`$id` values that aren't same-document fragments by fetching them over HTTP(S) or reading them from disk. Ajv's synchronous `compile()` already throws instead of dereferencing such values, but `validateDiscoveryExtension` now explicitly rejects a `schema` containing a `$ref`/`$id` that is not a `#`-prefixed JSON Pointer fragment before compiling it, matching the equivalent Go and Python facilitator fixes.
