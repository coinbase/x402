# @x402/next

## TODO

The `@x402/next` package provides middleware for handling **x402 Payment Required** responses using the x402 protocol.

It replaces the legacy `x402-next` package and leverages the shared `x402HTTPResourceServer` from `@x402/core` to gate API routes or pages that require payment before access.

**Tip** Use the legacy `x402-next` package as a basis, but re-implement the x402 logic following `@x402/express` as a reference.