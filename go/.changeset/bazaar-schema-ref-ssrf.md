---
'github.com/x402-foundation/x402/go': patch
---

Fixed a server-side request forgery (SSRF) / local file disclosure vulnerability (CWE-918) in the Bazaar discovery extension facilitator: `schema` arrives in the client's payment payload, and the underlying `gojsonschema` validator resolves any `$ref`/`$id` value that isn't a same-document fragment by fetching it over HTTP(S) or reading it from disk. `ValidateDiscoveryExtension` now rejects a `schema` containing a `$ref`/`$id` that is not a `#`-prefixed JSON Pointer fragment before validation runs.
