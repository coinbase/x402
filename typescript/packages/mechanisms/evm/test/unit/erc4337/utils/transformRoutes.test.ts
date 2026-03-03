import { describe, expect, it, vi, beforeEach } from "vitest";
import type { RouteConfig, RoutesConfig } from "@x402/core/server";
import type { PaymentOption, DynamicPrice } from "@x402/core/http";
import type { Network, Price, AssetAmount } from "@x402/core/types";
import type { ExactEvmSchemeERC4337 } from "../../../../src/exact/server/erc4337";
import {
  transformRoutesForUserOperation,
  transformRouteForUserOperation,
} from "../../../../src/exact/utils/transformRoutes";

describe("transformRoutesForUserOperation", () => {
  let mockSchemeServer: ExactEvmSchemeERC4337;

  beforeEach(() => {
    vi.clearAllMocks();

    mockSchemeServer = {
      parsePrice: vi.fn().mockResolvedValue({
        amount: "1000000",
        asset: "0x036CbD53842c5426634e7929541eC2318f3dCF7e",
        extra: { name: "USDC", version: "2" },
      }),
    } as unknown as ExactEvmSchemeERC4337;
  });

  describe("with single RouteConfig", () => {
    it("should transform a single RouteConfig with accepts array", async () => {
      const route: RouteConfig = {
        accepts: [
          {
            scheme: "exact",
            network: "eip155:84532" as Network,
            price: "$1.00",
            extra: {
              userOperation: {
                supported: true,
                bundlerUrl: "https://bundler.example.com",
              },
            },
          },
        ],
      };

      const result = await transformRoutesForUserOperation(route, mockSchemeServer);

      // Should be a RouteConfig (single route)
      expect("accepts" in result).toBe(true);
      const transformed = result as RouteConfig;
      const accepts = transformed.accepts as PaymentOption[];
      expect(accepts).toHaveLength(1);
      // userOperation should be moved from option.extra to price.extra
      expect(accepts[0].extra).toBeUndefined();
    });

    it("should transform a single RouteConfig with single PaymentOption", async () => {
      const route: RouteConfig = {
        accepts: {
          scheme: "exact",
          network: "eip155:84532" as Network,
          price: "$1.00",
          extra: {
            userOperation: {
              supported: true,
              bundlerUrl: "https://bundler.example.com",
            },
          },
        },
      };

      const result = await transformRoutesForUserOperation(route, mockSchemeServer);

      expect("accepts" in result).toBe(true);
      const transformed = result as RouteConfig;
      const accept = transformed.accepts as PaymentOption;
      // userOperation should be moved from option.extra to price.extra
      expect(accept.extra).toBeUndefined();
    });
  });

  describe("with Record<string, RouteConfig>", () => {
    it("should transform all routes in a Record<string, RouteConfig>", async () => {
      const routes: Record<string, RouteConfig> = {
        "/api/resource1": {
          accepts: [
            {
              scheme: "exact",
              network: "eip155:84532" as Network,
              price: "$1.00",
              extra: {
                userOperation: {
                  supported: true,
                  bundlerUrl: "https://bundler1.example.com",
                },
              },
            },
          ],
        },
        "/api/resource2": {
          accepts: [
            {
              scheme: "exact",
              network: "eip155:8453" as Network,
              price: "$2.00",
              extra: {
                userOperation: {
                  supported: true,
                  bundlerUrl: "https://bundler2.example.com",
                },
              },
            },
          ],
        },
      };

      const result = await transformRoutesForUserOperation(routes, mockSchemeServer);

      const transformed = result as Record<string, RouteConfig>;
      expect(Object.keys(transformed)).toEqual(["/api/resource1", "/api/resource2"]);
      // Each route should be transformed
      for (const routeConfig of Object.values(transformed)) {
        const accepts = routeConfig.accepts as PaymentOption[];
        expect(accepts[0].extra).toBeUndefined();
      }
    });
  });
});

describe("transformRouteForUserOperation", () => {
  let mockSchemeServer: ExactEvmSchemeERC4337;

  beforeEach(() => {
    vi.clearAllMocks();

    mockSchemeServer = {
      parsePrice: vi.fn().mockResolvedValue({
        amount: "1000000",
        asset: "0x036CbD53842c5426634e7929541eC2318f3dCF7e",
        extra: { name: "USDC", version: "2" },
      }),
    } as unknown as ExactEvmSchemeERC4337;
  });

  it("should handle a single PaymentOption (not array)", async () => {
    const route: RouteConfig = {
      accepts: {
        scheme: "exact",
        network: "eip155:84532" as Network,
        price: "$1.00",
        extra: {
          userOperation: {
            supported: true,
            bundlerUrl: "https://bundler.example.com",
          },
        },
      },
    };

    const result = await transformRouteForUserOperation(route, mockSchemeServer);

    const accept = result.accepts as PaymentOption;
    // userOperation should be moved from option.extra
    expect(accept.extra).toBeUndefined();
    // Price should now have userOperation in its extra
    const price = accept.price as AssetAmount;
    expect(price.extra).toBeDefined();
    expect(price.extra!.userOperation).toEqual({
      supported: true,
      bundlerUrl: "https://bundler.example.com",
    });
  });

  it("should handle an array of PaymentOptions", async () => {
    const route: RouteConfig = {
      accepts: [
        {
          scheme: "exact",
          network: "eip155:84532" as Network,
          price: "$1.00",
          extra: {
            userOperation: {
              supported: true,
              bundlerUrl: "https://bundler.example.com",
            },
          },
        },
        {
          scheme: "exact",
          network: "eip155:8453" as Network,
          price: "$2.00",
          extra: {
            userOperation: {
              supported: true,
              bundlerUrl: "https://bundler2.example.com",
            },
          },
        },
      ],
    };

    const result = await transformRouteForUserOperation(route, mockSchemeServer);

    const accepts = result.accepts as PaymentOption[];
    expect(accepts).toHaveLength(2);
    // Both options should have userOperation moved to price.extra
    for (const accept of accepts) {
      expect(accept.extra).toBeUndefined();
      const price = accept.price as AssetAmount;
      expect(price.extra).toBeDefined();
      expect(price.extra!.userOperation).toBeDefined();
      expect((price.extra!.userOperation as { supported: boolean }).supported).toBe(true);
    }
  });
});

describe("transformPaymentOption (via transformRouteForUserOperation)", () => {
  let mockSchemeServer: ExactEvmSchemeERC4337;

  beforeEach(() => {
    vi.clearAllMocks();

    mockSchemeServer = {
      parsePrice: vi.fn().mockResolvedValue({
        amount: "1000000",
        asset: "0x036CbD53842c5426634e7929541eC2318f3dCF7e",
        extra: { name: "USDC", version: "2" },
      }),
    } as unknown as ExactEvmSchemeERC4337;
  });

  it("should move userOperation from option.extra to price.extra", async () => {
    const route: RouteConfig = {
      accepts: {
        scheme: "exact",
        network: "eip155:84532" as Network,
        price: "$1.00",
        extra: {
          userOperation: {
            supported: true,
            bundlerUrl: "https://bundler.example.com",
            entrypoint: "0x5FF137D4b0FDCD49DcA30c7CF57E578a026d2789",
          },
        },
      },
    };

    const result = await transformRouteForUserOperation(route, mockSchemeServer);

    const accept = result.accepts as PaymentOption;
    // userOperation should be removed from option.extra
    expect(accept.extra).toBeUndefined();
    // Price should have userOperation in its extra
    const price = accept.price as AssetAmount;
    expect(price.extra!.userOperation).toEqual({
      supported: true,
      bundlerUrl: "https://bundler.example.com",
      entrypoint: "0x5FF137D4b0FDCD49DcA30c7CF57E578a026d2789",
    });
  });

  it("should return unchanged when no userOperation in option.extra", async () => {
    const route: RouteConfig = {
      accepts: {
        scheme: "exact",
        network: "eip155:84532" as Network,
        price: "$1.00",
      },
    };

    const result = await transformRouteForUserOperation(route, mockSchemeServer);

    const accept = result.accepts as PaymentOption;
    // Price should remain a string since there's no userOperation to inject
    expect(accept.price).toBe("$1.00");
    expect(accept.extra).toBeUndefined();
  });

  it("should return unchanged when userOperation.supported is false", async () => {
    const route: RouteConfig = {
      accepts: {
        scheme: "exact",
        network: "eip155:84532" as Network,
        price: "$1.00",
        extra: {
          userOperation: {
            supported: false,
          },
        },
      },
    };

    const result = await transformRouteForUserOperation(route, mockSchemeServer);

    const accept = result.accepts as PaymentOption;
    // Price should remain unchanged
    expect(accept.price).toBe("$1.00");
    // extra should still have the original userOperation
    expect(accept.extra!.userOperation).toEqual({ supported: false });
  });

  it("should remove userOperation from option.extra after transformation", async () => {
    const route: RouteConfig = {
      accepts: {
        scheme: "exact",
        network: "eip155:84532" as Network,
        price: "$1.00",
        extra: {
          customField: "customValue",
          userOperation: {
            supported: true,
            bundlerUrl: "https://bundler.example.com",
          },
        },
      },
    };

    const result = await transformRouteForUserOperation(route, mockSchemeServer);

    const accept = result.accepts as PaymentOption;
    // extra should have customField but not userOperation
    expect(accept.extra).toBeDefined();
    expect(accept.extra!.customField).toBe("customValue");
    expect(accept.extra!.userOperation).toBeUndefined();
  });

  it("should set extra to undefined when userOperation was the only field", async () => {
    const route: RouteConfig = {
      accepts: {
        scheme: "exact",
        network: "eip155:84532" as Network,
        price: "$1.00",
        extra: {
          userOperation: {
            supported: true,
            bundlerUrl: "https://bundler.example.com",
          },
        },
      },
    };

    const result = await transformRouteForUserOperation(route, mockSchemeServer);

    const accept = result.accepts as PaymentOption;
    // extra should be undefined since userOperation was the only field
    expect(accept.extra).toBeUndefined();
  });
});

describe("transformPrice (via transformRouteForUserOperation)", () => {
  let mockSchemeServer: ExactEvmSchemeERC4337;

  beforeEach(() => {
    vi.clearAllMocks();

    mockSchemeServer = {
      parsePrice: vi.fn().mockResolvedValue({
        amount: "1000000",
        asset: "0x036CbD53842c5426634e7929541eC2318f3dCF7e",
        extra: { name: "USDC", version: "2" },
      }),
    } as unknown as ExactEvmSchemeERC4337;
  });

  it("should handle static price (string)", async () => {
    const route: RouteConfig = {
      accepts: {
        scheme: "exact",
        network: "eip155:84532" as Network,
        price: "$1.00",
        extra: {
          userOperation: {
            supported: true,
            bundlerUrl: "https://bundler.example.com",
          },
        },
      },
    };

    const result = await transformRouteForUserOperation(route, mockSchemeServer);

    const accept = result.accepts as PaymentOption;
    const price = accept.price as AssetAmount;
    // parsePrice should have been called to convert string to AssetAmount
    expect(mockSchemeServer.parsePrice).toHaveBeenCalledWith("$1.00", "eip155:84532");
    expect(price.amount).toBe("1000000");
    expect(price.asset).toBe("0x036CbD53842c5426634e7929541eC2318f3dCF7e");
    expect(price.extra!.userOperation).toEqual({
      supported: true,
      bundlerUrl: "https://bundler.example.com",
    });
  });

  it("should handle DynamicPrice function", async () => {
    const dynamicPrice: DynamicPrice = vi.fn().mockResolvedValue({
      amount: "2000000",
      asset: "0x036CbD53842c5426634e7929541eC2318f3dCF7e",
      extra: { name: "USDC" },
    } as AssetAmount);

    const route: RouteConfig = {
      accepts: {
        scheme: "exact",
        network: "eip155:84532" as Network,
        price: dynamicPrice,
        extra: {
          userOperation: {
            supported: true,
            bundlerUrl: "https://bundler.example.com",
          },
        },
      },
    };

    const result = await transformRouteForUserOperation(route, mockSchemeServer);

    const accept = result.accepts as PaymentOption;
    // Price should be a function (DynamicPrice)
    expect(typeof accept.price).toBe("function");

    // Call the transformed dynamic price function
    const mockContext = { request: new Request("https://example.com") };
    const resolvedPrice = await (accept.price as DynamicPrice)(mockContext as any);

    // The resolved price should have userOperation injected
    const priceObj = resolvedPrice as AssetAmount;
    expect(priceObj.amount).toBe("2000000");
    expect(priceObj.extra!.userOperation).toEqual({
      supported: true,
      bundlerUrl: "https://bundler.example.com",
    });
    // The original dynamic price function should have been called
    expect(dynamicPrice).toHaveBeenCalledWith(mockContext);
  });
});

describe("injectUserOperationIntoPrice (via transformRouteForUserOperation)", () => {
  let mockSchemeServer: ExactEvmSchemeERC4337;

  beforeEach(() => {
    vi.clearAllMocks();

    mockSchemeServer = {
      parsePrice: vi.fn().mockResolvedValue({
        amount: "1000000",
        asset: "0x036CbD53842c5426634e7929541eC2318f3dCF7e",
        extra: { name: "USDC", version: "2" },
      }),
    } as unknown as ExactEvmSchemeERC4337;
  });

  it("should handle AssetAmount object directly", async () => {
    const assetAmount: AssetAmount = {
      amount: "5000000",
      asset: "0x036CbD53842c5426634e7929541eC2318f3dCF7e",
      extra: { name: "USDC" },
    };

    const route: RouteConfig = {
      accepts: {
        scheme: "exact",
        network: "eip155:84532" as Network,
        price: assetAmount,
        extra: {
          userOperation: {
            supported: true,
            bundlerUrl: "https://bundler.example.com",
          },
        },
      },
    };

    const result = await transformRouteForUserOperation(route, mockSchemeServer);

    const accept = result.accepts as PaymentOption;
    const price = accept.price as AssetAmount;
    // Should not call parsePrice since it's already an AssetAmount
    expect(mockSchemeServer.parsePrice).not.toHaveBeenCalled();
    expect(price.amount).toBe("5000000");
    expect(price.asset).toBe("0x036CbD53842c5426634e7929541eC2318f3dCF7e");
    expect(price.extra!.name).toBe("USDC");
    expect(price.extra!.userOperation).toEqual({
      supported: true,
      bundlerUrl: "https://bundler.example.com",
    });
  });

  it("should call parsePrice for string/number price", async () => {
    const route: RouteConfig = {
      accepts: {
        scheme: "exact",
        network: "eip155:84532" as Network,
        price: "$3.50",
        extra: {
          userOperation: {
            supported: true,
            bundlerUrl: "https://bundler.example.com",
          },
        },
      },
    };

    const result = await transformRouteForUserOperation(route, mockSchemeServer);

    expect(mockSchemeServer.parsePrice).toHaveBeenCalledWith("$3.50", "eip155:84532");
    const accept = result.accepts as PaymentOption;
    const price = accept.price as AssetAmount;
    expect(price.extra!.userOperation).toBeDefined();
  });
});
