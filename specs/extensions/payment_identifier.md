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
      "info": {
        "required": false
      },
      "schema": {
        "$schema": "https://json-schema.org/draft/2020-12/schema",
        "type": "object",
        "properties": {
          "required": { "type": "boolean" },
          "id": { "type": "string", "minLength": 16, "maxLength": 128 }
        },
        "required": ["required"]
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
          "required": { "type": "boolean" },
          "id": { "type": "string", "minLength": 16, "maxLength": 128 }
        },
        "required": ["required"]
      },
      "info": {
        "required": false,
        "id": "pay_7d5d747be160e280504c099d984bcfe0"
      }
    }
  }
}
```

---

## `required` Field

- **Type**: boolean
- **Purpose**: Indicates whether the server requires clients to include a payment identifier
- **Default**: `false` (payment identifier is optional)

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
| `required: true`, no `id` provided | Return 400 Bad Request |

---

## Responsibilities

Both resource servers and facilitators consume `PaymentPayload`, so this extension can be leveraged at either or both points:

- **Resource server**: May use `id` for request deduplication and response caching
- **Facilitator**: May use `id` for verify/settle idempotency
- **Client**: Generates unique `id`, reuses same `id` on retries; must provide `id` if server sets `required: true`
