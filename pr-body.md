Adds Overwing to the ecosystem page under **Services/Endpoints**.

Overwing is a guardrails API for AI agents, paid per call over x402 on Base ($0.002 USDC, no account): content moderation, personal data and confidential leak detection, toxicity, self-harm and severity, returning a verdict plus one `recommended_action` (block / redact / review / allow).

- x402 v2 endpoint: `POST https://overwing.ai/api/x402/evaluate` (listed in the CDP Bazaar)
- Terms: `GET https://overwing.ai/api/x402/evaluate`
- Agent docs: https://overwing.ai/llms.txt

Files: `partners-data/overwing/metadata.json` and `public/logos/overwing.png` (512x512).

AI disclosure: the metadata entry and this description were drafted with Claude Code and reviewed by me; the logo is our own mark.

Update 2026-09-25: the same wallet and facilitator now also serve **Overwing Atlas**, open data on AI agents: `GET https://overwing.ai/api/x402/atlas/lookup?user_agent=...` identifies a User-Agent string against a registry of 241 AI crawlers, fetchers and browser agents ($0.001 USDC), and `GET /api/x402/atlas/report` sells the research report ($9). Both are in the Bazaar. Overview: https://overwing.ai/api/v1/atlas
