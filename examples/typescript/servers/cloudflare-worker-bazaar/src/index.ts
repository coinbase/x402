import { ExactEvmScheme } from "@x402/evm/exact/server";
import { HTTPFacilitatorClient, x402ResourceServer } from "@x402/core/server";
import {
  PAYMENT_REQUIRED_CACHE_CONTROL,
  decodePaymentSignatureHeader,
  encodePaymentRequiredHeader,
  encodePaymentResponseHeader,
} from "@x402/core/http";
import { declareDiscoveryExtension } from "@x402/extensions/bazaar";
import type { PaymentPayload, PaymentRequired, ResourceInfo } from "@x402/core/types";

/** Paid GET /weather. See README.md for the bazaar echo and signature rules. */

const NETWORK = "eip155:84532" as const;

interface Env {
  FACILITATOR_URL: string;
  PAY_TO: string;
}

const bazaar = declareDiscoveryExtension({
  method: "GET",
  input: { city: "san-francisco" },
  inputSchema: {
    properties: { city: { type: "string", description: "City name" } },
    required: ["city"],
  },
  output: { example: { city: "san-francisco", weather: "foggy", temperature: 60 } },
});

let serverPromise: Promise<x402ResourceServer> | undefined;

function resourceServer(env: Env): Promise<x402ResourceServer> {
  if (serverPromise) return serverPromise;
  const server = new x402ResourceServer(
    new HTTPFacilitatorClient({ url: env.FACILITATOR_URL }),
  ).register(NETWORK, new ExactEvmScheme());
  serverPromise = server.initialize().then(
    () => server,
    error => {
      serverPromise = undefined;
      throw error;
    },
  );
  return serverPromise;
}

function paymentRequired(document: PaymentRequired): Response {
  return Response.json(
    {},
    {
      status: 402,
      headers: {
        "PAYMENT-REQUIRED": encodePaymentRequiredHeader(document),
        "Cache-Control": PAYMENT_REQUIRED_CACHE_CONTROL,
      },
    },
  );
}

/** Attach the seller's bazaar block only when the client left the key out. */
function withSellerBazaar(payload: PaymentPayload): PaymentPayload {
  if (payload.extensions && "bazaar" in payload.extensions) return payload;
  return { ...payload, extensions: { ...payload.extensions, ...bazaar } };
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);
    if (request.method !== "GET" || url.pathname !== "/weather") {
      return new Response("Not found", { status: 404 });
    }
    if (!env.FACILITATOR_URL || !env.PAY_TO) {
      return Response.json({ error: "Set FACILITATOR_URL and PAY_TO" }, { status: 500 });
    }

    try {
      const server = await resourceServer(env);
      const requirements = (
        await server.buildPaymentRequirements({
          scheme: "exact",
          price: "$0.001",
          network: NETWORK,
          payTo: env.PAY_TO,
        })
      )[0];
      if (!requirements) {
        return Response.json({ error: "No payment requirements" }, { status: 500 });
      }

      const resource: ResourceInfo = {
        url: `${url.origin}${url.pathname}`,
        description: "Weather report for a city",
        mimeType: "application/json",
      };
      const advertise = (error?: string) =>
        server
          .createPaymentRequiredResponse([requirements], resource, error, bazaar)
          .then(paymentRequired);

      const header = request.headers.get("PAYMENT-SIGNATURE");
      if (!header) return advertise("Payment required");

      let payload: PaymentPayload;
      try {
        payload = decodePaymentSignatureHeader(header);
      } catch {
        return Response.json({ error: "Invalid PAYMENT-SIGNATURE" }, { status: 400 });
      }

      const offered = await server.createPaymentRequiredResponse(
        [requirements],
        resource,
        undefined,
        bazaar,
      );
      const accepted = server.findMatchingRequirements(offered.accepts, payload);
      if (!accepted) return advertise("No matching payment requirements");

      const echoed = server.validateExtensions(offered, payload);
      if (!echoed.valid) return advertise(echoed.invalidReason);

      const forwarded = withSellerBazaar(payload);
      const verified = await server.verifyPayment(forwarded, accepted);
      if (!verified.isValid) return advertise(verified.invalidReason);

      const settled = await server.settlePayment(forwarded, accepted);
      if (!settled.success) {
        return Response.json(
          { error: settled.errorReason ?? "Settlement failed" },
          { status: 402 },
        );
      }

      const city = url.searchParams.get("city") ?? "san-francisco";
      return Response.json(
        { city, weather: "foggy", temperature: 60 },
        {
          headers: {
            "PAYMENT-RESPONSE": encodePaymentResponseHeader(settled),
            "Cache-Control": "private",
          },
        },
      );
    } catch (error) {
      const message = error instanceof Error ? error.message : "Payment processing failed";
      return Response.json({ error: message }, { status: 500 });
    }
  },
};
