---
"@x402/svm": minor
---

Add an optional facilitator-delegated receiver-authorizer mode to SVM `upto`. The facilitator may advertise `receiverAuthorizer` in `/supported`; a server that omits `receiverAuthorizerSigner` delegates voucher signing, and the facilitator signs after correlating the claim settle to the same authenticated caller that opened the channel.
