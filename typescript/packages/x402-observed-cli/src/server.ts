/**
 * Express server for the x402-observed dashboard.
 *
 * Serves the dashboard static files and provides REST API + SSE endpoints.
 */

import express from "express";
import path from "path";
import fs from "fs";
import { EventStorage } from "@x402-observed/core";
import { createSSEHandler } from "./sse";

/**
 * Create the Express server for the dashboard.
 *
 * @returns Express application
 */
export function createServer(): express.Application {
  const app = express();

  // Initialize EventStorage at .x402-observed/events.db in current directory
  // Allow override via environment variable for testing
  const dbDir = process.env.X402_OBSERVED_DB_PATH
    ? path.dirname(process.env.X402_OBSERVED_DB_PATH)
    : ".x402-observed";
  const dbPath = process.env.X402_OBSERVED_DB_PATH || path.join(dbDir, "events.db");

  // Ensure directory exists
  if (!fs.existsSync(dbDir)) {
    fs.mkdirSync(dbDir, { recursive: true });
  }

  const storage = new EventStorage(dbPath);
  storage.initialize();

  // JSON middleware for API routes
  app.use(express.json());

  // REST API routes
  // GET /api/workflows - return all workflows with events
  app.get("/api/workflows", (req, res) => {
    try {
      const workflows = storage.getAllWorkflows();
      res.json({ workflows });
    } catch (error) {
      console.error("Error fetching workflows:", error);
      res.status(500).json({ error: "Failed to fetch workflows" });
    }
  });

  // GET /api/workflows/:id - return specific workflow
  app.get("/api/workflows/:id", (req, res) => {
    try {
      const workflow = storage.getWorkflowById(req.params.id);

      if (!workflow) {
        res.status(404).json({ error: "Workflow not found" });
        return;
      }

      res.json({ workflow });
    } catch (error) {
      console.error("Error fetching workflow:", error);
      res.status(500).json({ error: "Failed to fetch workflow" });
    }
  });

  // SSE endpoint for live updates
  app.get("/api/events", createSSEHandler(storage));

  // Serve dashboard static files (built with Next.js export)
  const dashboardPath = path.join(__dirname, "../../x402-observed-dashboard/out");
  app.use(express.static(dashboardPath));

  // SPA fallback - serve index.html for all other routes
  app.get("*", (req, res) => {
    res.sendFile(path.join(dashboardPath, "index.html"));
  });

  return app;
}
