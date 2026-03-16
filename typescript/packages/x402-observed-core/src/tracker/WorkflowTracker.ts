import { randomUUID } from "crypto";
import type { EventStorage } from "../storage/EventStorage";
import type { EventType, EventData } from "../events/types";

/**
 * Manages workflow lifecycle and event logging
 */
export class WorkflowTracker {
  /**
   *
   * @param storage
   */
  constructor(private storage: EventStorage) {}

  /**
   * Create a new workflow and return its ID
   */
  createWorkflow(): string {
    const workflowId = randomUUID();
    const timestamp = Date.now();

    this.storage.createWorkflow(workflowId, timestamp);

    return workflowId;
  }

  /**
   * Log an event for a workflow
   *
   * @param workflowId - The workflow ID
   * @param eventType - The type of event
   * @param timestamp - The actual timestamp when the event occurred
   * @param data - Event-specific data
   */
  logEvent(workflowId: string, eventType: EventType, timestamp: number, data: EventData): void {
    const event = {
      id: randomUUID(),
      workflowId,
      eventType,
      timestamp,
      data,
    };

    this.storage.insertEvent(event);
  }

  /**
   * Mark a workflow as completed
   *
   * @param workflowId
   */
  completeWorkflow(workflowId: string): void {
    const timestamp = Date.now();
    this.storage.updateWorkflowStatus(workflowId, "completed", timestamp);
  }

  /**
   * Mark a workflow as failed
   *
   * @param workflowId
   */
  failWorkflow(workflowId: string): void {
    const timestamp = Date.now();
    this.storage.updateWorkflowStatus(workflowId, "failed", timestamp);
  }
}
