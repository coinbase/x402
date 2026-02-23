/**
 * Event types and interfaces for x402 workflow observability.
 */

/**
 * Event type enum representing all possible workflow events.
 */
export enum EventType {
  REQUEST_RECEIVED = "request_received",
  PAYMENT_REQUIRED = "payment_required",
  PAYMENT_HEADER_RECEIVED = "payment_header_received",
  VERIFY_CALLED = "verify_called",
  VERIFY_RESULT = "verify_result",
  SETTLE_CALLED = "settle_called",
  SETTLE_RESULT = "settle_result",
  WORKFLOW_COMPLETED = "workflow_completed",
}

/**
 * Workflow event interface.
 */
export interface WorkflowEvent {
  id: string;
  workflowId: string;
  eventType: EventType;
  timestamp: number;
  data: Record<string, unknown>;
}

/**
 * Workflow interface.
 */
export interface Workflow {
  id: string;
  createdAt: number;
  updatedAt: number;
  status: "pending" | "completed" | "failed";
  events: WorkflowEvent[];
}
