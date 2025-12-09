# x402 Public Roadmap

This roadmap shares what the x402 team is building now, what's next, and where the community can have outsized impact. It reflects current priorities and sequencing.

**How to read this**

* **Now** = in flight or imminent.
* **Next** = queued after "Now," dependent on feedback/uptake.
* **Later** = larger bets or items gated on ecosystem maturity.
* Each item lists **Why**, **What**, **Status/Target**, and **Community** (whether it's a good fit for external contributors).

**How to contribute**

* Pick a "Community" item below, then **open a GitHub Issue in this repo** with the title: `Roadmap: <item> — Contribution Proposal`.
* In your issue, include: goals, approach/design sketch, deliverables, estimated timeline, and how you'll demo/measure success.
* The team will **review and offer consulting** (design feedback, API guidance, intros) so you can ship confidently.
* Docs are credibly neutral and community‑owned: contribute guides, templates, and examples to the GitBook repo → [https://github.com/murrlincoln/x402-gitbook](https://github.com/murrlincoln/x402-gitbook) (PRs welcome).



## Recently shipped

* ### x402 Bazaar Launch
  - **Why**: Developers struggled to find compatible services.
  - **What**: A machine‑readable catalog of x402‑compatible APIs to enable discovery and integration.
  - **Status/Target**: **Shipped – Sep 9, 2025**.
  - **Community**: Contribute endpoint listings, discovery standards, and example clients.



## Now

* ### Usage‑Based Payment Scheme
  - **Why**: Today's spec favors pre‑negotiated access; APIs often need post‑computed, per‑call pricing.
  - **What**: Formalize a standard for usage‑based payments (e.g., `upto`) to unlock LLM/API use cases.
  - **Status/Target**: **Scoping** → **Early Q4** (next major release); \~2 weeks dev + spec approval + \~3 weeks audit.
  - **Community**: Feedback on spec design, reference contracts, and demo integrations encouraged.

* ### MCP Support in x402 Spec
  - **Why**: The protocol doesn't yet standardize MCP integration patterns.
  - **What**: Include norms for MCP within the x402 spec.
  - **Status/Target**: **Scoping**, target **Q4**
  - **Community**: **Great fit** (co‑design + reference repos); avoid breaking early adopters.



## Next

* ### Open‑source CDP Go Facilitator (or TS version)
  - **Why**: Facilitators are fractionalizing; teams need a production‑grade reference.
  - **What**: Share CDP's Server Wallet‑based facilitator; short‑term TS repo if needed.
  - **Status/Target**: Pending externalization commitment; est. 2–3 weeks for Go; 3–4 days for TS.
  - **Community**: Runtime hardening, adapters, and deployment recipes.

* ### Bazaar: Ingest External Facilitator Endpoints
  - **Why**: Multiple facilitators see dozens of endpoints that aren't discoverable in Bazaar.
  - **What**: Mechanism (via CDP API keys) to register endpoints in Bazaar.
  - **Status/Target**: Decide in **Q4** based on fractionalization signal; <1 week build.

* ### Payments MCP: Remote URL Support
  - **Why**: Today works best in desktop apps; remote URLs unblock browser‑based clients (Claude/ChatGPT).
  - **What**: Spec + implementation for remote URL flows.
  - **Status/Target**: Ideating; **Q4/Q1**; security & infra gating; 2–3 weeks build. Must be built by CDP team since this is close-sourced and on CB infra.

* ### Payments MCP: Solana Support
  - **Why**: Make Payments MCP a multi‑chain agentic finance hub.
  - **What**: Add Solana wallet support (coord. with CDP SDK/embedded wallet team).
  - **Status/Target**: **Q4/Q1**; 1–2 weeks once wallet primitives land.
  - **Community**: Example endpoints and wallet adapters.

* ### A2A Support in Bazaar
  - **Why**: Today Bazaar lists endpoints, not A2A agents.
  - **What**: Discover (and ideally call) A2A agents from x402 clients.
  - **Status/Target**: **Q4/Q1**; 1–2 weeks; define input schema + backend logic; update executors.
  - **Community**: Schemas, validators, and starter clients.

* ### Identity Solution (solutions‑guides first)
  - **Why**: Sellers need KYC/eligibility signals; we won't invent a new identity.
  - **What**: Curate best‑practice **guides** and partnerships using existing identity services compatible with x402.
  - **Status/Target**: **Late Q4/early Q1**.
  - **Community**: **Great fit** (guide PRs, integrator demos, comparison matrices, suggestions).

* ### MCP Support in Bazaar
  - **Why**: Surface MCP tools alongside endpoints.
  - **What**: Discover (and possibly call) MCP tools from x402 clients (or MCP clients if required).
  - **Status/Target**: **Q4/Q1**; 1–2 weeks; similar to A2A work.
  - **Community**: Tool discovery schemas + example bridges.



## Later

* ### x402 Bazaar: ERC‑8004 Integration
  - **Why**: x402 wants to closely support and align with Ethereum's Trustless Agents standard.
  - **What**: Integrate ERC‑8004 (as it matures) to enable agent reputation and identity.
  - **Status/Target**: ERC‑8004 in flux; coordinate with authors; **Q1–Q2 2026**.
  - **Community**: Research, examples, and help spec out 8004.

* ### Commerce Scheme (refunds/escrow)
  - **Why**: E‑commerce needs refunds/escrow flows.
  - **What**: Define and pilot a commerce scheme (likely CDP‑facilitator first).
  - **Status/Target**: **Q1 2026** (3–4 weeks once specced).

* ### Arbitrary Token Support
  - **Why**: Only EIP‑3009 tokens (USDC) are seamless today.
  - **What**: Permit/Permit2/EIP‑712 flows for non‑3009 tokens within x402.
  - **Status/Target**: **Q2 2026**; align with wallets/facilitators.
  - **Community**: **Great fit** (spec proposal + reference impl across chains).

* ### XMTP Support in x402 Spec
  - **Why**: Base App agents rely on XMTP; first‑class support is useful as demand emerges.
  - **What**: Include XMTP in x402 spec + packages.
  - **Status/Target**: **Q2 2026**; similar operating model as A2A (reference repos + guidance).
  - **Community**: **Great fit** (co‑author spec; provide adapters/examples).

* ### Facilitator Router (or allow array of facilitators to be passed)
  - **Why**: Sellers often need multi‑network/scheme/token coverage.
  - **What**: A router that selects the appropriate facilitator per config.
  - **Status/Target**: **Late Q2 2026** (or allow endpoints to supply an array of facilitators).
  - **Community**: Prototypes and routing benchmarks.

* ### Bazaar Search & Categorization
  - **Why**: As listings grow, search/indexing becomes vital.
  - **What**: Add search, categories, and ranking signals.
  - **Status/Target**: **TBD**; good candidate once scale merits it.
  - **Community**: **Great fit** frontrun us with indexers, ranking heuristics, and UI PRs welcome.



## Explicit community call‑outs (start here)

If you want to contribute, these items are especially well‑scoped for community ownership. Open an issue and we'll co‑design with you:

* **Arbitrary Token Support** (spec + reference impl across EVM/SVM; Permit/Permit2/EIP‑712 variants).
* **XMTP Support in x402** (spec & packages; adapters, examples).
* **Identity Solution Proposals** (guides/PRs using existing identity providers; no new identity protocol).
* **Solution Guides & Demos for Docs** (neutral, vendor‑agnostic how‑tos for building with x402; add to GitBook).
  * Include A2A examples once the extension is live.
  * Templates for monetizing apps and other services
  * Patterns for identity management
  * MCP demos & guides
* **MCP Support in x402 Spec** (co‑author patterns + reference repos; keep compatibility with early builders).
* **Deferred payment scheme** working with an existing community builder on this
* **Sui support in packages/facilitator**
* **ERC-7710 onchain delegations**


**Claiming a community item, or propose a new one!**

1. Open a GitHub Issue titled `Roadmap: <item> — Contribution Proposal`.
2. Include problem, proposed approach, milestones/deliverables, and demo plan.
3. We'll respond with feedback and assign a point‑of‑contact for consulting.

---

*This roadmap is living; sequencing may change based on developer feedback, adoption, and partner timelines.*