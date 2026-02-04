import { config } from "dotenv";
import express from "express";
import {
  paymentMiddlewareFromHTTPServer,
  x402ResourceServer,
  x402HTTPResourceServer,
} from "@x402/express";
import { ExactEvmScheme } from "@x402/evm/exact/server";
import { HTTPFacilitatorClient } from "@x402/core/server";
import {
  declarePaymentIdentifierExtension,
  extractPaymentIdentifier,
  PAYMENT_IDENTIFIER,
} from "@x402/extensions/payment-identifier";
config();

const address = process.env.ADDRESS as `0x${string}`;
if (!address) {
  console.error("❌ ADDRESS environment variable is required");
  process.exit(1);
}

// Use default x402.org facilitator
const facilitatorClient = new HTTPFacilitatorClient({ url: "https://x402.org/facilitator" });

/**
 * Simple in-memory cache for idempotency.
 * In production, use Redis or another distributed cache.
 */
interface CachedResponse {
  timestamp: number;
  response: { report: { weather: string; temperature: number; cached: boolean } };
}

const idempotencyCache = new Map<string, CachedResponse>();
const CACHE_TTL_MS = 60 * 60 * 1000; // 1 hour

/**
 * Cleans up expired entries from the cache.
 */
function cleanupExpiredEntries(): void {
  const now = Date.now();
  for (const [key, value] of idempotencyCache.entries()) {
    if (now - value.timestamp > CACHE_TTL_MS) {
      idempotencyCache.delete(key);
    }
  }
}

// Run cleanup every 5 minutes
setInterval(cleanupExpiredEntries, 5 * 60 * 1000);

// Declare that we support payment-identifier extension (required: false means optional)
const paymentIdentifierDeclaration = declarePaymentIdentifierExtension(false);

// Route configuration with payment-identifier extension advertised
const routes = {
  "GET /weather": {
    accepts: [
      {
        scheme: "exact",
        price: "$0.001",
        network: "eip155:84532",
        payTo: address,
      },
    ],
    description: "Weather data with idempotency support",
    mimeType: "application/json",
    // Advertise payment-identifier extension support
    extensions: {
      [PAYMENT_IDENTIFIER]: paymentIdentifierDeclaration,
    },
  },
};

// Create the resource server with payment scheme support
const resourceServer = new x402ResourceServer(facilitatorClient)
  .register("eip155:84532", new ExactEvmScheme())
  // Hook after settlement to cache the response
  .onAfterSettle(async ({ paymentPayload }) => {
    const paymentId = extractPaymentIdentifier(paymentPayload);
    if (paymentId) {
      console.log(`[Idempotency] Caching response for payment ID: ${paymentId}`);
      idempotencyCache.set(paymentId, {
        timestamp: Date.now(),
        response: {
          report: {
            weather: "sunny",
            temperature: 70,
            cached: false,
          },
        },
      });
    }
  });

// Extend Express Request type to include payment ID
declare global {
  namespace Express {
    interface Request {
      paymentId?: string;
    }
  }
}

// Create HTTP server with the onProtectedRequest hook for idempotency
const httpServer = new x402HTTPResourceServer(resourceServer, routes).onProtectedRequest(
  async context => {
    // Only check idempotency if there's a payment header (retry scenario)
    if (!context.paymentHeader) {
      return; // Continue to normal payment flow
    }

    // Try to decode the payment header to get the payment ID
    // The payment header is base64-encoded JSON
    try {
      const paymentPayload = JSON.parse(
        Buffer.from(context.paymentHeader, "base64").toString("utf-8"),
      );
      const paymentId = extractPaymentIdentifier(paymentPayload);

      if (paymentId) {
        console.log(`[Idempotency] Checking payment ID: ${paymentId}`);

        const cached = idempotencyCache.get(paymentId);
        if (cached) {
          const age = Date.now() - cached.timestamp;
          if (age < CACHE_TTL_MS) {
            console.log(`[Idempotency] Cache HIT - granting access (age: ${Math.round(age / 1000)}s)`);
            // Store payment ID in request for route handler access
            // Access Express request through adapter's private req property
            const adapter = context.adapter as { req: express.Request };
            adapter.req.paymentId = paymentId;
            // Grant access without payment processing - the cached response will be served
            return { grantAccess: true };
          } else {
            console.log(`[Idempotency] Cache EXPIRED - proceeding with payment`);
            idempotencyCache.delete(paymentId);
          }
        } else {
          console.log(`[Idempotency] Cache MISS - proceeding with payment`);
        }
      }
    } catch {
      // Invalid payment header format, continue to normal flow
    }

    return; // Continue to normal payment verification
  },
);

const app = express();

app.use(paymentMiddlewareFromHTTPServer(httpServer));

app.get("/weather", (req, res) => {
  // Check if this is a cached response (grantAccess was true)
  if (req.paymentId) {
    const cached = idempotencyCache.get(req.paymentId);
    if (cached) {
      // Return cached response with cached flag set to true
      res.json({
        report: {
          ...cached.response.report,
          cached: true,
        },
      });
      return;
    }
  }

  // Normal response (first request or cache miss)
  res.json({
    report: {
      weather: "sunny",
      temperature: 70,
      cached: false,
    },
  });
});

app.listen(4022, () => {
  console.log(`\n🌤️  Payment-Identifier Example Server`);
  console.log(`   Listening at http://localhost:4022`);
  console.log(`\n📋 Idempotency Configuration:`);
  console.log(`   - Cache TTL: 1 hour`);
  console.log(`   - Payment ID: optional (required: false)`);
  console.log(`\n💡 How it works:`);
  console.log(`   1. Client sends payment with a unique payment ID`);
  console.log(`   2. Server caches the response keyed by payment ID`);
  console.log(`   3. If same payment ID is seen within 1 hour, access is granted without payment`);
  console.log(`   4. No duplicate payment processing occurs\n`);
});
