import type { Workflow as APIWorkflow, WorkflowEvent } from "@x402-observed/core";
import type { Workflow } from "./mock-data";
import { transformWorkflow } from "./transform";

/**
 * API response for GET /api/workflows
 */
interface WorkflowsResponse {
  workflows: APIWorkflow[];
}

/**
 * API response for GET /api/workflows/:id
 */
interface WorkflowResponse {
  workflow: APIWorkflow;
}

/**
 * API client for x402-observed backend
 */
export class WorkflowAPI {
  private baseUrl = "http://localhost:4402/api";

  /**
   * Fetch all workflows from the API
   */
  async getWorkflows(): Promise<Workflow[]> {
    try {
      const res = await fetch(`${this.baseUrl}/workflows`);
      if (!res.ok) {
        throw new Error(`Failed to fetch workflows: ${res.statusText}`);
      }
      const data: WorkflowsResponse = await res.json();
      return data.workflows.map(transformWorkflow);
    } catch (error) {
      console.error("Error fetching workflows:", error);
      return [];
    }
  }

  /**
   * Fetch a specific workflow by ID
   */
  async getWorkflow(id: string): Promise<Workflow | null> {
    try {
      const res = await fetch(`${this.baseUrl}/workflows/${id}`);
      if (!res.ok) {
        if (res.status === 404) {
          return null;
        }
        throw new Error(`Failed to fetch workflow: ${res.statusText}`);
      }
      const data: WorkflowResponse = await res.json();
      return transformWorkflow(data.workflow);
    } catch (error) {
      console.error(`Error fetching workflow ${id}:`, error);
      return null;
    }
  }

  /**
   * Subscribe to real-time workflow events via Server-Sent Events
   * @param onEvent - Callback function called when a new event is received
   * @returns Cleanup function to close the SSE connection
   */
  subscribeToEvents(onEvent: (event: WorkflowEvent) => void): () => void {
    const eventSource = new EventSource(`${this.baseUrl}/events`);

    eventSource.onmessage = (e) => {
      try {
        const event: WorkflowEvent = JSON.parse(e.data);
        onEvent(event);
      } catch (error) {
        console.error("Error parsing SSE event:", error);
      }
    };

    eventSource.onerror = (error) => {
      console.error("SSE connection error:", error);
      // EventSource will automatically attempt to reconnect
    };

    // Return cleanup function
    return () => {
      eventSource.close();
    };
  }
}

/**
 * Singleton API client instance
 */
export const api = new WorkflowAPI();
