---
"@x402/core": patch
---

Registered client extensions now always receive `enrichPaymentPayload`, regardless of whether the resource server advertised the extension key in `PaymentRequired.extensions`. Server declarations continue to govern field preservation via merge and echo validation. Extensions that require a server declaration must no-op internally when the server did not advertise them.
