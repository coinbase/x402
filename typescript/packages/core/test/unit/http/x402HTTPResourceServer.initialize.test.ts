import { describe, it, expect, beforeEach, vi, afterEach } from "vitest";
import { x402ResourceServer } from "../../../src/server/x402ResourceServer";
import {
  x402HTTPResourceServer,
  RouteConfigurationError,
} from "../../../src/http/x402HTTPResourceServer";
import { RoutesConfig } from "../../../src/http/x402HTTPResourceServer";
import { Network } from "../../../src/types";
import {
  MockFacilitatorClient,
  MockSchemeNetworkServer,
  buildSupportedResponse,
} from "../../mocks";

describe("x402HTTPResourceServer.initialize", () => {
  let server: x402ResourceServer;
  let mockClient: MockFacilitatorClient;
  let mockScheme: MockSchemeNetworkServer;

  const testNetwork = "eip155:84532" as Network;
  const testScheme = "exact";

  beforeEach(() => {
    mockScheme = new MockSchemeNetworkServer(testScheme);
  });

  describe("with properly configured server", () => {
    beforeEach(() => {
      mockClient = new MockFacilitatorClient(
        buildSupportedResponse({
          kinds: [{ x402Version: 2, scheme: testScheme, network: testNetwork }],
        }),
      );
      server = new x402ResourceServer(mockClient);
      server.register(testNetwork, mockScheme);
    });

    it("should initialize successfully with valid routes", async () => {
      const routes: RoutesConfig = {
        "GET /api/data": {
          accepts: {
            scheme: testScheme,
            payTo: "0x123",
            price: "$0.01",
            network: testNetwork,
          },
          description: "Test endpoint",
        },
      };

      const httpServer = new x402HTTPResourceServer(server, routes);

      await expect(httpServer.initialize()).resolves.not.toThrow();
    });

    it("should initialize with array of payment options", async () => {
      const routes: RoutesConfig = {
        "GET /api/data": {
          accepts: [
            {
              scheme: testScheme,
              payTo: "0x123",
              price: "$0.01",
              network: testNetwork,
            },
          ],
          description: "Test endpoint",
        },
      };

      const httpServer = new x402HTTPResourceServer(server, routes);

      await expect(httpServer.initialize()).resolves.not.toThrow();
    });

    it("should initialize with single route config format", async () => {
      const routes: RoutesConfig = {
        accepts: {
          scheme: testScheme,
          payTo: "0x123",
          price: "$0.01",
          network: testNetwork,
        },
        description: "Test endpoint",
      };

      const httpServer = new x402HTTPResourceServer(server, routes);

      await expect(httpServer.initialize()).resolves.not.toThrow();
    });
  });

  describe("with missing scheme registration", () => {
    beforeEach(() => {
      mockClient = new MockFacilitatorClient(
        buildSupportedResponse({
          kinds: [{ x402Version: 2, scheme: testScheme, network: testNetwork }],
        }),
      );
      server = new x402ResourceServer(mockClient);
      // Note: NOT registering the scheme
    });

    it("should throw RouteConfigurationError for unregistered scheme", async () => {
      const routes: RoutesConfig = {
        "GET /api/data": {
          accepts: {
            scheme: testScheme,
            payTo: "0x123",
            price: "$0.01",
            network: testNetwork,
          },
          description: "Test endpoint",
        },
      };

      const httpServer = new x402HTTPResourceServer(server, routes);

      await expect(httpServer.initialize()).rejects.toThrow(RouteConfigurationError);

      try {
        await httpServer.initialize();
      } catch (error) {
        expect(error).toBeInstanceOf(RouteConfigurationError);
        const configError = error as RouteConfigurationError;
        expect(configError.errors).toHaveLength(1);
        expect(configError.errors[0].reason).toBe("missing_scheme");
        expect(configError.errors[0].routePattern).toBe("GET /api/data");
        expect(configError.errors[0].message).toContain("No scheme implementation registered");
      }
    });
  });

  describe("with missing facilitator support", () => {
    beforeEach(() => {
      mockClient = new MockFacilitatorClient(
        buildSupportedResponse({
          kinds: [{ x402Version: 2, scheme: "other-scheme", network: testNetwork }],
        }),
      );
      server = new x402ResourceServer(mockClient);
      server.register(testNetwork, mockScheme);
    });

    it("should throw RouteConfigurationError for unsupported facilitator", async () => {
      const routes: RoutesConfig = {
        "POST /api/payment": {
          accepts: {
            scheme: testScheme,
            payTo: "0x123",
            price: "$0.01",
            network: testNetwork,
          },
          description: "Test endpoint",
        },
      };

      const httpServer = new x402HTTPResourceServer(server, routes);

      await expect(httpServer.initialize()).rejects.toThrow(RouteConfigurationError);

      try {
        await httpServer.initialize();
      } catch (error) {
        expect(error).toBeInstanceOf(RouteConfigurationError);
        const configError = error as RouteConfigurationError;
        expect(configError.errors).toHaveLength(1);
        expect(configError.errors[0].reason).toBe("missing_facilitator");
        expect(configError.errors[0].routePattern).toBe("POST /api/payment");
        expect(configError.errors[0].message).toContain("Facilitator does not support");
      }
    });
  });

  describe("with multiple routes and payment options", () => {
    const solanaNetwork = "solana:mainnet" as Network;
    let solanaScheme: MockSchemeNetworkServer;

    beforeEach(() => {
      solanaScheme = new MockSchemeNetworkServer("exact");
      mockClient = new MockFacilitatorClient(
        buildSupportedResponse({
          kinds: [
            { x402Version: 2, scheme: testScheme, network: testNetwork },
            { x402Version: 2, scheme: "exact", network: solanaNetwork },
          ],
        }),
      );
      server = new x402ResourceServer(mockClient);
      server.register(testNetwork, mockScheme);
      server.register(solanaNetwork, solanaScheme);
    });

    it("should validate all routes and payment options", async () => {
      const routes: RoutesConfig = {
        "GET /api/data": {
          accepts: [
            {
              scheme: testScheme,
              payTo: "0x123",
              price: "$0.01",
              network: testNetwork,
            },
            {
              scheme: "exact",
              payTo: "solana_address",
              price: "$0.01",
              network: solanaNetwork,
            },
          ],
          description: "Multi-chain endpoint",
        },
        "POST /api/other": {
          accepts: {
            scheme: testScheme,
            payTo: "0x456",
            price: "$0.02",
            network: testNetwork,
          },
          description: "Another endpoint",
        },
      };

      const httpServer = new x402HTTPResourceServer(server, routes);

      await expect(httpServer.initialize()).resolves.not.toThrow();
    });

    it("should collect errors from multiple routes", async () => {
      const unsupportedNetwork = "unsupported:network" as Network;

      const routes: RoutesConfig = {
        "GET /api/valid": {
          accepts: {
            scheme: testScheme,
            payTo: "0x123",
            price: "$0.01",
            network: testNetwork,
          },
          description: "Valid endpoint",
        },
        "GET /api/invalid": {
          accepts: {
            scheme: testScheme,
            payTo: "0x456",
            price: "$0.01",
            network: unsupportedNetwork,
          },
          description: "Invalid endpoint",
        },
      };

      const httpServer = new x402HTTPResourceServer(server, routes);

      try {
        await httpServer.initialize();
        expect.fail("Should have thrown");
      } catch (error) {
        expect(error).toBeInstanceOf(RouteConfigurationError);
        const configError = error as RouteConfigurationError;
        expect(configError.errors).toHaveLength(1);
        expect(configError.errors[0].routePattern).toBe("GET /api/invalid");
      }
    });
  });

  describe("RouteConfigurationError", () => {
    it("should have formatted error message", async () => {
      mockClient = new MockFacilitatorClient(buildSupportedResponse());
      server = new x402ResourceServer(mockClient);

      const routes: RoutesConfig = {
        "GET /api/test": {
          accepts: {
            scheme: "exact",
            payTo: "0x123",
            price: "$0.01",
            network: "eip155:84532" as Network,
          },
          description: "Test",
        },
      };

      const httpServer = new x402HTTPResourceServer(server, routes);

      try {
        await httpServer.initialize();
        expect.fail("Should have thrown");
      } catch (error) {
        expect(error).toBeInstanceOf(RouteConfigurationError);
        const configError = error as RouteConfigurationError;
        expect(configError.name).toBe("RouteConfigurationError");
        expect(configError.message).toContain("x402 Route Configuration Errors:");
        expect(configError.message).toContain("GET /api/test");
      }
    });
  });

  describe("bazaar extension validation", () => {
    let warnSpy: ReturnType<typeof vi.spyOn>;

    // Mock the dynamic import of @x402/extensions/bazaar/facilitator
    // Since @x402/extensions is not a dependency of @x402/core, we provide
    // an inline validation function that performs basic JSON schema validation.
    const mockValidateDiscoveryExtension = (ext: { info: unknown; schema: unknown }) => {
      const schema = ext.schema as Record<string, unknown>;
      const info = ext.info as Record<string, unknown>;

      if (!schema || !info) {
        return { valid: false, errors: ["Missing schema or info"] };
      }

      // Validate info against schema's required properties (top-level + one level deep)
      const errors: string[] = [];
      const required = schema.required as string[] | undefined;
      const properties = schema.properties as Record<string, Record<string, unknown>> | undefined;

      if (required) {
        for (const key of required) {
          if (!(key in info)) {
            errors.push(`(root): must have required property '${key}'`);
          }
        }
      }

      if (properties) {
        for (const [key, propSchema] of Object.entries(properties)) {
          const nestedRequired = propSchema?.required as string[] | undefined;
          const nestedObj = info[key] as Record<string, unknown> | undefined;
          if (nestedRequired && nestedObj && typeof nestedObj === "object") {
            for (const k of nestedRequired) {
              if (!(k in nestedObj)) {
                errors.push(`/${key}: must have required property '${k}'`);
              }
            }
          }
        }
      }

      return errors.length > 0 ? { valid: false, errors } : { valid: true };
    };

    beforeEach(() => {
      mockClient = new MockFacilitatorClient(
        buildSupportedResponse({
          kinds: [{ x402Version: 2, scheme: testScheme, network: testNetwork }],
        }),
      );
      server = new x402ResourceServer(mockClient);
      server.register(testNetwork, mockScheme);
      warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});

      // Mock the dynamic import so it resolves with our mock validator
      vi.doMock("@x402/extensions/bazaar/facilitator", () => ({
        validateDiscoveryExtension: mockValidateDiscoveryExtension,
      }));
    });

    afterEach(() => {
      warnSpy.mockRestore();
      vi.doUnmock("@x402/extensions/bazaar/facilitator");
    });

    it("should not warn for valid bazaar extension", async () => {
      const routes: RoutesConfig = {
        "GET /api/jobs": {
          accepts: {
            scheme: testScheme,
            payTo: "0x123",
            price: "$0.01",
            network: testNetwork,
          },
          extensions: {
            bazaar: {
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
                      type: { type: "string", const: "http" },
                      method: { type: "string", enum: ["GET"] },
                    },
                    required: ["type", "method"],
                  },
                },
                required: ["input"],
              },
            },
          },
        },
      };

      const httpServer = new x402HTTPResourceServer(server, routes);
      await httpServer.initialize();

      expect(warnSpy).not.toHaveBeenCalled();
    });

    it("should warn for invalid bazaar extension but still start", async () => {
      const routes: RoutesConfig = {
        "GET /api/jobs": {
          accepts: {
            scheme: testScheme,
            payTo: "0x123",
            price: "$0.01",
            network: testNetwork,
          },
          extensions: {
            bazaar: {
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
                      type: { type: "string", const: "http" },
                      method: { type: "string", enum: ["GET"] },
                    },
                    required: ["type", "method"],
                  },
                  output: {
                    type: "object",
                    properties: {
                      jobs: { type: "array" },
                      count: { type: "number" },
                    },
                    required: ["jobs", "count"],
                  },
                },
                required: ["input", "output"],
              },
            },
          },
        },
      };

      const httpServer = new x402HTTPResourceServer(server, routes);

      // Should NOT throw - warnings only
      await expect(httpServer.initialize()).resolves.not.toThrow();

      // Should have emitted a warning
      expect(warnSpy).toHaveBeenCalled();
      const warnMessage = warnSpy.mock.calls[0][0] as string;
      expect(warnMessage).toContain("[x402] Bazaar extension validation warning");
    });

    it("should not validate routes without bazaar extension", async () => {
      const routes: RoutesConfig = {
        "GET /api/data": {
          accepts: {
            scheme: testScheme,
            payTo: "0x123",
            price: "$0.01",
            network: testNetwork,
          },
          description: "No bazaar extension",
        },
      };

      const httpServer = new x402HTTPResourceServer(server, routes);
      await httpServer.initialize();

      expect(warnSpy).not.toHaveBeenCalled();
    });

    it("should catch bug: schema requires output fields not present in info", async () => {
      const routes: RoutesConfig = {
        "GET /api/jobs": {
          accepts: {
            scheme: testScheme,
            payTo: "0x123",
            price: "$0.01",
            network: testNetwork,
          },
          extensions: {
            bazaar: {
              info: {
                input: {
                  type: "http",
                  method: "GET",
                },
                output: {
                  jobs: [{ title: "Engineer" }],
                  // Missing "count" field required by schema
                },
              },
              schema: {
                $schema: "https://json-schema.org/draft/2020-12/schema",
                type: "object",
                properties: {
                  input: {
                    type: "object",
                    properties: {
                      type: { type: "string", const: "http" },
                      method: { type: "string", enum: ["GET"] },
                    },
                    required: ["type", "method"],
                  },
                  output: {
                    type: "object",
                    properties: {
                      jobs: { type: "array" },
                      count: { type: "number" },
                    },
                    required: ["jobs", "count"],
                  },
                },
                required: ["input", "output"],
              },
            },
          },
        },
      };

      const httpServer = new x402HTTPResourceServer(server, routes);

      // Server should still start
      await expect(httpServer.initialize()).resolves.not.toThrow();

      // But should warn about the missing "count" field
      expect(warnSpy).toHaveBeenCalled();
      const warnMessage = warnSpy.mock.calls[0][0] as string;
      expect(warnMessage).toContain("[x402] Bazaar extension validation warning");
    });
  });
});
