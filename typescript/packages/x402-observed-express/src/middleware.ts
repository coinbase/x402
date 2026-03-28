import {
  paymentMiddleware as originalMiddleware,
  x402ResourceServer,
} from "@x402/express";
import type { Request, Response, NextFunction } from "express";
import { EventStorage, WorkflowTracker, EventType } from "@x402-observed/core";
import path from "path";
import fs from "fs";
import { AsyncLocalStorage } from "async_hooks";

// AsyncLocalStorage to track workflow ID across async operations
const workflowStorage = new AsyncLocalStorage<string>();

/**
 * Payment middleware with observability.
 *
 * Drop-in replacement for @x402/express paymentMiddleware that adds
 * transparent logging of all payment workflow events to a local SQLite database.
 *
 * Function signature is identical to the original @x402/express paymentMiddleware.
 *
 * @param routes - Route configurations for protected endpoints
 * @param server - Pre-configured x402ResourceServer instance
 * @param paywallConfig - Optional configuration for the built-in paywall UI
 * @param paywall - Optional custom paywall provider (overrides default)
 * @param syncFacilitatorOnStart - Whether to sync with the facilitator on startup (defaults to true)
 * @returns Express middleware handler
 */
export function paymentMiddleware(
  routes: Parameters<typeof originalMiddleware>[0],
  server: x402ResourceServer,
  paywallConfig?: Parameters<typeof originalMiddleware>[2],
  paywall?: Parameters<typeof originalMiddleware>[3],
  syncFacilitatorOnStart: boolean = true,
) {
  // Initialize storage at .x402-observed/events.db in project root
  const dbDir = path.join(process.cwd(), ".x402-observed");
  const dbPath = path.join(dbDir, "events.db");

  // Ensure directory exists
  if (!fs.existsSync(dbDir)) {
    fs.mkdirSync(dbDir, { recursive: true });
  }

  const storage = new EventStorage(dbPath);
  storage.initialize();

  // Create workflow tracker
  const tracker = new WorkflowTracker(storage);

  // Register hooks on the server to intercept verify/settle calls
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
          duration: 0, // Duration tracking would require storing start time
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
          duration: 0, // Duration tracking would require storing start time
        });
      }
    });

  // Get the original middleware
  const original = originalMiddleware(
    routes,
    server,
    paywallConfig,
    paywall,
    syncFacilitatorOnStart,
  );

  // Return wrapped middleware
  return async (req: Request, res: Response, next: NextFunction) => {
    // Create workflow and log request_received
    const workflowId = tracker.createWorkflow();
    const requestTimestamp = Date.now();

    tracker.logEvent(workflowId, EventType.REQUEST_RECEIVED, requestTimestamp, {
      method: req.method,
      path: req.path,
    });

    // Intercept res.status() to detect 402 responses
    const originalStatus = res.status.bind(res);
    res.status = function (code: number) {
      if (code === 402) {
        const timestamp = Date.now();
        tracker.logEvent(workflowId, EventType.PAYMENT_REQUIRED, timestamp, {
          statusCode: 402,
        });
      }
      return originalStatus(code);
    } as typeof res.status;

    // Detect payment header
    const paymentHeader = req.headers["payment-signature"] || req.headers["x-payment"];
    if (paymentHeader) {
      const timestamp = Date.now();
      tracker.logEvent(workflowId, EventType.PAYMENT_HEADER_RECEIVED, timestamp, {
        paymentHeader: String(paymentHeader),
      });
    }

    // Listen to response finish event to log workflow_completed
    const workflowStartTime = Date.now();
    res.on("finish", () => {
      if (res.statusCode === 200) {
        const timestamp = Date.now();
        const totalDuration = timestamp - workflowStartTime;
        tracker.logEvent(workflowId, EventType.WORKFLOW_COMPLETED, timestamp, {
          statusCode: 200,
          totalDuration,
        });
        tracker.completeWorkflow(workflowId);
      } else if (res.statusCode >= 400) {
        // Mark workflow as failed for error responses
        const timestamp = Date.now();
        tracker.logEvent(workflowId, EventType.WORKFLOW_COMPLETED, timestamp, {
          statusCode: res.statusCode,
          totalDuration: timestamp - workflowStartTime,
        });
      }
    });

    // Run the original middleware within the workflow context
    await workflowStorage.run(workflowId, async () => {
      await original(req, res, next);
    });
  };
}
