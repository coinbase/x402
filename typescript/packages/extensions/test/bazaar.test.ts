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
      const extension = declareDiscoveryExtension({
        method: "GET",
        input: { query: "test", limit: 10 },
        inputSchema: {
          properties: {
            query: { type: "string" },
            limit: { type: "number" },
          },
          required: ["query"],
        },
      });

      expect(extension).toHaveProperty("info");
      expect(extension).toHaveProperty("schema");
      expect(extension.info.input.method).toBe("GET");
      expect(extension.info.input.type).toBe("http");
      expect(extension.info.input.queryParams).toEqual({ query: "test", limit: 10 });
    });

    it("should create a GET extension with output example", () => {
      const outputExample = { results: [], total: 0 };
      const extension = declareDiscoveryExtension({
        method: "GET",
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

      expect(extension.info.output?.example).toEqual(outputExample);
    });
  });

  describe("declareDiscoveryExtension - POST method", () => {
    it("should create a valid POST extension with JSON body", () => {
      const extension = declareDiscoveryExtension({
        method: "POST",
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

      expect(extension.info.input.method).toBe("POST");
      expect(extension.info.input.type).toBe("http");
      expect((extension.info as BodyDiscoveryInfo).input.bodyType).toBe("json");
      expect((extension.info as BodyDiscoveryInfo).input.body).toEqual({ name: "John", age: 30 });
    });

    it("should default to JSON body type if not specified", () => {
      const extension = declareDiscoveryExtension({
        method: "POST",
        input: { data: "test" },
        inputSchema: {
          properties: {
            data: { type: "string" },
          },
        },
      });

      expect((extension.info as BodyDiscoveryInfo).input.bodyType).toBe("json");
    });

    it("should support form-data body type", () => {
      const extension = declareDiscoveryExtension({
        method: "POST",
        input: { file: "upload.pdf" },
        inputSchema: {
          properties: {
            file: { type: "string" },
          },
        },
        bodyType: "form-data",
      });

      expect((extension.info as BodyDiscoveryInfo).input.bodyType).toBe("form-data");
    });
  });

  describe("declareDiscoveryExtension - Other methods", () => {
    it("should create a valid PUT extension", () => {
      const extension = declareDiscoveryExtension({
        method: "PUT",
        input: { id: "123", name: "Updated" },
        inputSchema: {
          properties: {
            id: { type: "string" },
            name: { type: "string" },
          },
        },
      });

      expect(extension.info.input.method).toBe("PUT");
    });

    it("should create a valid PATCH extension", () => {
      const extension = declareDiscoveryExtension({
        method: "PATCH",
        input: { status: "active" },
        inputSchema: {
          properties: {
            status: { type: "string" },
          },
        },
      });

      expect(extension.info.input.method).toBe("PATCH");
    });

    it("should create a valid DELETE extension", () => {
      const extension = declareDiscoveryExtension({
        method: "DELETE",
        input: { id: "123" },
        inputSchema: {
          properties: {
            id: { type: "string" },
          },
        },
      });

      expect(extension.info.input.method).toBe("DELETE");
    });

    it("should create a valid HEAD extension", () => {
      const extension = declareDiscoveryExtension({
        method: "HEAD",
      });

      expect(extension.info.input.method).toBe("HEAD");
    });

    it("should throw error for unsupported method", () => {
      expect(() => {
        declareDiscoveryExtension({
          method: "INVALID" as any,
        });
      }).toThrow("Unsupported HTTP method: INVALID");
    });
  });

  describe("validateDiscoveryExtension", () => {
    it("should validate a correct GET extension", () => {
      const extension = declareDiscoveryExtension(
        "GET",
        { query: "test" },
        {
          properties: {
            query: { type: "string" },
          },
        }
      );

      const result = validateDiscoveryExtension(extension);
      expect(result.valid).toBe(true);
      expect(result.errors).toBeUndefined();
    });

    it("should validate a correct POST extension", () => {
      const extension = declareDiscoveryExtension(
        "POST",
        { name: "John" },
        {
          properties: {
            name: { type: "string" },
          },
        }
      );

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
      const extension = declareDiscoveryExtension(
        "GET",
        { query: "test" },
        {
          properties: {
            query: { type: "string" },
          },
        }
      );

      const info = extractDiscoveryInfoFromExtension(extension);
      expect(info).toEqual(extension.info);
      expect(info.input.method).toBe("GET");
      expect(info.input.type).toBe("http");
    });

    it("should extract info without validation when validate=false", () => {
      const extension = declareDiscoveryExtension(
        "POST",
        { name: "John" },
        {
          properties: {
            name: { type: "string" },
          },
        }
      );

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
      const extension = declareDiscoveryExtension(
        "POST",
        { userId: "123" },
        {
          properties: {
            userId: { type: "string" },
          },
        }
      );

      const paymentPayload = {
        x402Version: 2,
        scheme: "exact",
        network: "eip155:8453" as any,
        payload: {},
        accepted: {} as any,
        extensions: {
          [BAZAAR]: extension,
        },
      };

      const info = extractDiscoveryInfo(paymentPayload, {} as any);

      expect(info).not.toBeNull();
      expect(info!.input.method).toBe("POST");
      expect(info!.input.type).toBe("http");
    });

    it("should extract info from v1 PaymentRequirements", () => {
      const v1Requirements = {
        scheme: "exact",
        network: "eip155:8453" as any,
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
        network: "eip155:8453" as any,
        payload: {},
      };

      const info = extractDiscoveryInfo(v1Payload as any, v1Requirements as any);

      expect(info).not.toBeNull();
      expect(info!.input.method).toBe("GET");
      expect(info!.input.type).toBe("http");
    });

    it("should return null when no discovery info is present", () => {
      const paymentPayload = {
        x402Version: 2,
        scheme: "exact",
        network: "eip155:8453" as any,
        payload: {},
        accepted: {} as any,
      };

      const info = extractDiscoveryInfo(paymentPayload, {} as any);

      expect(info).toBeNull();
    });
  });

  describe("validateAndExtract", () => {
    it("should return valid result with info for correct extension", () => {
      const extension = declareDiscoveryExtension(
        "GET",
        { query: "test" },
        {
          properties: {
            query: { type: "string" },
          },
        }
      );

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
        network: "eip155:8453" as any,
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

      const info = extractDiscoveryInfoV1(v1Requirements as any);
      expect(info).not.toBeNull();
      expect(info!.input.method).toBe("GET");
      expect(info!.input.type).toBe("http");
    });

    it("should extract discovery info from v1 GET with queryParams", () => {
      const v1Requirements = {
        scheme: "exact",
        network: "eip155:8453" as any,
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

      const info = extractDiscoveryInfoV1(v1Requirements as any);
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
        network: "eip155:8453" as any,
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

      const info = extractDiscoveryInfoV1(v1Requirements as any);
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
        network: "eip155:8453" as any,
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

      const info = extractDiscoveryInfoV1(v1Requirements as any);
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
        network: "eip155:8453" as any,
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

      const info = extractDiscoveryInfoV1(v1Requirements as any);
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
        network: "eip155:8453" as any,
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

      const info = extractDiscoveryInfoV1(v1Requirements as any);
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
        network: "eip155:8453" as any,
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

      const info = extractDiscoveryInfoV1(v1Requirements as any);
      expect(info).not.toBeNull();
      expect(info!.input.method).toBe("POST");
      expect((info as BodyDiscoveryInfo).input.bodyType).toBe("json");
      expect((info as BodyDiscoveryInfo).input.body).toEqual({});
    });

    it("should skip non-discoverable endpoints", () => {
      const v1Requirements = {
        scheme: "exact",
        network: "eip155:8453" as any,
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

      const info = extractDiscoveryInfoV1(v1Requirements as any);
      expect(info).toBeNull();
    });

    it("should handle missing outputSchema", () => {
      const v1Requirements = {
        scheme: "exact",
        network: "eip155:8453" as any,
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

      const info = extractDiscoveryInfoV1(v1Requirements as any);
      expect(info).toBeNull();
    });
  });

  describe("Integration - Full workflow", () => {
    it("should handle GET endpoint with output schema (e2e scenario)", () => {
      // This reproduces the exact scenario from e2e tests
      const extension = declareDiscoveryExtension(
        "GET",
        {}, // No query params
        {
          properties: {},
        },
        {
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
        }
      );

      // Validate the extension
      const validation = validateDiscoveryExtension(extension);

      // Debug: print validation errors if any
      if (!validation.valid) {
        console.log("Validation errors:", validation.errors);
        console.log("Extension info:", JSON.stringify(extension.info, null, 2));
        console.log("Extension schema:", JSON.stringify(extension.schema, null, 2));
      }

      expect(validation.valid).toBe(true);

      // Extract info
      const info = extractDiscoveryInfoFromExtension(extension, false);
      expect(info.input.method).toBe("GET");
      expect(info.output?.example).toEqual({
        message: "Protected endpoint accessed successfully",
        timestamp: "2024-01-01T00:00:00Z",
      });
    });

    it("should handle complete v2 server-to-facilitator workflow", () => {
      // 1. Server declares extension
      const extension = declareDiscoveryExtension(
        "POST",
        { userId: "123", action: "create" },
        {
          properties: {
            userId: { type: "string" },
            action: { type: "string", enum: ["create", "update", "delete"] },
          },
          required: ["userId", "action"],
        },
        {
          bodyType: "json",
          output: {
            example: { success: true, id: "new-id" },
          },
        }
      );

      // 2. Server includes in PaymentRequired
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

      // 3. Facilitator receives and validates
      const bazaarExt = paymentRequired.extensions?.[BAZAAR] as DiscoveryExtension;
      expect(bazaarExt).toBeDefined();

      const validation = validateDiscoveryExtension(bazaarExt);
      expect(validation.valid).toBe(true);

      // 4. Facilitator extracts info for cataloging using the extension directly
      const info = extractDiscoveryInfoFromExtension(bazaarExt, false);
      expect(info.input.method).toBe("POST");
      expect((info as BodyDiscoveryInfo).input.bodyType).toBe("json");
      expect((info as BodyDiscoveryInfo).input.body).toEqual({ userId: "123", action: "create" });
      expect(info.output?.example).toEqual({ success: true, id: "new-id" });

      // Facilitator can now catalog this endpoint in the Bazaar
    });

    it("should handle v1-to-v2 transformation workflow", () => {
      // V1 PaymentRequirements from real Bazaar data
      const v1Requirements = {
        scheme: "exact",
        network: "eip155:8453" as any,
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
        network: "eip155:8453" as any,
        payload: {},
      };

      // Facilitator extracts v1 info and transforms to v2
      const info = extractDiscoveryInfo(v1Payload as any, v1Requirements as any);

      expect(info).not.toBeNull();
      expect(info!.input.method).toBe("POST");
      expect(info!.input.type).toBe("http");
      expect((info as BodyDiscoveryInfo).input.bodyType).toBe("json");
      expect((info as BodyDiscoveryInfo).input.body).toHaveProperty("query");
      expect((info as BodyDiscoveryInfo).input.body).toHaveProperty("chain");
      expect((info as BodyDiscoveryInfo).input.body).toHaveProperty("type_hint");
    });

    it("should handle unified extraction for both v1 and v2", () => {
      // V2 case - extensions are in PaymentPayload
      const v2Extension = declareDiscoveryExtension(
        {
          method: "GET",
          input: { limit: 10 },
          inputSchema: {
            properties: {
              limit: { type: "number" },
            },
          },
        }
      );

      const v2Payload = {
        x402Version: 2,
        scheme: "exact",
        network: "eip155:8453" as any,
        payload: {},
        accepted: {} as any,
        extensions: {
          [BAZAAR]: v2Extension,
        },
      };

      const v2Info = extractDiscoveryInfo(v2Payload, {} as any);

      expect(v2Info).not.toBeNull();
      expect(v2Info!.input.method).toBe("GET");

      // V1 case - discovery info is in PaymentRequirements.outputSchema
      const v1Requirements = {
        scheme: "exact",
        network: "eip155:8453" as any,
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
        network: "eip155:8453" as any,
        payload: {},
      };

      const v1Info = extractDiscoveryInfo(v1Payload as any, v1Requirements as any);

      expect(v1Info).not.toBeNull();
      expect(v1Info!.input.method).toBe("GET");

      // Both v1 and v2 return the same DiscoveryInfo structure
      expect(typeof v2Info!.input).toBe(typeof v1Info!.input);
    });
  });
});

