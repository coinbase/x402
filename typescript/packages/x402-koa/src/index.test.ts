import { describe, it, expect, vi } from "vitest";
import Koa from "koa";
import request from "supertest";
import { paymentMiddleware } from "./index";

describe("paymentMiddleware", () => {
  it("should allow requests without payment header when route not protected", async () => {
    const app = new Koa();
    
    // Configure middleware to protect only /api/* routes
    app.use(paymentMiddleware(
      "0x1234567890123456789012345678901234567890",
      {
        "/api/*": {
          price: "$0.01",
          network: "base-sepolia",
        }
      }
    ));

    // Add test route
    app.use(async (ctx) => {
      ctx.body = { message: "Hello World" };
    });

    const response = await request(app.callback())
      .get("/hello")
      .expect(200);

    expect(response.body).toEqual({ message: "Hello World" });
  });

  it("should return 402 for protected routes without payment header", async () => {
    const app = new Koa();
    
    // Configure middleware to protect /api/* routes
    app.use(paymentMiddleware(
      "0x1234567890123456789012345678901234567890",
      {
        "/api/*": {
          price: "$0.01",
          network: "base-sepolia",
        }
      }
    ));

    const response = await request(app.callback())
      .get("/api/users")
      .expect(402);

    expect(response.body).toHaveProperty("error", "X-PAYMENT header is required");
    expect(response.body).toHaveProperty("accepts");
    expect(response.body).toHaveProperty("x402Version", 1);
  });

  it("should return HTML paywall for browser requests", async () => {
    const app = new Koa();
    
    // Configure middleware
    app.use(paymentMiddleware(
      "0x1234567890123456789012345678901234567890",
      {
        "/api/*": {
          price: "$0.01",
          network: "base-sepolia",
        }
      }
    ));

    const response = await request(app.callback())
      .get("/api/users")
      .set("Accept", "text/html")
      .set("User-Agent", "Mozilla/5.0")
      .expect(402);

    expect(response.type).toBe("text/html");
    expect(response.text).toContain("Payment Required");
  });
});