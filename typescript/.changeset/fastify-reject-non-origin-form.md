---
"@x402/fastify": patch
---

The Fastify payment middleware now rejects, with `400 Bad Request`, any request whose target does not start with `/` (absolute-form such as `https://host/protected-route`, `HTTPS://…`, `https://host?x=/protected-route`, etc.) before route matching. The two `find-my-way` versions Fastify 5 allows (9.5–9.8 and 9.9+) resolve these targets to different paths, so the payment gate could disagree with the router and skip payment for a route the router still served.
