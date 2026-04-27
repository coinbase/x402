---
'@x402/core': patch
---

Add comprehensive unit tests for `extensionResponsePolicy`: covers `snapshotPaymentRequirementsList` isolation, `snapshotSettleResponseCore` field capture, accepts-length mismatch rejection, `network`/`maxTimeoutSeconds` immutability, non-vacant `payTo`/`asset` mutation rejection, and all `assertSettleResponseCoreUnchanged` core fields. Grows suite from 11 to 31 tests.
