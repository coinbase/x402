import { describe, it, expect } from "vitest";
import { Hono } from "hono";
import { x402ResourceServer } from "@x402/core/server";
import { paymentMiddleware } from "./index";

/**
 * Reproduces CAT finding f2e83cec-d5d5-4076-bd4e-55e060d216b1 against the
 * real Hono request pipeline (not a hand-built mock Context).
 *
 * Hono's own `getPath()` decodes the raw request URL with `decodeURI()`
 * before `c.req.path` is ever read, so `context.path` reaches
 * `x402HTTPResourceServer` already decoded — unlike Express/Fastify/Next,
 * which hand over the still percent-encoded path and let
 * `normalizePath()`'s `decodeURIComponent` do the decoding. Both routes
 * converge on the same literal LineTerminator character reaching the route
 * regex, so this test exercises Hono's distinct code path end-to-end.
 *
 * `app.request()` is Hono's documented way to drive the full fetch handler
 * (including its internal `getPath()` URL parsing) without a real socket —
 * `new Request(url)` preserves percent-encoding exactly as the wire would.
 */
describe("hono end-to-end: percent-encoded line terminator under wildcard route", () => {
  function buildApp() {
    const app = new Hono();
    const resourceServer = new x402ResourceServer();
    app.use(
      "*",
      paymentMiddleware(
        {
          "/api/premium/*": {
            accepts: {
              scheme: "exact",
              payTo: "0xabc",
              price: "$1.00",
              network: "eip155:84532",
            },
          },
        },
        resourceServer,
        undefined,
        undefined,
        // syncFacilitatorOnStart=false so the test does not try to call a real facilitator
        false,
      ),
    );
    // Catch-all so an unprotected route returns 200, not 404, letting us
    // tell "middleware skipped the route" apart from "framework 404".
    app.all("*", c => c.text("ok", 200));
    return app;
  }

  it("returns 402 for a baseline wildcard match", async () => {
    const res = await buildApp().request("/api/premium/report");
    expect(res.status).toBe(402);
  });

  it("returns 402 even when the tail contains %E2%80%A8 (U+2028 LINE SEPARATOR)", async () => {
    const res = await buildApp().request("/api/premium/report%E2%80%A8");
    expect(res.status).toBe(402);
  });

  it("returns 402 even when the tail contains %E2%80%A9 (U+2029 PARAGRAPH SEPARATOR)", async () => {
    const res = await buildApp().request("/api/premium/report%E2%80%A9");
    expect(res.status).toBe(402);
  });

  it("returns 402 even when the tail contains %0A (encoded LF)", async () => {
    const res = await buildApp().request("/api/premium/report%0A");
    expect(res.status).toBe(402);
  });

  it("returns 402 even when the tail contains %0D (encoded CR)", async () => {
    const res = await buildApp().request("/api/premium/report%0D");
    expect(res.status).toBe(402);
  });

  it("returns 200 (middleware skipped) for an unrelated path", async () => {
    const res = await buildApp().request("/health");
    expect(res.status).toBe(200);
  });
});
