# Extension: `payer-identifier`

## Summary

The `payer-identifier` extension allows clients to provide **unauthenticated identification** to servers when initially requesting access to x402-protected resources. Servers can use this claimed identity to customize the payment requirements accordingly, saving one roundtrip between client and server.

This is a **Server ↔ Client** extension. The Facilitator is not involved in the identification flow.

**Important**: This extension provides identification, not authentication. The client may not control the claimed address. Servers must treat this as untrusted input and never grant access based solely on this header. For authenticated identification, use [sign-in-with-x](./sign-in-with-x.md).

---

## PaymentRequired

Server advertises support:

```json
{
  "extensions": {
    "payer-identifier": {
      "schema": {
        "$schema": "https://json-schema.org/draft/2020-12/schema",
        "type": "string",
        "minLength": 16,
        "maxLength": 128,
        "pattern": "^[a-zA-Z0-9_:-]+$"
      }
    }
  }
}
```

The identifier is expected to be a string of 16-128 characters (alphanumeric, hyphens, underscores, colons).

---

## Client Request

The Client sends their identifier in the `PAYER-IDENTIFIER` HTTP header.

```http
GET /weather HTTP/1.1
Host: api.example.com
PAYER-IDENTIFIER: 0x857b06519E91e3A54538791bDbb0E22373e36b66
```

---

## Server Behavior

When the Server receives a request with the `PAYER-IDENTIFIER` header:

1. **Parse**: Extract the identifier from the header
2. **Validate**: Verify the format matches expected length and characters
3. **Act**: Adjust response as required

**Servers MAY:**
- Enrich `PaymentRequired` based on the claimed identity, using only publicly available data (pricing, available schemes, balances, payment history)
- Log the claimed identifier for correlation

**Servers MUST NOT:**
- Grant access to protected resources based solely on this header
- Return off-chain private data based solely on this header
- Modify any state (balances, records) without a signed payment

---

## Security Considerations

- **Unauthenticated**: The header is an unauthenticated claim. Anyone can send any address. Servers MUST NOT grant access or modify state based solely on this header.
- **Public Data Only**: Servers should only use this header to look up publicly available data. Off-chain private data should not be returned based solely on this header.
- **Information Leakage**: Sending the header reveals the client's address before any payment. Clients should only send this header to trusted servers.

