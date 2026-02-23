/**
 * Simple test script to verify the CLI server works
 */

import { EventStorage, WorkflowTracker } from "@x402-observed/core";

// Create test database with sample data
const storage = new EventStorage(".x402-observed/events.db");
storage.initialize();

const tracker = new WorkflowTracker(storage);

// Create a sample workflow
const workflowId = tracker.createWorkflow();
const now = Date.now();

// Add some sample events
tracker.logEvent(workflowId, "request_received", now, {
  method: "GET",
  path: "/api/test",
});

tracker.logEvent(workflowId, "payment_required", now + 100, {
  statusCode: 402,
});

tracker.logEvent(workflowId, "payment_header_received", now + 200, {
  paymentHeader: "test-payment-header",
});

tracker.logEvent(workflowId, "verify_called", now + 300, {});

tracker.logEvent(workflowId, "verify_result", now + 400, {
  isValid: true,
  duration: 100,
});

tracker.logEvent(workflowId, "settle_called", now + 500, {});

tracker.logEvent(workflowId, "settle_result", now + 600, {
  success: true,
  txHash: "0x1234567890abcdef",
  duration: 100,
});

tracker.logEvent(workflowId, "workflow_completed", now + 700, {
  statusCode: 200,
  totalDuration: 700,
});

tracker.completeWorkflow(workflowId);

console.log("✅ Test database created with sample workflow");
console.log(`   Workflow ID: ${workflowId}`);
console.log(`   Events: 8`);
console.log("\nNow run: node dist/index.js");
console.log("Then visit: http://localhost:4402");
