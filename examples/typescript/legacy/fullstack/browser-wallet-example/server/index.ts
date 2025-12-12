import { config } from "dotenv";
import { Hono } from "hono";
import { serve } from "@hono/node-server";
import { cors } from "hono/cors";
import { paymentMiddleware, Network, Resource } from "x402-hono";
import { v4 as uuidv4 } from "uuid";

config();

// Configuration from environment variables
const facilitatorUrl = process.env.FACILITATOR_URL as Resource || "https://x402.org/facilitator";
const payTo = process.env.ADDRESS as `0x${string}`;
const network = (process.env.NETWORK as Network) || "base-sepolia";
const port = parseInt(process.env.PORT || "3001");

if (!payTo) {
  console.error("❌ Please set your wallet ADDRESS in the .env file");
  process.exit(1);
}

const app = new Hono();

// Enable CORS for frontend
app.use("/*", cors({
  origin: ["http://localhost:5173", "http://localhost:3000"],
  credentials: true,
}));

// Simple in-memory storage for sessions (use Redis/DB in production)
interface Session {
  id: string;
  createdAt: Date;
  expiresAt: Date;
  type: "24hour" | "onetime";
  used?: boolean;
}

const sessions = new Map<string, Session>();

// Configure x402 payment middleware with two payment options
app.use(
  paymentMiddleware(
    payTo,
    {
      // 24-hour session access
      "/api/pay/session": {
        price: "$1.00",
        network,
      },
      // One-time access/payment
      "/api/pay/onetime": {
        price: "$0.10",
        network,
      },
    },
    {
      url: facilitatorUrl,
    },
  ),
);

// Free endpoint - health check
app.get("/api/health", (c) => {
  return c.json({
    status: "ok",
    message: "Server is running",
    config: {
      network,
      payTo,
      facilitator: facilitatorUrl,
    },
  });
});

// Free endpoint - get payment options
app.get("/api/payment-options", (c) => {
  return c.json({
    options: [
      {
        name: "24-Hour Access",
        endpoint: "/api/pay/session",
        price: "$1.00",
        description: "Get a session ID for 24 hours of unlimited access",
      },
      {
        name: "One-Time Access",
        endpoint: "/api/pay/onetime",
        price: "$0.10",
        description: "Single use payment for immediate access",
      },
    ],
  });
});

// Paid endpoint - 24-hour session access ($1.00)
app.post("/api/pay/session", (c) => {
  const sessionId = uuidv4();
  const now = new Date();
  const expiresAt = new Date(now.getTime() + 24 * 60 * 60 * 1000); // 24 hours
  
  const session: Session = {
    id: sessionId,
    createdAt: now,
    expiresAt,
    type: "24hour",
  };

  sessions.set(sessionId, session);

  return c.json({
    success: true,
    sessionId,
    message: "24-hour access granted!",
    session: {
      id: sessionId,
      type: "24hour",
      createdAt: now.toISOString(),
      expiresAt: expiresAt.toISOString(),
      validFor: "24 hours",
    },
  });
});

// Paid endpoint - one-time access/payment ($0.10)
app.post("/api/pay/onetime", async (c) => {
  const sessionId = uuidv4();
  const now = new Date();
  
  const session: Session = {
    id: sessionId,
    createdAt: now,
    expiresAt: new Date(now.getTime() + 5 * 60 * 1000), // 5 minutes to use
    type: "onetime",
    used: false,
  };

  sessions.set(sessionId, session);

  return c.json({
    success: true,
    sessionId,
    message: "One-time access granted!",
    access: {
      id: sessionId,
      type: "onetime",
      createdAt: now.toISOString(),
      validFor: "5 minutes (single use)",
    },
  });
});

// Free endpoint - validate session
app.get("/api/session/:sessionId", (c) => {
  const sessionId = c.req.param("sessionId");
  const session = sessions.get(sessionId);

  if (!session) {
    return c.json({ valid: false, error: "Session not found" }, 404);
  }

  const now = new Date();
  const isExpired = now > session.expiresAt;
  const isUsed = session.type === "onetime" && session.used;

  if (isExpired || isUsed) {
    return c.json({ 
      valid: false, 
      error: isExpired ? "Session expired" : "One-time access already used",
      session: {
        id: session.id,
        type: session.type,
        createdAt: session.createdAt.toISOString(),
        expiresAt: session.expiresAt.toISOString(),
        used: session.used,
      }
    });
  }

  // Mark one-time sessions as used
  if (session.type === "onetime") {
    session.used = true;
    sessions.set(sessionId, session);
  }

  return c.json({
    valid: true,
    session: {
      id: session.id,
      type: session.type,
      createdAt: session.createdAt.toISOString(),
      expiresAt: session.expiresAt.toISOString(),
      remainingTime: session.expiresAt.getTime() - now.getTime(),
    },
  });
});

// Free endpoint - list active sessions (for demo purposes)
app.get("/api/sessions", (c) => {
  const activeSessions = Array.from(sessions.values())
    .filter(session => {
      const isExpired = new Date() > session.expiresAt;
      const isUsed = session.type === "onetime" && session.used;
      return !isExpired && !isUsed;
    })
    .map(session => ({
      id: session.id,
      type: session.type,
      createdAt: session.createdAt.toISOString(),
      expiresAt: session.expiresAt.toISOString(),
    }));

  return c.json({ sessions: activeSessions });
});

console.log(`
🚀 x402 Payment Template Server
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
💰 Accepting payments to: ${payTo}
🔗 Network: ${network}
🌐 Port: ${port}
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
📋 Payment Options:
   - 24-Hour Session: $1.00
   - One-Time Access: $0.10
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
🛠️  This is a template! Customize it for your app.
📚 Learn more: https://x402.org
💬 Get help: https://discord.gg/invite/cdp
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
`);

serve({
  fetch: app.fetch,
  port,
}); 