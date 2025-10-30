# @x402/hono

## TODO

The `@x402/hono` package provides middleware for handling **x402 Payment Required** responses using the x402 protocol.

It replaces the legacy `x402-hono` package and leverages the shared `x402HTTPResourceService` from `@x402/core` to gate routes that require payment before access.

**Tip** Use the legacy `x402-hono` package as a basis, but re-implement the x402 logic following `@x402/express` as a reference.