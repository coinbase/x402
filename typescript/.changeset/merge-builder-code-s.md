---
"@x402/core": patch
---

Merge server and client builder-code `s` arrays during extension re-merge instead of dropping the client's (fully deduped, including duplicates within either side), and treat echoed builder-code `s` specifically as additive (client-first, with scalar/array coercion) in extension echo validation. Other extensions' array fields, and payment-requirements `extra` matching, are unaffected and continue to require exact array equality.
