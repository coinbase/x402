import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { EventStorage } from "../storage/EventStorage";
import { WorkflowTracker } from "../tracker/WorkflowTracker";
import { EventType } from "../events/types";
import { unlinkSync } from "fs";

describe("@x402-observed/core smoke tests", () => {
  const testDbPath = ":memory:"; // Use in-memory database for tests

  describe("EventStorage", () => {
    let storage: EventStorage;

    beforeEach(() => {
      storage = new EventStorage(testDbPath);
      storage.initialize();
    });

    afterEach(() => {
      storage.close();
    });

    it("should initialize database schema", () => {
      expect(() => storage.initialize()).not.toThrow();
    });

    it("should create and retrieve workflows", () => {
      const workflowId = "test-workflow-1";
      const timestamp = Date.now();

      storage.createWorkflow(workflowId, timestamp);

      const workflow = storage.getWorkflowById(workflowId);
      expect(workflow).not.toBeNull();
      expect(workflow?.id).toBe(workflowId);
      expect(workflow?.status).toBe("pending");
    });

    it("should insert and retrieve events", () => {
      const workflowId = "test-workflow-2";
      const timestamp = Date.now();

      storage.createWorkflow(workflowId, timestamp);

      const event = {
        id: "event-1",
        workflowId,
        eventType: EventType.REQUEST_RECEIVED,
        timestamp,
        data: { method: "GET", path: "/test" },
      };

      storage.insertEvent(event);

      const events = storage.getEventsByWorkflowId(workflowId);
      expect(events).toHaveLength(1);
      expect(events[0].id).toBe("event-1");
      expect(events[0].eventType).toBe(EventType.REQUEST_RECEIVED);
    });

    it("should enforce event idempotency", () => {
      const workflowId = "test-workflow-3";
      const timestamp = Date.now();

      storage.createWorkflow(workflowId, timestamp);

      const event = {
        id: "event-duplicate",
        workflowId,
        eventType: EventType.REQUEST_RECEIVED,
        timestamp,
        data: { method: "GET", path: "/test" },
      };

      // Insert the same event multiple times
      storage.insertEvent(event);
      storage.insertEvent(event);
      storage.insertEvent(event);

      const events = storage.getEventsByWorkflowId(workflowId);
      expect(events).toHaveLength(1);
    });
  });

  describe("WorkflowTracker", () => {
    let storage: EventStorage;
    let tracker: WorkflowTracker;

    beforeEach(() => {
      storage = new EventStorage(testDbPath);
      storage.initialize();
      tracker = new WorkflowTracker(storage);
    });

    afterEach(() => {
      storage.close();
    });

    it("should create unique workflow IDs", () => {
      const id1 = tracker.createWorkflow();
      const id2 = tracker.createWorkflow();

      expect(id1).not.toBe(id2);
    });

    it("should log events with actual timestamps", () => {
      const workflowId = tracker.createWorkflow();
      const timestamp = Date.now();

      tracker.logEvent(workflowId, EventType.REQUEST_RECEIVED, timestamp, {
        method: "POST",
        path: "/api/test",
      });

      const events = storage.getEventsByWorkflowId(workflowId);
      expect(events).toHaveLength(1);
      expect(events[0].timestamp).toBe(timestamp);
    });

    it("should complete workflows", () => {
      const workflowId = tracker.createWorkflow();

      tracker.completeWorkflow(workflowId);

      const workflow = storage.getWorkflowById(workflowId);
      expect(workflow?.status).toBe("completed");
    });

    it("should fail workflows", () => {
      const workflowId = tracker.createWorkflow();

      tracker.failWorkflow(workflowId);

      const workflow = storage.getWorkflowById(workflowId);
      expect(workflow?.status).toBe("failed");
    });
  });

  describe("Integration", () => {
    let storage: EventStorage;
    let tracker: WorkflowTracker;

    beforeEach(() => {
      storage = new EventStorage(testDbPath);
      storage.initialize();
      tracker = new WorkflowTracker(storage);
    });

    afterEach(() => {
      storage.close();
    });

    it("should track a complete workflow lifecycle", () => {
      const workflowId = tracker.createWorkflow();
      const baseTime = Date.now();

      // Simulate workflow events
      tracker.logEvent(workflowId, EventType.REQUEST_RECEIVED, baseTime, {
        method: "GET",
        path: "/protected",
      });

      tracker.logEvent(workflowId, EventType.PAYMENT_REQUIRED, baseTime + 10, {
        statusCode: 402,
      });

      tracker.logEvent(workflowId, EventType.PAYMENT_HEADER_RECEIVED, baseTime + 20, {
        paymentHeader: "base64-encoded-payment",
      });

      tracker.logEvent(workflowId, EventType.VERIFY_CALLED, baseTime + 30, {
        paymentPayload: {} as any,
        paymentRequirements: {} as any,
      });

      tracker.logEvent(workflowId, EventType.VERIFY_RESULT, baseTime + 40, {
        isValid: true,
        duration: 10,
      });

      tracker.logEvent(workflowId, EventType.SETTLE_CALLED, baseTime + 50, {
        paymentPayload: {} as any,
        paymentRequirements: {} as any,
      });

      tracker.logEvent(workflowId, EventType.SETTLE_RESULT, baseTime + 60, {
        success: true,
        txHash: "0x123abc",
        duration: 10,
      });

      tracker.logEvent(workflowId, EventType.WORKFLOW_COMPLETED, baseTime + 70, {
        statusCode: 200,
        totalDuration: 70,
      });

      tracker.completeWorkflow(workflowId);

      // Verify all events were logged
      const workflow = storage.getWorkflowById(workflowId);
      expect(workflow).not.toBeNull();
      expect(workflow?.status).toBe("completed");
      expect(workflow?.events).toHaveLength(8);

      // Verify event order
      const eventTypes = workflow?.events.map(e => e.eventType);
      expect(eventTypes).toEqual([
        EventType.REQUEST_RECEIVED,
        EventType.PAYMENT_REQUIRED,
        EventType.PAYMENT_HEADER_RECEIVED,
        EventType.VERIFY_CALLED,
        EventType.VERIFY_RESULT,
        EventType.SETTLE_CALLED,
        EventType.SETTLE_RESULT,
        EventType.WORKFLOW_COMPLETED,
      ]);
    });
  });
});
