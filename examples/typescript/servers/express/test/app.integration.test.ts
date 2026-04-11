import test from "node:test";
import assert from "node:assert/strict";

import { createApp } from "../app.ts";

const startServer = async () => {
  const app = createApp();
  const server = await new Promise<import("node:http").Server>(resolve => {
    const instance = app.listen(0, () => resolve(instance));
  });
  const address = server.address();
  if (!address || typeof address === "string") {
    throw new Error("Failed to resolve test server address");
  }
  return {
    server,
    baseUrl: `http://127.0.0.1:${address.port}`,
  };
};

test("404 response uses error envelope and request id", async () => {
  const { server, baseUrl } = await startServer();
  try {
    const response = await fetch(`${baseUrl}/missing`, {
      headers: { "x-request-id": "req-404" },
    });
    const body = (await response.json()) as {
      ok: boolean;
      requestId: string;
      error: { code: string; message: string };
    };

    assert.equal(response.status, 404);
    assert.equal(response.headers.get("x-request-id"), "req-404");
    assert.equal(body.ok, false);
    assert.equal(body.requestId, "req-404");
    assert.equal(body.error.code, "NOT_FOUND");
  } finally {
    await new Promise(resolve => server.close(resolve));
  }
});

test("invalid json returns BAD_REQUEST envelope", async () => {
  const { server, baseUrl } = await startServer();
  try {
    const response = await fetch(`${baseUrl}/weather`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-request-id": "req-json",
      },
      body: "{bad-json",
    });

    const body = (await response.json()) as {
      ok: boolean;
      requestId: string;
      error: { code: string; message: string };
    };

    assert.equal(response.status, 400);
    assert.equal(body.ok, false);
    assert.equal(body.requestId, "req-json");
    assert.equal(body.error.code, "BAD_REQUEST");
  } finally {
    await new Promise(resolve => server.close(resolve));
  }
});
