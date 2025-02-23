import { serve } from "@hono/node-server";
import { makeServer } from "x402/facilitator";
import { facilitatorWallet } from "x402/shared/evm/wallet";

const port = 4020;
const app = makeServer(facilitatorWallet);

console.log(`Facilitator running on port ${port}`);

serve({
  port: port,
  fetch: app.fetch,
});
