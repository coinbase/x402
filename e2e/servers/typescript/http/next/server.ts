import { x402ResourceServer } from "@x402/core/server";

import { loadServerEnv } from "../../config";
import { createResourceServer } from "./lib/setup";

let resourceServer: x402ResourceServer | undefined;

function ensureRuntime(): x402ResourceServer {
  if (!resourceServer) {
    const cfg = loadServerEnv();
    resourceServer = createResourceServer(cfg);
    console.log(`Using remote facilitator at: ${cfg.facilitatorUrl}`);
  }
  return resourceServer;
}

/** Shared resource server for withX402 route modules (initialized on first use). */
export const server = new Proxy({} as x402ResourceServer, {
  get(_target, prop, receiver) {
    return Reflect.get(ensureRuntime() as object, prop, receiver);
  },
});
