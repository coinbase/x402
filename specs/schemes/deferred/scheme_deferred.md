# Scheme: `deferred`

## Summary

`deferred` is a payment scheme designed for agentic payments that do not require immediate settlement. Its primary purpose is to enable instant access to resources through cryptographically secure payment commitments that are authenticated by the network. These payments are settled later through trusted network infrastructure.

`deferred` payments eliminate transaction delays and gas fees while maintaining strong security through network-verified authentication and account association with network providers, making them ideal for high-frequency, low-value transactions.

**Authentication**: The specific authentication mechanism (e.g., HTTP Message Signatures, bearer tokens, API keys) is determined by the network implementation, not the scheme itself.

## Example Use Cases

### High-Volume, Asynchronous Micro-payments (Consolidated Settlement)

This scheme facilitates systems requiring continuous access for AI agents or automated crawlers. The individual, low-cost requests are granted instantly via cryptographic payment commitment. The server may later aggregate commitments and execute the financial settlement (which can use fiat, stablecoins, or traditional rails) is batched and consolidated to occur periodically (daily or weekly), eliminating per-request overhead and transaction fees.

### Subscription and Licensing Agreements (Pre-negotiated Access)

Agents can access resources immediately under pre-negotiated licensing or subscription terms. The scheme provides programmatic access verification through network-authenticated identities, while the financial settlement and any usage-specific legal terms (like LLM inference/training access) are managed separately through the trusted network's infrastructure.

### Zero-Friction, Pay-Per-Use Access for Verified Identities

By binding the cryptographic payment commitment to a verified identity, the scheme enables instant delivery of premium content or API services. Similar to the exact scheme, this scheme supports simple access models like pay-per-article or per-API-call without forcing the user into a traditional API Key, subscription, or manual billing cycle.

## Appendix

### Network Requirements

The `deferred` scheme is network-dependent and requires:

1. **Authentication Mechanism**: Networks must specify how clients authenticate payment commitments (e.g., HTTP Message Signatures, bearer tokens, API keys)
2. **Identity Association**: Networks must maintain associations between authenticated identities and billing accounts
3. **Settlement Infrastructure**: Networks act as Merchant of Record, handling deferred settlement and billing

### Common Extensions

Network implementations may use extensions to communicate authentication requirements and usage terms:

#### HTTP Message Signatures Extension

The [`http-message-signatures`](../../extensions/http-message-signatures.md) extension can be used by networks that authenticate using HTTP Message Signatures (RFC 9421).

See the [full extension specification](../../extensions/http-message-signatures.md) for details on:

- Extension definition and JSON schema
- Required fields (`registrationUrl`, `signatureSchemes`, `tags`)
- Usage instructions and examples

**Example networks**: Cloudflare (`cloudflare:402`)

#### Terms Extension

The [`terms`](../../extensions/terms.md) extension can be used by any network to communicate legal terms and usage rights.

See the [full extension specification](../../extensions/terms.md) for details on:

- Extension definition and JSON schema
- Format options (`uri`, `markdown`, `plaintext`, `json`)
- Usage examples

**Example usage**: Communicating LLM training/inference rights, content licensing terms, or subscription agreements
