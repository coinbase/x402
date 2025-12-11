# Transport: gRPC

## Summary

The gRPC transport implements x402 payment flows over native gRPC protocol using metadata for payment signaling and gRPC status codes for error handling. This enables payment-gated gRPC services for service-to-service communication, native mobile clients, and high-performance scenarios requiring binary protobuf encoding.

This transport is distinct from the HTTP transport used with grpc-gateway reverse proxies.

## Payment Required Signaling

The server indicates payment is required using the gRPC `RESOURCE_EXHAUSTED` status code with payment requirements in the error message.

**Mechanism**: gRPC status code `RESOURCE_EXHAUSTED` (8) with base64-encoded JSON in error message
**Data Format**: Base64-encoded `PaymentRequirementsResponse` schema in status message

**Note on Status Code**: This spec uses `RESOURCE_EXHAUSTED` (8) to signal payment required, following the precedent set by Google Cloud Platform for billing and quota enforcement. Semantically, this represents "you have exhausted your quota of free access" and signals to clients that additional resources (payment) are needed to continue.

**Example:**

```
Status: RESOURCE_EXHAUSTED (8)
Message: eyJ4NDAyVmVyc2lvbiI6MSwi...

(Base64 decodes to:)
{
  "x402Version": 1,
  "error": "Payment required to access this resource",
  "paymentRequirements": [
    {
      "x402Version": 1,
      "scheme": "exact",
      "network": "base-mainnet",
      "maxAmountRequired": "100000",
      "asset": "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913",
      "payTo": "0x209693Bc6afc0C5328bA36FaF03C514EF312287C",
      "resource": "/compute.v1.ComputeService/RunTask",
      "description": "Execute computational task",
      "mimeType": "application/grpc",
      "outputSchema": null,
      "maxTimeoutSeconds": 300,
      "extra": {
        "name": "USDC",
        "version": "2"
      }
    }
  ]
}
```

## Payment Payload Transmission

Clients send payment data using gRPC initial metadata with key `x402-payment`.

**Mechanism**: `x402-payment` metadata field containing base64-encoded JSON
**Data Format**: Base64-encoded `PaymentPayload` schema in initial metadata

**Example:**

```
Metadata:
  x402-payment: eyJ4NDAyVmVyc2lvbiI6MSwic2NoZW1lIjoiZXhhY3QiLC...

(Base64 decodes to:)
{
  "x402Version": 1,
  "scheme": "exact",
  "network": "base-mainnet",
  "payload": {
    "signature": "0x2d6a7588d6acca505cbf0d9a4a227e0c52c6c34008c8e8986a1283259764173608a2ce6496642e377d6da8dbbf5836e9bd15092f9ecab05ded3d6293af148b571c",
    "authorization": {
      "from": "0x857b06519E91e3A54538791bDbb0E22373e36b66",
      "to": "0x209693Bc6afc0C5328bA36FaF03C514EF312287C",
      "value": "100000",
      "validAfter": "1740672089",
      "validBefore": "1740672154",
      "nonce": "0xf3746613c2d920b5fdabc0856f2aeb2d4f88ee6037b8cc5d04a71a4462f13480"
    }
  }
}
```

For streaming RPCs, payment is verified before the stream begins using the same metadata mechanism.

## Settlement Response Delivery

Servers communicate payment settlement results using gRPC trailing metadata with key `x402-payment-response`.

**Mechanism**: `x402-payment-response` trailing metadata field containing base64-encoded JSON
**Data Format**: Base64-encoded `SettlementResponse` schema in trailing metadata

**Example (Successful Settlement):**

```
Status: OK (0)
Trailing-Metadata:
  x402-payment-response: eyJzdWNjZXNzIjp0cnVlLCJ0cmFuc2FjdGlvbiI6...

(Base64 decodes to:)
{
  "transactionHash": "0x1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef",
  "status": "confirmed"
}
```

**Example (Payment Failure):**

```
Status: RESOURCE_EXHAUSTED (8)
Message: eyJ4NDAyVmVyc2lvbiI6MSwi...

(Payment requirements returned with failure reason)
```

## Error Handling

gRPC transport maps x402 errors to gRPC status codes:

| x402 Error       | gRPC Status Code     | Description                                     |
| ---------------- | -------------------- | ----------------------------------------------- |
| Payment Required | `RESOURCE_EXHAUSTED` | Payment needed to access resource               |
| Invalid Payment  | `INVALID_ARGUMENT`   | Malformed payment payload or encoding           |
| Payment Failed   | `RESOURCE_EXHAUSTED` | Payment verification or settlement failed       |
| Server Error     | `INTERNAL`           | Internal server error during payment processing |
| Success          | `OK`                 | Payment verified and settled successfully       |

## References

- [Core x402 Specification](../x402-specification.md)
- [gRPC Status Codes](https://grpc.io/docs/guides/status-codes/)
- [gRPC Metadata](https://grpc.io/docs/guides/metadata/)
- [Go Reference Implementation](https://github.com/becomeliminal/grpc-gateway-x402/tree/main/grpc)
