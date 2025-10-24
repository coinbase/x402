# Scheme: `deferred`

## Summary

`deferred` is a scheme designed to support trust minimized micro-payments. Unlike the `exact` scheme, which requires a payment to be executed immediately and fully on-chain, `deferred` allows clients to issue signed vouchers (IOUs) off-chain, which can later be aggregated and redeemed by the seller. This scheme enables payments smaller than the minimum feasible on-chain transaction cost.

`deferred` payment scheme requires the seller to store and manage the buyer's vouchers until their eventual on chain settlement. To simplify their setup sellers might choose to offload this task to trusted third parties providing these services, i.e facilitators.

## Example Use Cases

- AI agents or automated clients.
- Consuming an API requiring micro cent cost per request.
- Any case where payments are smaller than on-chain settlement costs.

## Appendix