import {
  paymentProxy as originalPaymentProxy,
  paymentProxyFromHTTPServer as originalPaymentProxyFromHTTPServer,
  withX402 as originalWithX402,
  withX402FromHTTPServer as originalWithX402FromHTTPServer,
  x402ResourceServer,
  x402HTTPResourceServer,
} from "@x402/next";
import { EventStorage, WorkflowTracker, EventType } from "@x402-observed/core";
import { AsyncLocalStorage } from "async_hooks";
import { existsSync, mkdirSync } from "fs";
import { join } from "path";

// Type inference to avoid Next.js version conflicts
type NextRequest = Parameters<ReturnType<typeof originalPaymentProxy>>[0];
type NextResponse = Awaited<ReturnType<ReturnType<typeof originalPaymentProxy>>>;

// AsyncLocalStorage to track workflow ID across async operations
const workflowStorage = new AsyncLocalStorage<string>();

// Shared storage and tracker instances
let storage: EventStorage | null = null;
let tracker: WorkflowTracker | null = null;
let initializationError: Error | null = null;

/**
 * Configuration for x402-observed
 */
export interface ObservabilityConfig {
  /**
   * Path to the SQLite database file.
   * Defaults to `.x402-observed/events.db` in the current working directory.
   */
  dbPath?: string;

  /**
   * Disable observability (useful for environments where SQLite doesn't work)
   * Defaults to false.
   */
  disabled?: boolean;
}

// Global config
let globalConfig: ObservabilityConfig = {};

/**
 * Configure x402-observed globally
 * Call this before using any observed middleware/wrappers
 */
export function configureObservability(config: ObservabilityConfig) {
  globalConfig = { ...globalConfig, ...config };
}

/**
 * Initialize storage and tracker (lazy initialization with error handling)
 */
function initializeObservability(): { storage: EventStorage; tracker: WorkflowTracker } | null {
  // If disabled, return null
  if (globalConfig.disabled) {
    return null;
  }

  // If already initialized, return existing instances
  if (storage && tracker) {
    return { storage, tracker };
  }

  // If initialization previously failed, don't retry
  if (initializationError) {
    console.warn("[x402-observed] Observability disabled due to initialization error:", initializationError.message);
    return null;
  }

  try {
    // Determine database path
    let dbPath: string;
    if (globalConfig.dbPath) {
      dbPath = globalConfig.dbPath;
    } else {
      // Default: .x402-observed/events.db in project root
      const cwd = process.cwd();
      const dbDir = join(cwd, ".x402-observed");

      // Create directory if it doesn't exist
      if (!existsSync(dbDir)) {
        mkdirSync(dbDir, { recursive: true });
      }

      dbPath = join(dbDir, "events.db");
    }

    // Initialize storage and tracker
    storage = new EventStorage(dbPath);
    storage.initialize();
    tracker = new WorkflowTracker(storage);

    console.log("[x402-observed] Observability initialized with database at:", dbPath);
    return { storage, tracker };
  } catch (error) {
    initializationError = error as Error;
    console.error("[x402-observed] Failed to initialize observability:", error);
    console.warn("[x402-observed] Continuing without observability. Payment processing will work normally.");
    return null;
  }
}

/**
 * Register hooks on the x402ResourceServer to intercept verify/settle calls
 */
function registerServerHooks(server: x402ResourceServer) {
  const initialized = initializeObservability();
  if (!initialized) {
    // Observability disabled or failed to initialize
    return;
  }

  const { tracker } = initialized;

  server
    .onBeforeVerify(async (context) => {
      const workflowId = workflowStorage.getStore();
      if (workflowId) {
        const timestamp = Date.now();
        tracker.logEvent(workflowId, EventType.VERIFY_CALLED, timestamp, {
          paymentPayload: context.paymentPayload,
          paymentRequirements: context.requirements,
        });
      }
    })
    .onAfterVerify(async (context) => {
      const workflowId = workflowStorage.getStore();
      if (workflowId) {
        const timestamp = Date.now();
        tracker.logEvent(workflowId, EventType.VERIFY_RESULT, timestamp, {
          isValid: context.result.isValid,
          reason: context.result.invalidReason,
          duration: 0,
        });
      }
    })
    .onBeforeSettle(async (context) => {
      const workflowId = workflowStorage.getStore();
      if (workflowId) {
        const timestamp = Date.now();
        tracker.logEvent(workflowId, EventType.SETTLE_CALLED, timestamp, {
          paymentPayload: context.paymentPayload,
          paymentRequirements: context.requirements,
        });
      }
    })
    .onAfterSettle(async (context) => {
      const workflowId = workflowStorage.getStore();
      if (workflowId) {
        const timestamp = Date.now();
        tracker.logEvent(workflowId, EventType.SETTLE_RESULT, timestamp, {
          success: context.result.success,
          txHash: context.result.transaction,
          network: context.result.network,
          duration: 0,
        });
      }
    });
}

/**
 * Wrap a Next.js proxy handler to add observability
 */
function wrapProxyHandler(
  originalHandler: (req: NextRequest) => Promise<NextResponse>,
): (req: NextRequest) => Promise<NextResponse> {
  return async (req: NextRequest): Promise<NextResponse> => {
    const initialized = initializeObservability();

    // If observability is disabled or failed, just run the original handler
    if (!initialized) {
      return await originalHandler(req);
    }

    const { tracker } = initialized;

    // Create workflow and log request_received
    const workflowId = tracker.createWorkflow();
    const requestTimestamp = Date.now();

    tracker.logEvent(workflowId, EventType.REQUEST_RECEIVED, requestTimestamp, {
      method: req.method,
      path: req.nextUrl.pathname,
    });

    // Detect payment header
    const paymentHeader = req.headers.get("payment-signature") || req.headers.get("x-payment");
    if (paymentHeader) {
      const timestamp = Date.now();
      tracker.logEvent(workflowId, EventType.PAYMENT_HEADER_RECEIVED, timestamp, {
        paymentHeader,
      });
    }

    // Run the original handler within the workflow context
    const workflowStartTime = Date.now();
    const response = await workflowStorage.run(workflowId, async () => {
      return await originalHandler(req);
    });

    // Log based on response status
    const timestamp = Date.now();
    const totalDuration = timestamp - workflowStartTime;

    if (response.status === 402) {
      tracker.logEvent(workflowId, EventType.PAYMENT_REQUIRED, timestamp, {
        statusCode: 402,
      });
    } else if (response.status === 200) {
      tracker.logEvent(workflowId, EventType.WORKFLOW_COMPLETED, timestamp, {
        statusCode: 200,
        totalDuration,
      });
      tracker.completeWorkflow(workflowId);
    } else if (response.status >= 400) {
      tracker.logEvent(workflowId, EventType.WORKFLOW_COMPLETED, timestamp, {
        statusCode: response.status,
        totalDuration,
      });
    }

    return response;
  };
}

/**
 * Next.js payment proxy with observability (direct server instance).
 *
 * Drop-in replacement for @x402/next paymentProxy that adds
 * transparent logging of all payment workflow events to a local SQLite database.
 *
 * Function signature is identical to the original @x402/next paymentProxy.
 *
 * @param routes - Route configurations for protected endpoints
 * @param server - Pre-configured x402ResourceServer instance
 * @param paywallConfig - Optional configuration for the built-in paywall UI
 * @param paywall - Optional custom paywall provider (overrides default)
 * @param syncFacilitatorOnStart - Whether to sync with the facilitator on startup (defaults to true)
 * @returns Next.js proxy handler
 */
export function paymentProxy(
  routes: Parameters<typeof originalPaymentProxy>[0],
  server: x402ResourceServer,
  paywallConfig?: Parameters<typeof originalPaymentProxy>[2],
  paywall?: Parameters<typeof originalPaymentProxy>[3],
  syncFacilitatorOnStart: boolean = true,
) {
  // Register hooks on the server
  registerServerHooks(server);

  // Get the original proxy handler
  const originalHandler = originalPaymentProxy(
    routes,
    server,
    paywallConfig,
    paywall,
    syncFacilitatorOnStart,
  );

  // Return wrapped handler
  return wrapProxyHandler(originalHandler);
}

/**
 * Next.js payment proxy with observability (HTTP server instance).
 *
 * Drop-in replacement for @x402/next paymentProxyFromHTTPServer that adds
 * transparent logging of all payment workflow events.
 *
 * @param httpServer - Pre-configured x402HTTPResourceServer instance
 * @param paywallConfig - Optional configuration for the built-in paywall UI
 * @param paywall - Optional custom paywall provider (overrides default)
 * @param syncFacilitatorOnStart - Whether to sync with the facilitator on startup (defaults to true)
 * @returns Next.js proxy handler
 */
export function paymentProxyFromHTTPServer(
  httpServer: x402HTTPResourceServer,
  paywallConfig?: Parameters<typeof originalPaymentProxyFromHTTPServer>[1],
  paywall?: Parameters<typeof originalPaymentProxyFromHTTPServer>[2],
  syncFacilitatorOnStart: boolean = true,
) {
  // Register hooks on the underlying server
  registerServerHooks(httpServer.server);

  // Get the original proxy handler
  const originalHandler = originalPaymentProxyFromHTTPServer(
    httpServer,
    paywallConfig,
    paywall,
    syncFacilitatorOnStart,
  );

  // Return wrapped handler
  return wrapProxyHandler(originalHandler);
}

/**
 * Wraps a Next.js App Router API route handler with x402 payment protection and observability.
 *
 * Drop-in replacement for @x402/next withX402 that adds transparent logging
 * of all payment workflow events.
 *
 * @param routeHandler - The API route handler function to wrap
 * @param routeConfig - Payment configuration for this specific route
 * @param server - Pre-configured x402ResourceServer instance
 * @param paywallConfig - Optional configuration for the built-in paywall UI
 * @param paywall - Optional custom paywall provider (overrides default)
 * @param syncFacilitatorOnStart - Whether to sync with the facilitator on startup (defaults to true)
 * @returns A wrapped Next.js route handler
 */
export function withX402(
  routeHandler: Parameters<typeof originalWithX402>[0],
  routeConfig: Parameters<typeof originalWithX402>[1],
  server: x402ResourceServer,
  paywallConfig?: Parameters<typeof originalWithX402>[3],
  paywall?: Parameters<typeof originalWithX402>[4],
  syncFacilitatorOnStart: boolean = true,
): ReturnType<typeof originalWithX402> {
  // Register hooks on the server
  registerServerHooks(server);

  // Get the original wrapped handler
  const originalWrappedHandler = originalWithX402(
    routeHandler,
    routeConfig,
    server,
    paywallConfig,
    paywall,
    syncFacilitatorOnStart,
  );

  // Return wrapped handler with observability
  return async (request: NextRequest): Promise<any> => {
    const initialized = initializeObservability();

    // If observability is disabled or failed, just run the original handler
    if (!initialized) {
      return await originalWrappedHandler(request);
    }

    const { tracker } = initialized;

    // Create workflow and log request_received
    const workflowId = tracker.createWorkflow();
    const requestTimestamp = Date.now();

    tracker.logEvent(workflowId, EventType.REQUEST_RECEIVED, requestTimestamp, {
      method: request.method,
      path: request.nextUrl.pathname,
    });

    // Detect payment header
    const paymentHeader = request.headers.get("payment-signature") || request.headers.get("x-payment");
    if (paymentHeader) {
      const timestamp = Date.now();
      tracker.logEvent(workflowId, EventType.PAYMENT_HEADER_RECEIVED, timestamp, {
        paymentHeader,
      });
    }

    // Run the original handler within the workflow context
    const workflowStartTime = Date.now();
    const response = await workflowStorage.run(workflowId, async () => {
      return await originalWrappedHandler(request);
    });

    // Log based on response status
    const timestamp = Date.now();
    const totalDuration = timestamp - workflowStartTime;

    if (response.status === 402) {
      tracker.logEvent(workflowId, EventType.PAYMENT_REQUIRED, timestamp, {
        statusCode: 402,
      });
    } else if (response.status === 200) {
      tracker.logEvent(workflowId, EventType.WORKFLOW_COMPLETED, timestamp, {
        statusCode: 200,
        totalDuration,
      });
      tracker.completeWorkflow(workflowId);
    } else if (response.status >= 400) {
      tracker.logEvent(workflowId, EventType.WORKFLOW_COMPLETED, timestamp, {
        statusCode: response.status,
        totalDuration,
      });
    }

    return response;
  };
}

/**
 * Wraps a Next.js App Router API route handler with x402 payment protection and observability (HTTP server instance).
 *
 * Drop-in replacement for @x402/next withX402FromHTTPServer that adds transparent logging
 * of all payment workflow events.
 *
 * @param routeHandler - The API route handler function to wrap
 * @param httpServer - Pre-configured x402HTTPResourceServer instance
 * @param paywallConfig - Optional configuration for the built-in paywall UI
 * @param paywall - Optional custom paywall provider (overrides default)
 * @param syncFacilitatorOnStart - Whether to sync with the facilitator on startup (defaults to true)
 * @returns A wrapped Next.js route handler
 */
export function withX402FromHTTPServer(
  routeHandler: Parameters<typeof originalWithX402FromHTTPServer>[0],
  httpServer: x402HTTPResourceServer,
  paywallConfig?: Parameters<typeof originalWithX402FromHTTPServer>[2],
  paywall?: Parameters<typeof originalWithX402FromHTTPServer>[3],
  syncFacilitatorOnStart: boolean = true,
): ReturnType<typeof originalWithX402FromHTTPServer> {
  // Register hooks on the underlying server
  registerServerHooks(httpServer.server);

  // Get the original wrapped handler
  const originalWrappedHandler = originalWithX402FromHTTPServer(
    routeHandler,
    httpServer,
    paywallConfig,
    paywall,
    syncFacilitatorOnStart,
  );

  // Return wrapped handler with observability
  return async (request: NextRequest): Promise<any> => {
    const initialized = initializeObservability();

    // If observability is disabled or failed, just run the original handler
    if (!initialized) {
      return await originalWrappedHandler(request);
    }

    const { tracker } = initialized;

    // Create workflow and log request_received
    const workflowId = tracker.createWorkflow();
    const requestTimestamp = Date.now();

    tracker.logEvent(workflowId, EventType.REQUEST_RECEIVED, requestTimestamp, {
      method: request.method,
      path: request.nextUrl.pathname,
    });

    // Detect payment header
    const paymentHeader = request.headers.get("payment-signature") || request.headers.get("x-payment");
    if (paymentHeader) {
      const timestamp = Date.now();
      tracker.logEvent(workflowId, EventType.PAYMENT_HEADER_RECEIVED, timestamp, {
        paymentHeader,
      });
    }

    // Run the original handler within the workflow context
    const workflowStartTime = Date.now();
    const response = await workflowStorage.run(workflowId, async () => {
      return await originalWrappedHandler(request);
    });

    // Log based on response status
    const timestamp = Date.now();
    const totalDuration = timestamp - workflowStartTime;

    if (response.status === 402) {
      tracker.logEvent(workflowId, EventType.PAYMENT_REQUIRED, timestamp, {
        statusCode: 402,
      });
    } else if (response.status === 200) {
      tracker.logEvent(workflowId, EventType.WORKFLOW_COMPLETED, timestamp, {
        statusCode: 200,
        totalDuration,
      });
      tracker.completeWorkflow(workflowId);
    } else if (response.status >= 400) {
      tracker.logEvent(workflowId, EventType.WORKFLOW_COMPLETED, timestamp, {
        statusCode: response.status,
        totalDuration,
      });
    }

    return response;
  };
}
