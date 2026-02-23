import type { PaymentPayload, PaymentRequirements } from "@x402/core/types";

/**
 * Event types in the x402 payment workflow
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
 * Base workflow event structure
 */
export interface WorkflowEvent {
  id: string;
  workflowId: string;
  eventType: EventType;
  timestamp: number; // Unix timestamp in milliseconds
  data: EventData;
}

/**
 * Union type of all possible event data
 */
export type EventData =
  | RequestReceivedData
  | PaymentRequiredData
  | PaymentHeaderReceivedData
  | VerifyCalledData
  | VerifyResultData
  | SettleCalledData
  | SettleResultData
  | WorkflowCompletedData;

/**
 * Data for request_received event
 */
export interface RequestReceivedData {
  method: string;
  path: string;
  headers?: Record<string, string>;
}

/**
 * Data for payment_required event
 */
export interface PaymentRequiredData {
  statusCode: 402;
  paymentRequired?: unknown; // PaymentRequired type from @x402/core
}

/**
 * Data for payment_header_received event
 */
export interface PaymentHeaderReceivedData {
  paymentHeader: string;
}

/**
 * Data for verify_called event
 */
export interface VerifyCalledData {
  paymentPayload: PaymentPayload;
  paymentRequirements: PaymentRequirements;
}

/**
 * Data for verify_result event
 */
export interface VerifyResultData {
  isValid: boolean;
  reason?: string;
  duration: number; // milliseconds
}

/**
 * Data for settle_called event
 */
export interface SettleCalledData {
  paymentPayload: PaymentPayload;
  paymentRequirements: PaymentRequirements;
}

/**
 * Data for settle_result event
 */
export interface SettleResultData {
  success: boolean;
  txHash?: string;
  network?: string;
  duration: number; // milliseconds
  errorMessage?: string;
}

/**
 * Data for workflow_completed event
 */
export interface WorkflowCompletedData {
  statusCode: 200;
  totalDuration: number; // milliseconds
}

/**
 * Workflow status
 */
export type WorkflowStatus = "pending" | "completed" | "failed";

/**
 * Complete workflow with events
 */
export interface Workflow {
  id: string;
  createdAt: number; // Unix timestamp (ms)
  updatedAt: number; // Unix timestamp (ms)
  status: WorkflowStatus;
  events: WorkflowEvent[];
}
