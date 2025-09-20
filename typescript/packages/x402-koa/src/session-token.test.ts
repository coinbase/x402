import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import Koa from "koa";
import request from "supertest";
import { POST } from "./session-token";

// Mock the fetch function
global.fetch = vi.fn();

// Mock the generateJwt function
vi.mock("@coinbase/cdp-sdk/auth", () => ({
  generateJwt: vi.fn().mockResolvedValue("mock-jwt-token"),
}));

describe("session-token POST", () => {
  let app: Koa;

  beforeEach(() => {
    app = new Koa();
    app.use(async (ctx, next) => {
      // Parse JSON body
      if (ctx.method === "POST") {
        const body = await new Promise((resolve) => {
          let data = "";
          ctx.req.on("data", (chunk) => {
            data += chunk;
          });
          ctx.req.on("end", () => {
            try {
              resolve(JSON.parse(data));
            } catch {
              resolve({});
            }
          });
        });
        ctx.request.body = body;
      }
      await next();
    });
    app.use(POST);

    // Reset mocks
    vi.clearAllMocks();
    (global.fetch as any).mockReset();
  });

  afterEach(() => {
    delete process.env.CDP_API_KEY_ID;
    delete process.env.CDP_API_KEY_SECRET;
  });

  it("should return error when CDP credentials are missing", async () => {
    const response = await request(app.callback())
      .post("/")
      .send({
        addresses: [{ address: "0x123", blockchains: ["base"] }],
      })
      .expect(500);

    expect(response.body).toEqual({
      error: "Server configuration error: Missing CDP API credentials",
    });
  });

  it("should return error when addresses are missing", async () => {
    process.env.CDP_API_KEY_ID = "test-key-id";
    process.env.CDP_API_KEY_SECRET = "test-key-secret";

    const response = await request(app.callback())
      .post("/")
      .send({})
      .expect(400);

    expect(response.body).toEqual({
      error: "addresses is required and must be a non-empty array",
    });
  });

  it("should successfully generate session token", async () => {
    process.env.CDP_API_KEY_ID = "test-key-id";
    process.env.CDP_API_KEY_SECRET = "test-key-secret";

    const mockResponse = {
      token: "test-session-token",
      expiresAt: "2024-01-01T00:00:00Z",
    };

    (global.fetch as any).mockResolvedValueOnce({
      ok: true,
      json: async () => mockResponse,
    });

    const response = await request(app.callback())
      .post("/")
      .send({
        addresses: [{ address: "0x123", blockchains: ["base"] }],
        assets: ["USDC"],
      })
      .expect(200);

    expect(response.body).toEqual(mockResponse);
    expect(global.fetch).toHaveBeenCalledWith(
      "https://api.developer.coinbase.com/onramp/v1/token",
      expect.objectContaining({
        method: "POST",
        headers: expect.objectContaining({
          Authorization: "Bearer mock-jwt-token",
          "Content-Type": "application/json",
        }),
      })
    );
  });

  it("should handle API errors gracefully", async () => {
    process.env.CDP_API_KEY_ID = "test-key-id";
    process.env.CDP_API_KEY_SECRET = "test-key-secret";

    (global.fetch as any).mockResolvedValueOnce({
      ok: false,
      status: 400,
      text: async () => "Bad Request",
    });

    const response = await request(app.callback())
      .post("/")
      .send({
        addresses: [{ address: "0x123" }],
      })
      .expect(400);

    expect(response.body).toEqual({
      error: "Failed to generate session token",
    });
  });
});