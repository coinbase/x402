# Scheme: `exact`

## Summary

`exact` is a scheme that transfers a specific amount of funds from a client to a resource server. The resource server must know in advance the exact
amount of funds they need to be transferred.

## Example Use Cases

- Paying to view an article
- Purchasing digital credits
- An LLM paying to use a tool

## Appendix

## Critical Validation Requirements

While implementation details vary by network, facilitators MUST enforce security constraints that prevent sponsorship abuse. Examples include:

### SVM

- Fee payer safety: the fee payer MUST NOT appear as an account in sensitive instructions or be the transfer authority/source.
- Destination correctness: the receiver MUST match the `payTo` derived destination for the specified `asset`.
- Amount exactness: the transferred amount MUST equal `maxAmountRequired`.

Network-specific rules and exact instruction layouts are defined in the per-network scheme documents. For Solana (SVM), see `scheme_exact_svm.md`.
