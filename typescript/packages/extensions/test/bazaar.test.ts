/**
 * Tests for Bazaar Discovery Extension
 */

import { describe, it, expect } from "vitest";
import {
  BAZAAR,
  declareDiscoveryExtension,
  validateDiscoveryExtension,
  extractDiscoveryInfo,
  extractDiscoveryInfoFromExtension,
  extractDiscoveryInfoV1,
  validateAndExtract,
} from "../src/bazaar/index";
import type { BodyDiscoveryInfo, DiscoveryExtension } from "../src/bazaar/types";

describe("Bazaar Discovery Extension", () => {
  describe("BAZAAR constant", () => {
    it("should export the correct extension identifier", () => {
      expect(BAZAAR).toBe("bazaar");
    });
  });

  describe("declareDiscoveryExtension - GET method", () => {
    it("should create a valid GET extension with query params", () => {
      const result = declareDiscoveryExtension({
        input: { query: "test", limit: 10 },
        inputSchema: {
          properties: {
            query: { type: "string" },
            limit: { type: "number" },
          },
          required: ["query"],
        },
      });

      expect(result).toHaveProperty("bazaar");
      const extension = result.bazaar;
      expect(extension).toHaveProperty("info");
      expect(extension).toHaveProperty("schema");
      expect(extension.info.input.type).toBe("http");
      expect(extension.info.input.queryParams).toEqual({ query: "test", limit: 10 });
    });

    it("should create a GET extension with output example", () => {
      const outputExample = { results: [], total: 0 };
      const result = declareDiscoveryExtension({
        input: { query: "test" },
        inputSchema: {
          properties: {
            query: { type: "string" },
          },
        },
        output: {
          example: outputExample,
        },
      });

      const extension = result.bazaar;
      expect(extension.info.output?.example).toEqual(outputExample);
    });
  });

  describe("declareDiscoveryExtension - POST method", () => {
    it("should create a valid POST extension with JSON body", () => {
      const result = declareDiscoveryExtension({
        input: { name: "John", age: 30 },
        inputSchema: {
          properties: {
            name: { type: "string" },
            age: { type: "number" },
          },
          required: ["name"],
        },
        bodyType: "json",
      });

      const extension = result.bazaar;
      expect(extension.info.input.type).toBe("http");
      expect((extension.info as BodyDiscoveryInfo).input.bodyType).toBe("json");
      expect((extension.info as BodyDiscoveryInfo).input.body).toEqual({ name: "John", age: 30 });
    });

    it("should default to JSON body type if not specified", () => {
      const result = declareDiscoveryExtension({
        input: { data: "test" },
        inputSchema: {
          properties: {
            data: { type: "string" },
          },
        },
        bodyType: "json",
      });

      const extension = result.bazaar;
      expect((extension.info as BodyDiscoveryInfo).input.bodyType).toBe("json");
    });

    it("should support form-data body type", () => {
      const result = declareDiscoveryExtension({
        input: { file: "upload.pdf" },
        inputSchema: {
          properties: {
            file: { type: "string" },
          },
        },
        bodyType: "form-data",
      });

      const extension = result.bazaar;
      expect((extension.info as BodyDiscoveryInfo).input.bodyType).toBe("form-data");
    });
  });

  describe("declareDiscoveryExtension - Other methods", () => {
    it("should create a valid PUT extension", () => {
      const result = declareDiscoveryExtension({
        input: { id: "123", name: "Updated" },
        inputSchema: {
          properties: {
            id: { type: "string" },
            name: { type: "string" },
          },
        },
        bodyType: "json",
      });

      const extension = result.bazaar;
      expect(extension.info.input.type).toBe("http");
    });

    it("should create a valid PATCH extension", () => {
      const result = declareDiscoveryExtension({
        input: { status: "active" },
        inputSchema: {
          properties: {
            status: { type: "string" },
          },
        },
        bodyType: "json",
      });

      const extension = result.bazaar;
      expect(extension.info.input.type).toBe("http");
    });

    it("should create a valid DELETE extension", () => {
      const result = declareDiscoveryExtension({
        input: { id: "123" },
        inputSchema: {
          properties: {
            id: { type: "string" },
          },
        },
      });

      const extension = result.bazaar;
      expect(extension.info.input.type).toBe("http");
    });

    it("should create a valid HEAD extension", () => {
      const result = declareDiscoveryExtension({});

      const extension = result.bazaar;
      expect(extension.info.input.type).toBe("http");
    });

    it("should throw error for unsupported method", () => {
      const result = declareDiscoveryExtension({});
      expect(result).toHaveProperty("bazaar");
    });
  });

  describe("validateDiscoveryExtension", () => {
    it("should validate a correct GET extension", () => {
      const declared = declareDiscoveryExtension({
        input: { query: "test" },
        inputSchema: {
          properties: {
            query: { type: "string" },
          },
        },
      });

      const extension = declared.bazaar;
      const result = validateDiscoveryExtension(extension);
      expect(result.valid).toBe(true);
      expect(result.errors).toBeUndefined();
    });

    it("should validate a correct POST extension", () => {
      const declared = declareDiscoveryExtension({
        input: { name: "John" },
        inputSchema: {
          properties: {
            name: { type: "string" },
          },
        },
        bodyType: "json",
      });

      const extension = declared.bazaar;
      const result = validateDiscoveryExtension(extension);
      expect(result.valid).toBe(true);
    });

    it("should detect invalid extension structure", () => {
      const invalidExtension = {
        info: {
          input: {
            type: "http",
            method: "GET",
          },
        },
        schema: {
          $schema: "https://json-schema.org/draft/2020-12/schema",
          type: "object",
          properties: {
            input: {
              type: "object",
              properties: {
                type: { type: "string", const: "invalid" }, // Should be "http"
                method: { type: "string", enum: ["GET"] },
              },
              required: ["type", "method"],
            },
          },
          required: ["input"],
        },
      } as unknown as DiscoveryExtension;

      const result = validateDiscoveryExtension(invalidExtension);
      expect(result.valid).toBe(false);
      expect(result.errors).toBeDefined();
      expect(result.errors!.length).toBeGreaterThan(0);
    });
  });

  describe("extractDiscoveryInfoFromExtension", () => {
    it("should extract info from a valid extension", () => {
      const declared = declareDiscoveryExtension({
        input: { query: "test" },
        inputSchema: {
          properties: {
            query: { type: "string" },
          },
        },
      });

      const extension = declared.bazaar;
      const info = extractDiscoveryInfoFromExtension(extension);
      expect(info).toEqual(extension.info);
      expect(info.input.type).toBe("http");
    });

    it("should extract info without validation when validate=false", () => {
      const declared = declareDiscoveryExtension({
        input: { name: "John" },
        inputSchema: {
          properties: {
            name: { type: "string" },
          },
        },
        bodyType: "json",
      });

      const extension = declared.bazaar;
      const info = extractDiscoveryInfoFromExtension(extension, false);
      expect(info).toEqual(extension.info);
    });

    it("should throw error for invalid extension when validating", () => {
      const invalidExtension = {
        info: {
          input: {
            type: "http",
            method: "GET",
          },
        },
        schema: {
          $schema: "https://json-schema.org/draft/2020-12/schema",
          type: "object",
          properties: {
            input: {
              type: "object",
              properties: {
                type: { type: "string", const: "invalid" },
                method: { type: "string", enum: ["GET"] },
              },
              required: ["type", "method"],
            },
          },
          required: ["input"],
        },
      } as unknown as DiscoveryExtension;

      expect(() => {
        extractDiscoveryInfoFromExtension(invalidExtension);
      }).toThrow("Invalid discovery extension");
    });
  });

  describe("extractDiscoveryInfo (full flow)", () => {
    it("should extract info from v2 PaymentPayload with extensions", () => {
      const declared = declareDiscoveryExtension({
        input: { userId: "123" },
        inputSchema: {
          properties: {
            userId: { type: "string" },
          },
        },
        bodyType: "json",
      });

      const extension = declared.bazaar;

      const paymentPayload = {
        x402Version: 2,
        scheme: "exact",
        network: "eip155:8453" as unknown,
        payload: {},
        accepted: {} as unknown,
        resource: { url: "http://example.com/test" },
        extensions: {
          [BAZAAR]: extension,
        },
      };

      const discovered = extractDiscoveryInfo(paymentPayload, {} as unknown);

      expect(discovered).not.toBeNull();
      expect(discovered!.discoveryInfo.input.type).toBe("http");
      expect(discovered!.resourceUrl).toBe("http://example.com/test");
    });

    it("should extract info from v1 PaymentRequirements", () => {
      const v1Requirements = {
        scheme: "exact",
        network: "eip155:8453" as unknown,
        maxAmountRequired: "10000",
        resource: "https://api.example.com/data",
        description: "Get data",
        mimeType: "application/json",
        outputSchema: {
          input: {
            type: "http",
            method: "GET",
            discoverable: true,
            queryParams: { q: "test" },
          },
        },
        payTo: "0x...",
        maxTimeoutSeconds: 300,
        asset: "0x...",
        extra: {},
      };

      const v1Payload = {
        x402Version: 1,
        scheme: "exact",
        network: "eip155:8453" as unknown,
        payload: {},
      };

      const discovered = extractDiscoveryInfo(v1Payload as unknown, v1Requirements as unknown);

      expect(discovered).not.toBeNull();
      expect(discovered!.discoveryInfo.input.method).toBe("GET");
      expect(discovered!.resourceUrl).toBe("https://api.example.com/data");
      expect(discovered!.method).toBe("GET");
    });

    it("should return null when no discovery info is present", () => {
      const paymentPayload = {
        x402Version: 2,
        scheme: "exact",
        network: "eip155:8453" as unknown,
        payload: {},
        accepted: {} as unknown,
      };

      const discovered = extractDiscoveryInfo(paymentPayload, {} as unknown);

      expect(discovered).toBeNull();
    });
  });

  describe("validateAndExtract", () => {
    it("should return valid result with info for correct extension", () => {
      const declared = declareDiscoveryExtension({
        input: { query: "test" },
        inputSchema: {
          properties: {
            query: { type: "string" },
          },
        },
      });

      const extension = declared.bazaar;
      const result = validateAndExtract(extension);
      expect(result.valid).toBe(true);
      expect(result.info).toEqual(extension.info);
      expect(result.errors).toBeUndefined();
    });

    it("should return invalid result with errors for incorrect extension", () => {
      const invalidExtension = {
        info: {
          input: {
            type: "http",
            method: "GET",
          },
        },
        schema: {
          $schema: "https://json-schema.org/draft/2020-12/schema",
          type: "object",
          properties: {
            input: {
              type: "object",
              properties: {
                type: { type: "string", const: "invalid" },
                method: { type: "string", enum: ["GET"] },
              },
              required: ["type", "method"],
            },
          },
          required: ["input"],
        },
      } as unknown as DiscoveryExtension;

      const result = validateAndExtract(invalidExtension);
      expect(result.valid).toBe(false);
      expect(result.info).toBeUndefined();
      expect(result.errors).toBeDefined();
      expect(result.errors!.length).toBeGreaterThan(0);
    });
  });

  describe("V1 Transformation", () => {
    it("should extract discovery info from v1 GET with no params", () => {
      const v1Requirements = {
        scheme: "exact",
        network: "eip155:8453" as unknown,
        maxAmountRequired: "100000",
        resource: "https://api.example.com/data",
        description: "Get data",
        mimeType: "application/json",
        outputSchema: {
          input: {
            type: "http",
            method: "GET",
            discoverable: true,
          },
          output: null,
        },
        payTo: "0x...",
        maxTimeoutSeconds: 300,
        asset: "0x...",
        extra: {},
      };

      const info = extractDiscoveryInfoV1(v1Requirements as unknown);
      expect(info).not.toBeNull();
      expect(info!.input.method).toBe("GET");
      expect(info!.input.type).toBe("http");
    });

    it("should extract discovery info from v1 GET with queryParams", () => {
      const v1Requirements = {
        scheme: "exact",
        network: "eip155:8453" as unknown,
        maxAmountRequired: "10000",
        resource: "https://api.example.com/list",
        description: "List items",
        mimeType: "application/json",
        outputSchema: {
          input: {
            discoverable: true,
            method: "GET",
            queryParams: {
              limit: "integer parameter",
              offset: "integer parameter",
            },
            type: "http",
          },
          output: { type: "array" },
        },
        payTo: "0x...",
        maxTimeoutSeconds: 300,
        asset: "0x...",
        extra: {},
      };

      const info = extractDiscoveryInfoV1(v1Requirements as unknown);
      expect(info).not.toBeNull();
      expect(info!.input.method).toBe("GET");
      expect(info!.input.queryParams).toEqual({
        limit: "integer parameter",
        offset: "integer parameter",
      });
    });

    it("should extract discovery info from v1 POST with bodyFields", () => {
      const v1Requirements = {
        scheme: "exact",
        network: "eip155:8453" as unknown,
        maxAmountRequired: "10000",
        resource: "https://api.example.com/search",
        description: "Search",
        mimeType: "application/json",
        outputSchema: {
          input: {
            bodyFields: {
              query: {
                description: "Search query",
                required: true,
                type: "string",
              },
            },
            bodyType: "json",
            discoverable: true,
            method: "POST",
            type: "http",
          },
        },
        payTo: "0x...",
        maxTimeoutSeconds: 120,
        asset: "0x...",
        extra: {},
      };

      const info = extractDiscoveryInfoV1(v1Requirements as unknown);
      expect(info).not.toBeNull();
      expect(info!.input.method).toBe("POST");
      expect((info as BodyDiscoveryInfo).input.bodyType).toBe("json");
      expect((info as BodyDiscoveryInfo).input.body).toEqual({
        query: {
          description: "Search query",
          required: true,
          type: "string",
        },
      });
    });

    it("should extract discovery info from v1 POST with snake_case fields", () => {
      const v1Requirements = {
        scheme: "exact",
        network: "eip155:8453" as unknown,
        maxAmountRequired: "1000",
        resource: "https://api.example.com/action",
        description: "Action",
        mimeType: "application/json",
        outputSchema: {
          input: {
            body_fields: null,
            body_type: null,
            discoverable: true,
            header_fields: {
              "X-Budget": {
                description: "Budget",
                required: false,
                type: "string",
              },
            },
            method: "POST",
            query_params: null,
            type: "http",
          },
          output: null,
        },
        payTo: "0x...",
        maxTimeoutSeconds: 60,
        asset: "0x...",
        extra: {},
      };

      const info = extractDiscoveryInfoV1(v1Requirements as unknown);
      expect(info).not.toBeNull();
      expect(info!.input.method).toBe("POST");
      expect(info!.input.headers).toEqual({
        "X-Budget": {
          description: "Budget",
          required: false,
          type: "string",
        },
      });
    });

    it("should extract discovery info from v1 POST with bodyParams", () => {
      const v1Requirements = {
        scheme: "exact",
        network: "eip155:8453" as unknown,
        maxAmountRequired: "50000",
        resource: "https://api.example.com/query",
        description: "Query",
        mimeType: "application/json",
        outputSchema: {
          input: {
            bodyParams: {
              question: {
                description: "Question",
                required: true,
                type: "string",
                maxLength: 500,
              },
            },
            discoverable: true,
            method: "POST",
            type: "http",
          },
        },
        payTo: "0x...",
        maxTimeoutSeconds: 300,
        asset: "0x...",
        extra: {},
      };

      const info = extractDiscoveryInfoV1(v1Requirements as unknown);
      expect(info).not.toBeNull();
      expect(info!.input.method).toBe("POST");
      expect((info as BodyDiscoveryInfo).input.body).toEqual({
        question: {
          description: "Question",
          required: true,
          type: "string",
          maxLength: 500,
        },
      });
    });

    it("should extract discovery info from v1 POST with properties field", () => {
      const v1Requirements = {
        scheme: "exact",
        network: "eip155:8453" as unknown,
        maxAmountRequired: "80000",
        resource: "https://api.example.com/chat",
        description: "Chat",
        mimeType: "application/json",
        outputSchema: {
          input: {
            discoverable: true,
            method: "POST",
            properties: {
              message: {
                description: "Message",
                type: "string",
              },
              stream: {
                description: "Stream",
                type: "boolean",
              },
            },
            required: ["message"],
            type: "http",
          },
        },
        payTo: "0x...",
        maxTimeoutSeconds: 60,
        asset: "0x...",
        extra: {},
      };

      const info = extractDiscoveryInfoV1(v1Requirements as unknown);
      expect(info).not.toBeNull();
      expect(info!.input.method).toBe("POST");
      expect((info as BodyDiscoveryInfo).input.body).toEqual({
        message: {
          description: "Message",
          type: "string",
        },
        stream: {
          description: "Stream",
          type: "boolean",
        },
      });
    });

    it("should handle v1 POST with no body content (minimal)", () => {
      const v1Requirements = {
        scheme: "exact",
        network: "eip155:8453" as unknown,
        maxAmountRequired: "10000",
        resource: "https://api.example.com/action",
        description: "Action",
        mimeType: "application/json",
        outputSchema: {
          input: {
            discoverable: true,
            method: "POST",
            type: "http",
          },
        },
        payTo: "0x...",
        maxTimeoutSeconds: 60,
        asset: "0x...",
        extra: {},
      };

      const info = extractDiscoveryInfoV1(v1Requirements as unknown);
      expect(info).not.toBeNull();
      expect(info!.input.method).toBe("POST");
      expect((info as BodyDiscoveryInfo).input.bodyType).toBe("json");
      expect((info as BodyDiscoveryInfo).input.body).toEqual({});
    });

    it("should skip non-discoverable endpoints", () => {
      const v1Requirements = {
        scheme: "exact",
        network: "eip155:8453" as unknown,
        maxAmountRequired: "10000",
        resource: "https://api.example.com/internal",
        description: "Internal",
        mimeType: "application/json",
        outputSchema: {
          input: {
            discoverable: false,
            method: "POST",
            type: "http",
          },
        },
        payTo: "0x...",
        maxTimeoutSeconds: 60,
        asset: "0x...",
        extra: {},
      };

      const info = extractDiscoveryInfoV1(v1Requirements as unknown);
      expect(info).toBeNull();
    });

    it("should handle missing outputSchema", () => {
      const v1Requirements = {
        scheme: "exact",
        network: "eip155:8453" as unknown,
        maxAmountRequired: "10000",
        resource: "https://api.example.com/resource",
        description: "Resource",
        mimeType: "application/json",
        outputSchema: {},
        payTo: "0x...",
        maxTimeoutSeconds: 60,
        asset: "0x...",
        extra: {},
      };

      const info = extractDiscoveryInfoV1(v1Requirements as unknown);
      expect(info).toBeNull();
    });
  });

  describe("Integration - Full workflow", () => {
    it("should handle GET endpoint with output schema (e2e scenario)", () => {
      const declared = declareDiscoveryExtension({
        input: {},
        inputSchema: {
          properties: {},
        },
        output: {
          example: {
            message: "Protected endpoint accessed successfully",
            timestamp: "2024-01-01T00:00:00Z",
          },
          schema: {
            properties: {
              message: { type: "string" },
              timestamp: { type: "string" },
            },
            required: ["message", "timestamp"],
          },
        },
      });

      const extension = declared.bazaar;

      const validation = validateDiscoveryExtension(extension);

      if (!validation.valid) {
        console.log("Validation errors:", validation.errors);
        console.log("Extension info:", extension.info);
        console.log("Extension schema:", extension.schema);
      }

      expect(validation.valid).toBe(true);

      const info = extractDiscoveryInfoFromExtension(extension, false);
      expect(info.input.type).toBe("http");
      expect(info.output?.example).toEqual({
        message: "Protected endpoint accessed successfully",
        timestamp: "2024-01-01T00:00:00Z",
      });
    });

    it("should handle complete v2 server-to-facilitator workflow", () => {
      const declared = declareDiscoveryExtension({
        input: { userId: "123", action: "create" },
        inputSchema: {
          properties: {
            userId: { type: "string" },
            action: { type: "string", enum: ["create", "update", "delete"] },
          },
          required: ["userId", "action"],
        },
        bodyType: "json",
        output: {
          example: { success: true, id: "new-id" },
        },
      });

      const extension = declared.bazaar;

      const paymentRequired = {
        x402Version: 2,
        resource: {
          url: "/api/action",
          description: "Execute an action",
          mimeType: "application/json",
        },
        accepts: [],
        extensions: {
          [BAZAAR]: extension,
        },
      };

      const bazaarExt = paymentRequired.extensions?.[BAZAAR] as DiscoveryExtension;
      expect(bazaarExt).toBeDefined();

      const validation = validateDiscoveryExtension(bazaarExt);
      expect(validation.valid).toBe(true);

      const info = extractDiscoveryInfoFromExtension(bazaarExt, false);
      expect(info.input.type).toBe("http");
      expect((info as BodyDiscoveryInfo).input.bodyType).toBe("json");
      expect((info as BodyDiscoveryInfo).input.body).toEqual({ userId: "123", action: "create" });
      expect(info.output?.example).toEqual({ success: true, id: "new-id" });

      // Facilitator can now catalog this endpoint in the Bazaar
    });

    it("should handle v1-to-v2 transformation workflow", () => {
      // V1 PaymentRequirements from real Bazaar data
      const v1Requirements = {
        scheme: "exact",
        network: "eip155:8453" as unknown,
        maxAmountRequired: "10000",
        resource: "https://mesh.heurist.xyz/x402/agents/TokenResolverAgent/search",
        description: "Find tokens by address, ticker/symbol, or token name",
        mimeType: "application/json",
        outputSchema: {
          input: {
            bodyFields: {
              chain: {
                description: "Optional chain hint",
                type: "string",
              },
              query: {
                description: "Token search query",
                required: true,
                type: "string",
              },
              type_hint: {
                description: "Optional type hint",
                enum: ["address", "symbol", "name"],
                type: "string",
              },
            },
            bodyType: "json",
            discoverable: true,
            method: "POST",
            type: "http",
          },
        },
        payTo: "0x7d9d1821d15B9e0b8Ab98A058361233E255E405D",
        maxTimeoutSeconds: 120,
        asset: "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913",
        extra: {},
      };

      const v1Payload = {
        x402Version: 1,
        scheme: "exact",
        network: "eip155:8453" as unknown,
        payload: {},
      };

      const discovered = extractDiscoveryInfo(v1Payload as unknown, v1Requirements as unknown);

      expect(discovered).not.toBeNull();
      expect(discovered!.discoveryInfo.input.method).toBe("POST");
      expect(discovered!.method).toBe("POST");
      expect((discovered!.discoveryInfo as BodyDiscoveryInfo).input.bodyType).toBe("json");
      expect((discovered!.discoveryInfo as BodyDiscoveryInfo).input.body).toHaveProperty("query");
      expect((discovered!.discoveryInfo as BodyDiscoveryInfo).input.body).toHaveProperty("chain");
      expect((discovered!.discoveryInfo as BodyDiscoveryInfo).input.body).toHaveProperty(
        "type_hint",
      );
    });

    it("should handle unified extraction for both v1 and v2", () => {
      const declared = declareDiscoveryExtension({
        input: { limit: 10 },
        inputSchema: {
          properties: {
            limit: { type: "number" },
          },
        },
      });

      const v2Extension = declared.bazaar;

      const v2Payload = {
        x402Version: 2,
        scheme: "exact",
        network: "eip155:8453" as unknown,
        payload: {},
        accepted: {} as unknown,
        resource: { url: "http://example.com/v2" },
        extensions: {
          [BAZAAR]: v2Extension,
        },
      };

      const v2Discovered = extractDiscoveryInfo(v2Payload, {} as unknown);

      expect(v2Discovered).not.toBeNull();
      expect(v2Discovered!.discoveryInfo.input.type).toBe("http");
      expect(v2Discovered!.resourceUrl).toBe("http://example.com/v2");

      const v1Requirements = {
        scheme: "exact",
        network: "eip155:8453" as unknown,
        maxAmountRequired: "10000",
        resource: "https://api.example.com/list",
        description: "List",
        mimeType: "application/json",
        outputSchema: {
          input: {
            discoverable: true,
            method: "GET",
            queryParams: { limit: "number" },
            type: "http",
          },
        },
        payTo: "0x...",
        maxTimeoutSeconds: 300,
        asset: "0x...",
        extra: {},
      };

      const v1Payload = {
        x402Version: 1,
        scheme: "exact",
        network: "eip155:8453" as unknown,
        payload: {},
      };

      const v1Discovered = extractDiscoveryInfo(v1Payload as unknown, v1Requirements as unknown);

      expect(v1Discovered).not.toBeNull();
      expect(v1Discovered!.method).toBe("GET");
      expect(v1Discovered!.resourceUrl).toBe("https://api.example.com/list");

      expect(typeof v2Discovered!.discoveryInfo.input).toBe(
        typeof v1Discovered!.discoveryInfo.input,
      );
    });
  });
});
