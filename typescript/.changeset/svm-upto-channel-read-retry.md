---
'@x402/svm': patch
---

Retry confirmed SVM `upto` channel reads when a freshly opened account is temporarily missing
from an RPC replica, while continuing to reject existing channels with invalid state immediately.
