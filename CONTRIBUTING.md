# Contributing

x402 welcomes contributions of schemes, middleware, new chain support, and more.
CDP aims to make x402 as secure and trusted as possible.
Merging contributions is at the discretion of the CDP Engineering team, based on the risk of the contribution and the quality of implementation.

If you update the core x402 Typescript package, you'll need to rebuild the paywall via `pnpm build:paywall` and commit the resulting generated files as part of your PR.

You will also need to sign all of your commits for any contributions to be merged.

## Middleware and language libraries

Language libraries should implement best practices of the language they target, have tests, linting, and follow best practices for x402 client development.

## New Schemes

Schemes dictate how funds are moved from client to server address. As such they will be thoroughly audited by CDP legal and security teams to ensure they are safe and do not put any parties in a compromising position.

We recommend first proposing a scheme by opening a PR with a proposed spec into `specs/`, discussing the architecture and purpose in that PR, then once the PR is merged, moving on to implementation.

## New Chains

We want x402 to be chain agnostic, and as such deeply appreciate implementations of new chains.

Because some chains have different best practices than the EVM, a logical scheme may have a different mechanism to achieve its goal than that scheme has on the EVM.

If scheme mechanism for a chain must vary from the first implementation of a scheme, CDP will re-audit the scheme for that chain before accepting.
