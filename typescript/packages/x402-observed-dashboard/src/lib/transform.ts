import type {
  WorkflowEvent,
  EventType,
  Workflow as APIWorkflow,
} from "@x402-observed/core";
import type {
  Workflow,
  WorkflowStep,
  StepStatus,
  WorkflowStatus,
} from "./mock-data";

/**
 * Map x402 event types to human-readable step names
 */
const EVENT_TO_STEP_NAME: Record<EventType, string> = {
  request_received: "Request Received",
  payment_required: "Payment Required (402)",
  payment_header_received: "Payment Header Received",
  verify_called: "Verify Payment",
  verify_result: "Verification Result",
  settle_called: "Settle Payment",
  settle_result: "Settlement Result",
  workflow_completed: "Workflow Completed",
};

/**
 * Determine step status from event
 */
function eventToStepStatus(event: WorkflowEvent): StepStatus {
  // Check for failures
  if (event.eventType === "verify_result") {
    const data = event.data as { isValid?: boolean };
    if (data.isValid === false) return "failed";
  }

  if (event.eventType === "settle_result") {
    const data = event.data as { success?: boolean };
    if (data.success === false) return "failed";
  }

  // Workflow completed is always success
  if (event.eventType === "workflow_completed") {
    return "success";
  }

  // All other events are successful
  return "success";
}

/**
 * Transform API workflow to dashboard format
 */
export function transformWorkflow(apiWorkflow: APIWorkflow): Workflow {
  return {
    id: apiWorkflow.id,
    triggerType: "agent", // Default - not in x402 events
    status: apiWorkflow.status as WorkflowStatus,
    startedAt: new Date(apiWorkflow.createdAt).toISOString(),
    completedAt: apiWorkflow.updatedAt
      ? new Date(apiWorkflow.updatedAt).toISOString()
      : undefined,
    steps: apiWorkflow.events.map((event) => transformEvent(event)),
  };
}

/**
 * Transform a single event to a workflow step
 */
function transformEvent(event: WorkflowEvent): WorkflowStep {
  const step: WorkflowStep = {
    id: event.id,
    name: EVENT_TO_STEP_NAME[event.eventType],
    timestamp: new Date(event.timestamp).toISOString(),
    status: eventToStepStatus(event),
  };

  // Extract transaction hash from settle_result
  if (event.eventType === "settle_result") {
    const data = event.data as { txHash?: string };
    if (data.txHash) {
      step.transactionHash = data.txHash;
    }
  }

  // Extract error messages
  if (event.eventType === "verify_result") {
    const data = event.data as { reason?: string };
    if (data.reason) {
      step.errorMessage = data.reason;
    }
  }

  if (event.eventType === "settle_result") {
    const data = event.data as { errorMessage?: string };
    if (data.errorMessage) {
      step.errorMessage = data.errorMessage;
    }
  }

  // Extract duration
  if (
    event.eventType === "verify_result" ||
    event.eventType === "settle_result"
  ) {
    const data = event.data as { duration?: number };
    if (data.duration !== undefined) {
      step.duration = `${(data.duration / 1000).toFixed(1)}s`;
    }
  }

  if (event.eventType === "workflow_completed") {
    const data = event.data as { totalDuration?: number };
    if (data.totalDuration !== undefined) {
      step.duration = `${(data.totalDuration / 1000).toFixed(1)}s`;
    }
  }

  return step;
}
