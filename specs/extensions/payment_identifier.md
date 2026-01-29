# Extension: `payment-identifier`

## Summary

The `payment-identifier` extension enables clients to provide an `id` that serves as an idempotency key. Both resource servers and facilitators consume `PaymentPayload`, so this can be leveraged at either or both points in the stack to deduplicate requests and return cached responses for repeated submissions.

---

## `PaymentRequired`

Server advertises support:

```json
{
  "extensions": {
    "payment-identifier": {
      "info": {},
      "schema": {
        "$schema": "https://json-schema.org/draft/2020-12/schema",
        "type": "object",
        "properties": {
          "id": { "type": "string", "minLength": 16, "maxLength": 128 }
        }
      }
    }
  }
}
```

---

## `PaymentPayload`

Client echoes the extension and appends an `id`:

```json
{
  "extensions": {
    "payment-identifier": {
      "schema": {
        "$schema": "https://json-schema.org/draft/2020-12/schema",
        "type": "object",
        "properties": {
          "id": { "type": "string", "minLength": 16, "maxLength": 128 }
        }
      },
      "info": {
        "id": "pay_7d5d747be160e280504c099d984bcfe0"
      }
    }
  }
}
```

---

## `id` Format

- **Length**: 16-128 characters
- **Characters**: alphanumeric, hyphens, underscores
- **Recommendation**: UUID v4 with prefix (e.g., `pay_`)

---

## Idempotency Behavior

| Scenario | Server Response |
|----------|-----------------|
| New `id` | Process request normally |
| Same `id`, same payload | Return cached response |
| Same `id`, different payload | Return 409 Conflict |

---

## Responsibilities

Both resource servers and facilitators consume `PaymentPayload`, so this extension can be leveraged at either or both points:

- **Resource server**: May use `id` for request deduplication and response caching
- **Facilitator**: May use `id` for verify/settle idempotency
- **Client**: Generates unique `id`, reuses same `id` on retries
