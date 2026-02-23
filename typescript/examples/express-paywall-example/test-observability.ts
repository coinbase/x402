/**
 * Test script to verify observability is working
 * This simulates the workflow events without needing a working facilitator
 */

import { EventStorage, WorkflowTracker, EventType } from "../../packages/x402-observed-core/dist/esm/index.mjs";
import path from "path";
import fs from "fs";

// Initialize storage
const dbDir = path.join(process.cwd(), ".x402-observed");
const dbPath = path.join(dbDir, "events.db");

// Ensure directory exists
if (!fs.existsSync(dbDir)) {
  fs.mkdirSync(dbDir, { recursive: true });
}

const storage = new EventStorage(dbPath);
storage.initialize();

const tracker = new WorkflowTracker(storage);

console.log("🧪 Testing x402-observed observability...\n");

// Simulate a complete payment workflow
const workflowId = tracker.createWorkflow();
console.log(`✅ Created workflow: ${workflowId}`);

// 1. Request received
tracker.logEvent(workflowId, EventType.REQUEST_RECEIVED, Date.now(), {
  method: "GET",
  path: "/api/premium",
});
console.log("✅ Logged: request_received");

// 2. Payment required (402 response)
tracker.logEvent(workflowId, EventType.PAYMENT_REQUIRED, Date.now(), {
  statusCode: 402,
});
console.log("✅ Logged: payment_required");

// 3. Payment header received
tracker.logEvent(workflowId, EventType.PAYMENT_HEADER_RECEIVED, Date.now(), {
  paymentHeader: "mock-payment-signature",
});
console.log("✅ Logged: payment_header_received");

// 4. Verify called
tracker.logEvent(workflowId, EventType.VERIFY_CALLED, Date.now(), {
  paymentPayload: { mock: "payload" },
  paymentRequirements: { price: "$0.001" },
});
console.log("✅ Logged: verify_called");

// 5. Verify result
tracker.logEvent(workflowId, EventType.VERIFY_RESULT, Date.now(), {
  isValid: true,
  duration: 150,
});
console.log("✅ Logged: verify_result");

// 6. Settle called
tracker.logEvent(workflowId, EventType.SETTLE_CALLED, Date.now(), {
  paymentPayload: { mock: "payload" },
  paymentRequirements: { price: "$0.001" },
});
console.log("✅ Logged: settle_called");

// 7. Settle result (with transaction hash!)
tracker.logEvent(workflowId, EventType.SETTLE_RESULT, Date.now(), {
  success: true,
  txHash: "0x1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef",
  network: "eip155:84532",
  duration: 2500,
});
console.log("✅ Logged: settle_result (with txHash)");

// 8. Workflow completed
tracker.logEvent(workflowId, EventType.WORKFLOW_COMPLETED, Date.now(), {
  statusCode: 200,
  totalDuration: 3000,
});
console.log("✅ Logged: workflow_completed");

tracker.completeWorkflow(workflowId);
console.log("✅ Workflow marked as complete");

// Query the data back
console.log("\n📊 Querying workflows from database...\n");
const workflows = storage.getAllWorkflows();
console.log(`Found ${workflows.length} workflow(s)`);

workflows.forEach((workflow) => {
  console.log(`\nWorkflow ID: ${workflow.id}`);
  console.log(`Status: ${workflow.status}`);
  console.log(`Events: ${workflow.events.length}`);
  workflow.events.forEach((event) => {
    console.log(`  - ${event.eventType} at ${new Date(event.timestamp).toISOString()}`);
  });
});

console.log("\n✅ Observability test complete!");
console.log("\n📁 Database location: .x402-observed/events.db");
console.log("🚀 Run 'npx x402-observed' to view in dashboard");

storage.close();
