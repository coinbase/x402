/**
 * Integration tests for x402-observed tool
 *
 * Tests the full workflow: Express middleware → SQLite → API → Dashboard
 * Validates Requirements: 1.1, 1.2, 1.3, 6.1, 6.2, 6.3, 6.4
 */

import { describe, it, expect, beforeEach, afterEach } from "vitest";
import express, { type Express } from "express";
import request from "supertest";
import { EventStorage, EventType } from "@x402-observed/core";
import { createServer } from "../server";
import fs from "fs";
import path from "path";

describe("Integration Tests: Full Workflow", () => {
  let testDbPath: string;
  let storage: EventStorage;

  beforeEach(() => {
    // Create a unique test database for each test
    testDbPath = path.join(
      process.cwd(),
      `.x402-observed-test-${Date.now()}.db`,
    );
    storage = new EventStorage(testDbPath);
    storage.initialize();
  });

  afterEach(() => {
    // Clean up test database
    if (fs.existsSync(testDbPath)) {
      fs.unlinkSync(testDbPath);
    }
  });

  describe("SQLite Storage Integration", () => {
    it("should store and retrieve workflow events", () => {
      // Create a workflow
      const workflowId = `workflow-${Date.now()}`;
      const timestamp = Date.now();

      // Create workflow first
      storage.createWorkflow(workflowId, timestamp);

      // Insert events
      storage.insertEvent({
        id: `event-1-${Date.now()}`,
        workflowId,
        eventType: EventType.REQUEST_RECEIVED,
        timestamp,
        data: { method: "GET", path: "/api/test" },
      });

      storage.insertEvent({
        id: `event-2-${Date.now()}`,
        workflowId,
        eventType: EventType.PAYMENT_REQUIRED,
        timestamp: timestamp + 10,
        data: { statusCode: 402 },
      });

      // Retrieve events
      const events = storage.getEventsByWorkflowId(workflowId);

      expect(events).toHaveLength(2);
      expect(events[0].eventType).toBe(EventType.REQUEST_RECEIVED);
      expect(events[1].eventType).toBe(EventType.PAYMENT_REQUIRED);
    });

    it("should handle idempotent event insertion", () => {
      const workflowId = `workflow-${Date.now()}`;
      const eventId = `event-${Date.now()}`;
      const timestamp = Date.now();

      // Create workflow first
      storage.createWorkflow(workflowId, timestamp);

      const event = {
        id: eventId,
        workflowId,
        eventType: EventType.REQUEST_RECEIVED,
        timestamp,
        data: { method: "GET", path: "/api/test" },
      };

      // Insert the same event multiple times
      storage.insertEvent(event);
      storage.insertEvent(event);
      storage.insertEvent(event);

      // Should only have one event
      const events = storage.getEventsByWorkflowId(workflowId);
      expect(events).toHaveLength(1);
    });

    it("should retrieve all workflows", () => {
      const workflow1Id = `workflow-1-${Date.now()}`;
      const workflow2Id = `workflow-2-${Date.now()}`;
      const timestamp = Date.now();

      // Create two workflows
      storage.createWorkflow(workflow1Id, timestamp);
      storage.createWorkflow(workflow2Id, timestamp + 100);

      storage.insertEvent({
        id: `event-1-${Date.now()}`,
        workflowId: workflow1Id,
        eventType: EventType.REQUEST_RECEIVED,
        timestamp,
        data: {},
      });

      storage.insertEvent({
        id: `event-2-${Date.now()}`,
        workflowId: workflow2Id,
        eventType: EventType.REQUEST_RECEIVED,
        timestamp: timestamp + 100,
        data: {},
      });

      const workflows = storage.getAllWorkflows();
      expect(workflows.length).toBeGreaterThanOrEqual(2);

      const workflowIds = workflows.map((w) => w.id);
      expect(workflowIds).toContain(workflow1Id);
      expect(workflowIds).toContain(workflow2Id);
    });
  });

  describe("REST API Integration", () => {
    let app: Express;

    beforeEach(() => {
      // Override the default database path for testing
      process.env.X402_OBSERVED_DB_PATH = testDbPath;
      app = createServer();
    });

    afterEach(() => {
      delete process.env.X402_OBSERVED_DB_PATH;
    });

    it("should return empty workflows array when database is empty", async () => {
      const response = await request(app).get("/api/workflows");

      expect(response.status).toBe(200);
      expect(response.body).toHaveProperty("workflows");
      expect(Array.isArray(response.body.workflows)).toBe(true);
    });

    it("should return all workflows with events", async () => {
      // Insert test data
      const workflowId = `workflow-${Date.now()}`;
      const timestamp = Date.now();

      storage.createWorkflow(workflowId, timestamp);

      storage.insertEvent({
        id: `event-1-${Date.now()}`,
        workflowId,
        eventType: EventType.REQUEST_RECEIVED,
        timestamp,
        data: { method: "GET", path: "/api/test" },
      });

      storage.insertEvent({
        id: `event-2-${Date.now()}`,
        workflowId,
        eventType: EventType.VERIFY_RESULT,
        timestamp: timestamp + 50,
        data: { isValid: true, duration: 50 },
      });

      const response = await request(app).get("/api/workflows");

      expect(response.status).toBe(200);
      expect(response.body.workflows.length).toBeGreaterThan(0);

      const workflow = response.body.workflows.find(
        (w: any) => w.id === workflowId,
      );
      expect(workflow).toBeDefined();
      expect(workflow.events).toHaveLength(2);
    });

    it("should return specific workflow by ID", async () => {
      // Insert test data
      const workflowId = `workflow-${Date.now()}`;
      const timestamp = Date.now();

      storage.createWorkflow(workflowId, timestamp);

      storage.insertEvent({
        id: `event-1-${Date.now()}`,
        workflowId,
        eventType: EventType.REQUEST_RECEIVED,
        timestamp,
        data: { method: "GET", path: "/api/test" },
      });

      const response = await request(app).get(`/api/workflows/${workflowId}`);

      expect(response.status).toBe(200);
      expect(response.body.workflow).toBeDefined();
      expect(response.body.workflow.id).toBe(workflowId);
      expect(response.body.workflow.events).toHaveLength(1);
    });

    it("should return 404 for non-existent workflow", async () => {
      const response = await request(app).get(
        "/api/workflows/non-existent-id",
      );

      expect(response.status).toBe(404);
      expect(response.body).toHaveProperty("error");
    });

    it("should include transaction hashes in settle_result events", async () => {
      const workflowId = `workflow-${Date.now()}`;
      const timestamp = Date.now();
      const txHash = "0x1234567890abcdef";

      storage.createWorkflow(workflowId, timestamp);

      storage.insertEvent({
        id: `event-1-${Date.now()}`,
        workflowId,
        eventType: EventType.SETTLE_RESULT,
        timestamp,
        data: { success: true, txHash, network: "base-sepolia" },
      });

      const response = await request(app).get(`/api/workflows/${workflowId}`);

      expect(response.status).toBe(200);
      const settleEvent = response.body.workflow.events.find(
        (e: any) => e.eventType === EventType.SETTLE_RESULT,
      );
      expect(settleEvent).toBeDefined();
      expect(settleEvent.data.txHash).toBe(txHash);
    });
  });

  describe("SSE Integration", () => {
    let app: Express;

    beforeEach(() => {
      process.env.X402_OBSERVED_DB_PATH = testDbPath;
      app = createServer();
    });

    afterEach(() => {
      delete process.env.X402_OBSERVED_DB_PATH;
    });

    it("should establish SSE connection", (done) => {
      const req = request(app).get("/api/events");

      req.on("response", (res) => {
        expect(res.headers["content-type"]).toBe("text/event-stream");
        expect(res.headers["cache-control"]).toBe("no-cache");
        expect(res.headers["connection"]).toBe("keep-alive");

        // Close the connection
        req.abort();
        done();
      });
    });

    it("should broadcast events to connected clients", (done) => {
      const workflowId = `workflow-${Date.now()}`;
      let receivedEvent = false;

      const req = request(app).get("/api/events");

      req.on("response", (res) => {
        let buffer = "";

        res.on("data", (chunk) => {
          buffer += chunk.toString();

          // Check if we received a complete event
          if (buffer.includes("\n\n") && !receivedEvent) {
            receivedEvent = true;

            // Parse the SSE message
            const lines = buffer.split("\n");
            const dataLine = lines.find((line) => line.startsWith("data: "));

            if (dataLine) {
              const data = JSON.parse(dataLine.substring(6));

              // Check if it's our test event
              if (data.workflowId === workflowId) {
                expect(data.eventType).toBe(EventType.REQUEST_RECEIVED);
                req.abort();
                done();
              }
            }
          }
        });

        // Give the connection time to establish, then insert an event
        setTimeout(() => {
          storage.insertEvent({
            id: `event-${Date.now()}`,
            workflowId,
            eventType: EventType.REQUEST_RECEIVED,
            timestamp: Date.now(),
            data: { method: "GET", path: "/api/test" },
          });
        }, 100);
      });

      // Timeout after 5 seconds
      setTimeout(() => {
        if (!receivedEvent) {
          req.abort();
          done(new Error("Did not receive SSE event within timeout"));
        }
      }, 5000);
    });
  });

  describe("Concurrent Workflows", () => {
    it("should handle multiple concurrent workflows", () => {
      const workflowCount = 10;
      const workflows: string[] = [];
      const timestamp = Date.now();

      // Create multiple workflows concurrently
      for (let i = 0; i < workflowCount; i++) {
        const workflowId = `workflow-${i}-${Date.now()}`;
        workflows.push(workflowId);

        storage.createWorkflow(workflowId, timestamp + i);

        storage.insertEvent({
          id: `event-${i}-1-${Date.now()}`,
          workflowId,
          eventType: EventType.REQUEST_RECEIVED,
          timestamp: timestamp + i,
          data: { method: "GET", path: `/api/test-${i}` },
        });

        storage.insertEvent({
          id: `event-${i}-2-${Date.now()}`,
          workflowId,
          eventType: EventType.PAYMENT_REQUIRED,
          timestamp: timestamp + i + 10,
          data: { statusCode: 402 },
        });
      }

      // Verify all workflows were created
      const allWorkflows = storage.getAllWorkflows();
      const createdWorkflowIds = allWorkflows.map((w) => w.id);

      workflows.forEach((workflowId) => {
        expect(createdWorkflowIds).toContain(workflowId);
      });

      // Verify each workflow has the correct events
      workflows.forEach((workflowId) => {
        const events = storage.getEventsByWorkflowId(workflowId);
        expect(events).toHaveLength(2);
      });
    });

    it("should maintain event order within workflows", () => {
      const workflowId = `workflow-${Date.now()}`;
      const baseTimestamp = Date.now();

      // Create workflow first
      storage.createWorkflow(workflowId, baseTimestamp);

      // Insert events in a specific order
      const eventTypes = [
        EventType.REQUEST_RECEIVED,
        EventType.PAYMENT_REQUIRED,
        EventType.PAYMENT_HEADER_RECEIVED,
        EventType.VERIFY_CALLED,
        EventType.VERIFY_RESULT,
        EventType.SETTLE_CALLED,
        EventType.SETTLE_RESULT,
        EventType.WORKFLOW_COMPLETED,
      ];

      eventTypes.forEach((eventType, index) => {
        storage.insertEvent({
          id: `event-${index}-${Date.now()}`,
          workflowId,
          eventType,
          timestamp: baseTimestamp + index * 10,
          data: {},
        });
      });

      // Retrieve events and verify order
      const events = storage.getEventsByWorkflowId(workflowId);
      expect(events).toHaveLength(eventTypes.length);

      events.forEach((event, index) => {
        expect(event.eventType).toBe(eventTypes[index]);
        expect(event.timestamp).toBe(baseTimestamp + index * 10);
      });
    });
  });

  describe("Complete Workflow Scenario", () => {
    it("should log all events in a successful payment workflow", () => {
      const workflowId = `workflow-${Date.now()}`;
      let timestamp = Date.now();

      // Create workflow first
      storage.createWorkflow(workflowId, timestamp);

      // 1. Request received
      storage.insertEvent({
        id: `event-1-${Date.now()}`,
        workflowId,
        eventType: EventType.REQUEST_RECEIVED,
        timestamp,
        data: { method: "GET", path: "/api/protected" },
      });

      // 2. Payment required (402 response)
      timestamp += 5;
      storage.insertEvent({
        id: `event-2-${Date.now()}`,
        workflowId,
        eventType: EventType.PAYMENT_REQUIRED,
        timestamp,
        data: { statusCode: 402 },
      });

      // 3. Payment header received (retry with payment)
      timestamp += 100;
      storage.insertEvent({
        id: `event-3-${Date.now()}`,
        workflowId,
        eventType: EventType.PAYMENT_HEADER_RECEIVED,
        timestamp,
        data: { paymentHeader: "payment-signature-value" },
      });

      // 4. Verify called
      timestamp += 5;
      storage.insertEvent({
        id: `event-4-${Date.now()}`,
        workflowId,
        eventType: EventType.VERIFY_CALLED,
        timestamp,
        data: { paymentPayload: {}, paymentRequirements: {} },
      });

      // 5. Verify result (success)
      timestamp += 50;
      storage.insertEvent({
        id: `event-5-${Date.now()}`,
        workflowId,
        eventType: EventType.VERIFY_RESULT,
        timestamp,
        data: { isValid: true, duration: 50 },
      });

      // 6. Settle called
      timestamp += 5;
      storage.insertEvent({
        id: `event-6-${Date.now()}`,
        workflowId,
        eventType: EventType.SETTLE_CALLED,
        timestamp,
        data: { paymentPayload: {}, paymentRequirements: {} },
      });

      // 7. Settle result (success with txHash)
      timestamp += 200;
      storage.insertEvent({
        id: `event-7-${Date.now()}`,
        workflowId,
        eventType: EventType.SETTLE_RESULT,
        timestamp,
        data: {
          success: true,
          txHash: "0xabcdef1234567890",
          network: "base-sepolia",
          duration: 200,
        },
      });

      // 8. Workflow completed (200 response)
      timestamp += 10;
      storage.insertEvent({
        id: `event-8-${Date.now()}`,
        workflowId,
        eventType: EventType.WORKFLOW_COMPLETED,
        timestamp,
        data: { statusCode: 200, totalDuration: 375 },
      });

      // Verify the complete workflow
      const workflow = storage.getWorkflowById(workflowId);
      expect(workflow).toBeDefined();
      expect(workflow!.events).toHaveLength(8);

      // Verify event sequence
      const eventTypes = workflow!.events.map((e) => e.eventType);
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

      // Verify transaction hash is captured
      const settleEvent = workflow!.events.find(
        (e) => e.eventType === EventType.SETTLE_RESULT,
      );
      expect(settleEvent!.data.txHash).toBe("0xabcdef1234567890");
    });
  });
});
