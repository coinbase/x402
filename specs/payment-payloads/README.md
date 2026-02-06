# Payment Payloads

**1. Overview**

This directory contains specifications for **x402 payment payload types**.

A payment payload defines the **signed message** that a client submits to enable or demonstrate payment for a resource. Different payload types correspond to different payment mechanisms, such as authorization-based transfers or transaction-reference–based payments.

Payment payloads are identified by the `payload.type` field in the client’s payment message.

```json
{
  "payload": {
    "type": "txid"
  }
}
```

The `payload.type` field provides an explicit discriminator that allows resource servers and facilitators to route verification and settlement logic without relying on heuristic inspection of payload structure.

If `payload.type` is not present resource servers and facilitators MUST interpret the payment payload as an EIP-3009 authorization payload, consistent with the base specification (v1 and v2).

**2. Payload Types**

| Type.     | Description                                                  | Status      |
|-----------|--------------------------------------------------------------|-------------|
| `txid`    | Transaction-reference based proof for any transferable asset | Draft       |
| `permit2` | Permit2 based authorization                                  | Placeholder |

