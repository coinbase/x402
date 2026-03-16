import Database from "better-sqlite3";
import type { WorkflowEvent, Workflow, WorkflowStatus } from "../events/types";

/**
 * Event callback type for SSE broadcasting
 */
export type EventCallback = (event: WorkflowEvent) => void;

/**
 * SQLite-based event storage with idempotent inserts
 */
export class EventStorage {
  private db: Database.Database;
  private eventCallbacks: Set<EventCallback> = new Set();

  /**
   *
   * @param dbPath
   */
  constructor(dbPath: string) {
    this.db = new Database(dbPath);
  }

  /**
   * Initialize database schema (idempotent)
   */
  initialize(): void {
    // Create schema version table
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS schema_version (
        version INTEGER PRIMARY KEY,
        applied_at INTEGER NOT NULL
      );
    `);

    // Create workflows table
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS workflows (
        id TEXT PRIMARY KEY,
        created_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL,
        status TEXT NOT NULL
      );
    `);

    // Create events table
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS events (
        id TEXT PRIMARY KEY,
        workflow_id TEXT NOT NULL,
        event_type TEXT NOT NULL,
        timestamp INTEGER NOT NULL,
        data TEXT NOT NULL,
        FOREIGN KEY (workflow_id) REFERENCES workflows(id)
      );
    `);

    // Create indexes
    this.db.exec(`
      CREATE INDEX IF NOT EXISTS idx_events_workflow_id ON events(workflow_id);
    `);

    this.db.exec(`
      CREATE INDEX IF NOT EXISTS idx_events_timestamp ON events(timestamp);
    `);

    // Insert schema version (idempotent)
    const stmt = this.db.prepare(`
      INSERT OR IGNORE INTO schema_version (version, applied_at) 
      VALUES (1, ?)
    `);
    stmt.run(Date.now());
  }

  /**
   * Insert event with idempotency (INSERT OR IGNORE)
   *
   * @param event
   */
  insertEvent(event: WorkflowEvent): void {
    const stmt = this.db.prepare(`
      INSERT OR IGNORE INTO events (id, workflow_id, event_type, timestamp, data)
      VALUES (?, ?, ?, ?, ?)
    `);

    stmt.run(
      event.id,
      event.workflowId,
      event.eventType,
      event.timestamp,
      JSON.stringify(event.data),
    );

    // Notify callbacks for SSE broadcasting
    this.eventCallbacks.forEach(callback => {
      try {
        callback(event);
      } catch (error) {
        // Silently ignore callback errors to prevent blocking
        console.error("Event callback error:", error);
      }
    });
  }

  /**
   * Create a new workflow
   *
   * @param id
   * @param timestamp
   */
  createWorkflow(id: string, timestamp: number): void {
    const stmt = this.db.prepare(`
      INSERT OR IGNORE INTO workflows (id, created_at, updated_at, status)
      VALUES (?, ?, ?, ?)
    `);

    stmt.run(id, timestamp, timestamp, "pending");
  }

  /**
   * Update workflow status
   *
   * @param id
   * @param status
   * @param timestamp
   */
  updateWorkflowStatus(id: string, status: WorkflowStatus, timestamp: number): void {
    const stmt = this.db.prepare(`
      UPDATE workflows 
      SET status = ?, updated_at = ?
      WHERE id = ?
    `);

    stmt.run(status, timestamp, id);
  }

  /**
   * Get all workflows with their events
   */
  getAllWorkflows(): Workflow[] {
    const workflowsStmt = this.db.prepare(`
      SELECT id, created_at, updated_at, status
      FROM workflows
      ORDER BY created_at DESC
    `);

    const workflows = workflowsStmt.all() as Array<{
      id: string;
      created_at: number;
      updated_at: number;
      status: WorkflowStatus;
    }>;

    return workflows.map(workflow => ({
      id: workflow.id,
      createdAt: workflow.created_at,
      updatedAt: workflow.updated_at,
      status: workflow.status,
      events: this.getEventsByWorkflowId(workflow.id),
    }));
  }

  /**
   * Get a specific workflow by ID
   *
   * @param workflowId
   */
  getWorkflowById(workflowId: string): Workflow | null {
    const stmt = this.db.prepare(`
      SELECT id, created_at, updated_at, status
      FROM workflows
      WHERE id = ?
    `);

    const workflow = stmt.get(workflowId) as
      | {
          id: string;
          created_at: number;
          updated_at: number;
          status: WorkflowStatus;
        }
      | undefined;

    if (!workflow) {
      return null;
    }

    return {
      id: workflow.id,
      createdAt: workflow.created_at,
      updatedAt: workflow.updated_at,
      status: workflow.status,
      events: this.getEventsByWorkflowId(workflow.id),
    };
  }

  /**
   * Get all events for a specific workflow
   *
   * @param workflowId
   */
  getEventsByWorkflowId(workflowId: string): WorkflowEvent[] {
    const stmt = this.db.prepare(`
      SELECT id, workflow_id, event_type, timestamp, data
      FROM events
      WHERE workflow_id = ?
      ORDER BY timestamp ASC
    `);

    const rows = stmt.all(workflowId) as Array<{
      id: string;
      workflow_id: string;
      event_type: string;
      timestamp: number;
      data: string;
    }>;

    return rows.map(row => ({
      id: row.id,
      workflowId: row.workflow_id,
      eventType: row.event_type as WorkflowEvent["eventType"],
      timestamp: row.timestamp,
      data: JSON.parse(row.data),
    }));
  }

  /**
   * Register a callback for new events (for SSE broadcasting)
   *
   * @param callback
   */
  onEvent(callback: EventCallback): () => void {
    this.eventCallbacks.add(callback);

    // Return unsubscribe function
    return () => {
      this.eventCallbacks.delete(callback);
    };
  }

  /**
   * Close the database connection
   */
  close(): void {
    this.db.close();
  }
}
