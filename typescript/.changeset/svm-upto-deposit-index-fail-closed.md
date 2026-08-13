---
'@x402/svm': patch
---

Fail SVM `upto` deposit settlement before broadcast when the pre-broadcast channel index write fails, so rent cleanup can never lose track of an open channel.
