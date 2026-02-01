# Security Policy

The Coinbase team and the x402 community take security seriously. We thank you for helping keep x402 and its users safe.

## Reporting a Vulnerability

Please do not file a public ticket discussing a potential vulnerability, as this could put users at risk.

### How to Report

Please report your findings through our [HackerOne][1] program. This ensures we can:

1. **Acknowledge** your report promptly (typically within 1-2 business days)
2. **Investigate** the issue thoroughly
3. **Work with you** on remediation and disclosure timeline
4. **Credit you** appropriately for your contribution

### What to Include

When reporting, please provide:

- A clear description of the vulnerability
- Steps to reproduce the issue
- Potential impact assessment
- Any suggested fixes or mitigations (optional but appreciated)

### Scope

The following are in scope for our security program:

- **x402 Protocol Specification** - Vulnerabilities in the protocol design
- **SDK Implementations** - Security issues in TypeScript, Python, or Go SDKs
- **Smart Contracts** - Issues with on-chain payment mechanisms
- **Cryptographic Operations** - Signature verification, payload encoding, etc.

## Security Best Practices for Integrators

When integrating x402, please follow these security guidelines:

- **Never expose private keys** in client-side code or logs
- **Validate all inputs** before processing payment payloads
- **Use HTTPS** for all x402 communications
- **Keep SDKs updated** to receive security patches
- **Implement rate limiting** to prevent abuse

## Security Audits

x402 undergoes regular security reviews. For our latest audit reports, please contact us through HackerOne.

---

Thank you for helping us keep x402 secure! 🔐

[1]: https://hackerone.com/coinbase
