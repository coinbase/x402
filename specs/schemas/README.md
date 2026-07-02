# x402 JSON Schemas

Machine-readable [JSON Schema](https://json-schema.org/) (draft 2020-12) for the x402 v2
core message types, derived from [`x402-specification-v2.md`](../x402-specification-v2.md).

`x402-v2.schema.json` defines, under `$defs`:

| `$ref` | Message |
| --- | --- |
| `#/$defs/PaymentRequired` | 402 response body (§5.1) |
| `#/$defs/PaymentPayload` | client payment authorization (§5.2) |
| `#/$defs/SettlementResponse` | settlement result (§5.3) |

plus the shared `PaymentRequirements`, `ResourceInfo`, `Authorization`, and the
reference `ExactEvmPayload` (scheme `exact`, EVM).

These enable implementers to validate, generate, and test x402 messages without
re-deriving the rules from prose. Each schema validates the corresponding example
in the specification.

```python
from jsonschema import Draft202012Validator
import json
schema = json.load(open("x402-v2.schema.json"))
Draft202012Validator({"$defs": schema["$defs"], "$ref": "#/$defs/PaymentPayload"}).validate(msg)
```
