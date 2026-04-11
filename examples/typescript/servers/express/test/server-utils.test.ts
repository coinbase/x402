import test from "node:test";
import assert from "node:assert/strict";

import { buildErrorEnvelope, readEnvConfig } from "../server-utils.ts";

test("readEnvConfig throws when required env is missing", () => {
  assert.throws(() => readEnvConfig({}), /Missing required environment variables/);
});

test("readEnvConfig parses explicit port", () => {
  const config = readEnvConfig({
    EVM_ADDRESS: "0x1111111111111111111111111111111111111111",
    SVM_ADDRESS: "SVM-PAYEE-ADDRESS",
    FACILITATOR_URL: "https://x402.org/facilitator",
    PORT: "4023",
  });

  assert.equal(config.port, 4023);
  assert.equal(config.evmAddress, "0x1111111111111111111111111111111111111111");
});

test("buildErrorEnvelope includes requestId and code", () => {
  const envelope = buildErrorEnvelope("BAD_REQUEST", "invalid json", "req-123");

  assert.deepEqual(envelope, {
    ok: false,
    requestId: "req-123",
    error: {
      code: "BAD_REQUEST",
      message: "invalid json",
    },
  });
});
