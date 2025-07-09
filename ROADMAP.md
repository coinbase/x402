# Roadmap

This file contains desired large features the x402 team would like to see developed. As per the bandwidth we have, we will prioritize items listed under `Open for contribution`, but we would love community involvement and help to add these features.

**Looking to build monetizable apps and demos? Check out our [project ideas page](./PROJECT-IDEAS.md)**

## CDP Lead

- [ ] **Automatic /list discovery endpoint** – A self‑describing listing that every x402 seller can deploy so agents can discover pricing and schemas on the fly.
- [ ] **On‑ramp & smart‑wallet creation in paywall UI** – Embed fiat‑to‑stable on‑ramp and ERC‑4337 wallets in the off‑the‑shelf paywall component.


## Open for contribution
_We'd love to see you build any of these! Please don't hesitate to reach out to us at @murrlincoln or @programmer on X or via GitHub issues for more information. We'll help you ship it and achieve whatever goals you want out of it!_

- [ ] **x402 MCP Integration** – Easy process for provisioning a wallet and allowing a user to interact with x402 via MCP. Ideally using CDP Wallet API, with a stretch goal of allowing browser-based auth using a browser-based wallet.
- [ ] **MCP monetization template** – Drop‑in codegen for instant paywalls on any MCP server. MCP server gate or monetize endpoints out‑of‑the‑box.
- [ ] **`exact` scheme support on SVM** – See the [ongoing issue thread](https://github.com/coinbase/x402/issues/131)
- [ ] **Usage‑based payment scheme on EVM/SVM (upto)** – Introduce pay‑as‑you‑go billing using transferWithAuthorization / permit. Ideal for LLM inference, where the number of output tokens is unknown until after the response is served.
- [ ] **Browser‑wallet UX improvements** – One‑click "sign spend permissions once" flow for trusted sellers.
- [ ] **x402 package with built‑in wallet** – Dev kit that spins up a funded burner wallet for tutorials and hackathons.
- [ ] **Improved public dashboards** – Take this [Dune dashboard](https://dune.com/programmer/x402-base-mainnet) and improve it with known sellers, analytics, and other pertitent information you might want as an enterprise user. 
- [ ] **Support Arbitrary Tokens** – easier semantics for arbitrary tokens using permit as an alt method to `transferWithAuthorization` (likely via `permit` and an up to scheme)
