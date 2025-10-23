# @x402/axios

## TODO

The `@x402/axios` package provides an Axios interceptor for handling **x402 Payment Required** responses using the x402 protocol.

It replaces the legacy `x402-axios` package and leverages the shared `x402HTTPClient` from `@x402/core` to centralize payment handling logic.

**Tip** Use the legacy `x402-axios` package as a basis, but re-implement the x402 logic following `@x402/fetch` as a reference.