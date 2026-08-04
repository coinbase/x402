---
"@x402/extensions": minor
"@x402/core": minor
---

`builder-code` `s` entries now use dedicated, non-overlapping reservations per party instead of one shared cap: `MAX_CLIENT_SERVICE_CODES` (5) for `BuilderCodeClientExtension`, `MAX_SERVER_SERVICE_CODES` (5) for `declareBuilderCodeExtension`, and a new `MAX_FACILITATOR_SERVICE_CODES` (1) reservation for `BuilderCodeFacilitatorExtension`'s new `serviceCode` config option. `MAX_SERVICE_CODES` is now the sum of the three (11) and is enforced by the facilitator as a defensive backstop, so a compliant client and server can no longer have their entries silently dropped by each other. The resource server's extension echo validation also now rejects a client echo whose `s` exceeds the combined client+server budget outright, instead of accepting it and leaving truncation to the facilitator.
