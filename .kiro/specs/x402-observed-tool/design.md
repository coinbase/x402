# Design Document: x402-observed Tool

## Overview

The x402-observed tool is a zero-configuration observability solution for x402 payment workflows. It provides developers with real-time visibility into HTTP 402 payment flows through transparent interception of payment operations. The tool consists of five TypeScript packages that work together to capture, store, and visualize payment workflow events.

### Key Design Principles

1. **Zero Configuration**: No environment variables, no setup files, no infrastructure
2. **Drop-in Replacement**: Single import change to enable observability
3. **Non-invasive**: Original x402 behavior is completely preserved
4. **Local-first**: SQLite database stored in project root for easy inspection
5. **Real-time**: Server-Sent Events provide live updates to the dashboard

### Architecture Philosophy

The design follows the "Prisma Studio" model - a local development tool that requires zero setup and provides immediate value. The tool intercepts x402 operations using JavaScript Proxy patterns, logs events to a local SQLite database, and serves a dashboard via an Express server launched with `npx x402-observed`.

## Architecture

### Package Structure

The tool is organized as five packages in the TypeScript monorepo:

```
typescript/packages/
├── x402-observed-core/          # @x402-observed/core
│   ├── src/
│   │   ├── proxy/               # HTTPFacilitatorClient proxy wrapper
│   │   ├── storage/             # SQLite database layer
│   │   ├── events/              # Event types and schemas
│   │   └── index.ts
│   └── package.json
│
├── x402-observed-express/       # @x402-observed/express
│   ├── src/
│   │   ├── middleware.ts        # Observed paymentMiddleware
│   │   └── index.ts
│   └── package.json
│
├── x402-observed-next/          # @x402-observed/next
│   ├── src/
│   │   ├── middleware.ts        # Observed paymentMiddleware for Next.js
│   │   └── index.ts
│   └── package.json
│
├── x402-observed-cli/           # x402-observed (npx binary)
│   ├── src/
│   │   ├── server.ts            # Express server
│   │   ├── api/                 # REST API routes
│   │   ├── sse.ts               # Server-Sent Events
│   │   └── index.ts             # CLI entry point
│   └── package.json
│
└── x402-observed-dashboard/     # Dashboard UI (not published)
    ├── src/
    │   ├── app/                 # Next.js app directory
    │   ├── components/          # React components
    │   └── lib/                 # API client
    └── package.json
```

### Dependency Graph

```
@x402/core (upstream, read-only)
    ↓
@x402-observed/core (depends on @x402/core, better-sqlite3)
    ↓
    ├─→ @x402-observed/express (depends on @x402/express)
    ├─→ @x402-observed/next (depends on @x402/next)
    └─→ x402-observed CLI (depends on express)
            ↓
        @x402-observed/dashboard (depends on @x402-observed/core)
```

### Data Flow

```
HTTP Request
    ↓
observedPaymentMiddleware (Express/Next)
    ↓
[LOG: request_received] → SQLite
    ↓
Original paymentMiddleware
    ↓
402 Response
    ↓
[LOG: payment_required] → SQLite → SSE broadcast
    ↓
Payment Header Received
    ↓
[LOG: payment_header_received] → SQLite → SSE broadcast
    ↓
facilitatorProxy.verify()
    ↓
[LOG: verify_called] → SQLite → SSE broadcast
    ↓
verify() result
    ↓
[LOG: verify_result] → SQLite → SSE broadcast
    ↓
facilitatorProxy.settle()
    ↓
[LOG: settle_called] → SQLite → SSE broadcast
    ↓
settle() result (with txHash)
    ↓
[LOG: settle_result] → SQLite → SSE broadcast
    ↓
200 Response
    ↓
[LOG: workflow_completed] → SQLite → SSE broadcast
```

## Components and Interfaces

### 1. Core Package (@x402-observed/core)

The core package provides the foundational observability infrastructure.

#### FacilitatorProxy

Wraps HTTPFacilitatorClient using JavaScript Proxy to intercept verify() and settle() calls.

```typescript
interface ProxyConfig {
  workflowId: string;
  storage: EventStorage;
}

class FacilitatorProxy {
  constructor(
    originalClient: FacilitatorClient,
    config: ProxyConfig
  );
  
  // Returns a Proxy that intercepts verify() and settle()
  getProxy(): FacilitatorClient;
}
```

**Interception Logic:**
- Before calling original method: Log `*_called` event with timestamp
- After method returns: Log `*_result` event with timestamp and result data
- On error: Log error event and re-throw (preserve original behavior)
- All timestamps come from event occurrence, never Date.now()

#### EventStorage

SQLite database interface using better-sqlite3.

```typescript
interface WorkflowEvent {
  id: string;                    // UUID
  workflowId: string;            // Workflow identifier
  eventType: EventType;          // Event type enum
  timestamp: number;             // Unix timestamp in milliseconds
  data: Record<string, unknown>; // Event-specific data (JSON)
}

enum EventType {
  REQUEST_RECEIVED = 'request_received',
  PAYMENT_REQUIRED = 'payment_required',
  PAYMENT_HEADER_RECEIVED = 'payment_header_received',
  VERIFY_CALLED = 'verify_called',
  VERIFY_RESULT = 'verify_result',
  SETTLE_CALLED = 'settle_called',
  SETTLE_RESULT = 'settle_result',
  WORKFLOW_COMPLETED = 'workflow_completed',
}

class EventStorage {
  constructor(dbPath: string);
  
  // Initialize database schema
  initialize(): void;
  
  // Insert event (idempotent by event id)
  insertEvent(event: WorkflowEvent): void;
  
  // Query methods
  getAllWorkflows(): Workflow[];
  getWorkflowById(workflowId: string): Workflow | null;
  getEventsByWorkflowId(workflowId: string): WorkflowEvent[];
}
```

**Database Schema:**

```sql
CREATE TABLE IF NOT EXISTS workflows (
  id TEXT PRIMARY KEY,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  status TEXT NOT NULL  -- 'pending', 'completed', 'failed'
);

CREATE TABLE IF NOT EXISTS events (
  id TEXT PRIMARY KEY,
  workflow_id TEXT NOT NULL,
  event_type TEXT NOT NULL,
  timestamp INTEGER NOT NULL,
  data TEXT NOT NULL,  -- JSON
  FOREIGN KEY (workflow_id) REFERENCES workflows(id)
);

CREATE INDEX IF NOT EXISTS idx_events_workflow_id ON events(workflow_id);
CREATE INDEX IF NOT EXISTS idx_events_timestamp ON events(timestamp);
```

**Idempotency:** INSERT OR IGNORE ensures duplicate events are silently skipped.

#### WorkflowTracker

Manages workflow lifecycle and event logging.

```typescript
class WorkflowTracker {
  constructor(storage: EventStorage);
  
  // Create new workflow
  createWorkflow(): string; // Returns workflowId
  
  // Log event for workflow
  logEvent(
    workflowId: string,
    eventType: EventType,
    timestamp: number,
    data: Record<string, unknown>
  ): void;
  
  // Complete workflow
  completeWorkflow(workflowId: string): void;
}
```

### 2. Express Package (@x402-observed/express)

Provides drop-in replacement for @x402/express paymentMiddleware.

```typescript
import { paymentMiddleware as originalMiddleware } from '@x402/express';
import { FacilitatorProxy, WorkflowTracker, EventStorage } from '@x402-observed/core';

export function paymentMiddleware(
  routes: RoutesConfig,
  server: x402ResourceServer,
  paywallConfig?: PaywallConfig,
  paywall?: PaywallProvider,
  syncFacilitatorOnStart: boolean = true
) {
  // Initialize storage
  const storage = new EventStorage('.x402-observed/events.db');
  storage.initialize();
  
  const tracker = new WorkflowTracker(storage);
  
  // Wrap the server's facilitator client with proxy
  const originalFacilitator = server.facilitatorClient;
  
  // Return wrapped middleware
  return async (req, res, next) => {
    // Create workflow
    const workflowId = tracker.createWorkflow();
    
    // Log request_received
    tracker.logEvent(
      workflowId,
      EventType.REQUEST_RECEIVED,
      Date.now(), // This is the actual event time
      { method: req.method, path: req.path }
    );
    
    // Wrap facilitator with proxy
    const proxy = new FacilitatorProxy(originalFacilitator, {
      workflowId,
      storage
    });
    server.facilitatorClient = proxy.getProxy();
    
    // Intercept response to log payment_required
    const originalStatus = res.status.bind(res);
    res.status = function(code: number) {
      if (code === 402) {
        tracker.logEvent(
          workflowId,
          EventType.PAYMENT_REQUIRED,
          Date.now(),
          { statusCode: 402 }
        );
      }
      return originalStatus(code);
    };
    
    // Call original middleware
    await originalMiddleware(
      routes,
      server,
      paywallConfig,
      paywall,
      syncFacilitatorOnStart
    )(req, res, next);
    
    // Log completion if response is 200
    res.on('finish', () => {
      if (res.statusCode === 200) {
        tracker.logEvent(
          workflowId,
          EventType.WORKFLOW_COMPLETED,
          Date.now(),
          { statusCode: 200 }
        );
      }
    });
  };
}
```

**Key Design Decision:** The middleware wraps the original middleware rather than reimplementing it. This ensures:
- Zero maintenance burden when upstream changes
- Perfect behavioral compatibility
- Automatic inheritance of bug fixes and features

### 3. Next.js Package (@x402-observed/next)

Identical pattern to Express package, adapted for Next.js middleware API.

```typescript
import { paymentMiddleware as originalMiddleware } from '@x402/next';

export function paymentMiddleware(
  routes: RoutesConfig,
  server: x402ResourceServer,
  paywallConfig?: PaywallConfig,
  paywall?: PaywallProvider,
  syncFacilitatorOnStart: boolean = true
) {
  // Same wrapping logic as Express, adapted for Next.js Request/Response
}
```

### 4. CLI Package (x402-observed)

The CLI package provides the `npx x402-observed` command that launches the dashboard.

#### Server Architecture

```typescript
// src/server.ts
import express from 'express';
import { EventStorage } from '@x402-observed/core';
import { createSSEHandler } from './sse';
import { createAPIRoutes } from './api';

export function createServer() {
  const app = express();
  const storage = new EventStorage('.x402-observed/events.db');
  storage.initialize();
  
  // REST API routes
  app.use('/api', createAPIRoutes(storage));
  
  // SSE endpoint
  app.get('/api/events', createSSEHandler(storage));
  
  // Serve dashboard static files (built with Next.js export)
  const dashboardPath = path.join(__dirname, '../../x402-observed-dashboard/out');
  app.use(express.static(dashboardPath));
  
  return app;
}

// src/index.ts (CLI entry point)
#!/usr/bin/env node
import { createServer } from './server';

const PORT = 4402;
const server = createServer();

server.listen(PORT, () => {
  console.log(`x402-observed dashboard running at http://localhost:${PORT}`);
});
```

#### REST API Endpoints

```typescript
// GET /api/workflows
// Returns all workflows with their events
interface WorkflowsResponse {
  workflows: Array<{
    id: string;
    createdAt: number;
    updatedAt: number;
    status: string;
    events: WorkflowEvent[];
  }>;
}

// GET /api/workflows/:id
// Returns a specific workflow with all events
interface WorkflowResponse {
  workflow: {
    id: string;
    createdAt: number;
    updatedAt: number;
    status: string;
    events: WorkflowEvent[];
  };
}
```

#### Server-Sent Events

```typescript
// src/sse.ts
import { EventStorage, WorkflowEvent } from '@x402-observed/core';

interface SSEClient {
  id: string;
  res: Response;
}

class SSEManager {
  private clients: Set<SSEClient> = new Set();
  
  addClient(client: SSEClient): void;
  removeClient(clientId: string): void;
  broadcast(event: WorkflowEvent): void;
}

export function createSSEHandler(storage: EventStorage) {
  const manager = new SSEManager();
  
  // Storage needs to notify SSE manager on new events
  storage.onEvent((event) => {
    manager.broadcast(event);
  });
  
  return (req, res) => {
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    
    const clientId = crypto.randomUUID();
    manager.addClient({ id: clientId, res });
    
    req.on('close', () => {
      manager.removeClient(clientId);
    });
  };
}
```

**Event Broadcasting:** When EventStorage.insertEvent() is called, it triggers the onEvent callback, which broadcasts to all connected SSE clients.

### 5. Dashboard Package (@x402-observed/dashboard)

The dashboard is adapted from the existing Next.js application at `/Users/rishav/Desktop/x402-observed/frontend`. This is NOT a rewrite - we copy the existing codebase and make minimal targeted changes.

#### Existing Dashboard Structure

**Technology Stack:**
- Next.js 15.3.6 with App Router
- React 19.0.0
- Tailwind CSS v4
- shadcn/ui components (Radix UI primitives)
- Dark theme: `#1c1c1e` background, `#d4a855` accent

**Component Hierarchy:**
```
src/app/page.tsx (main dashboard)
├── WorkflowList (table of workflows)
├── ExecutionTimeline (timeline of selected workflow)
└── StepInspection (detail panel for selected step)
```

**Current Data Model (from mock-data.ts):**
```typescript
interface Workflow {
  id: string
  triggerType: 'time' | 'agent' | 'condition'  // NOT in x402 events
  status: 'completed' | 'running' | 'failed' | 'pending'
  startedAt: string  // ISO timestamp
  completedAt?: string
  steps: WorkflowStep[]
}

interface WorkflowStep {
  id: string
  name: string
  timestamp: string
  status: 'success' | 'failed' | 'retried' | 'pending' | 'running'
  transactionHash?: string
  agentDecisionReason?: string  // NOT applicable to x402
  errorMessage?: string
  duration?: string
  retryCount?: number
  metadata?: Record<string, string>
}
```

#### Required Adaptations

**1. Copy Dashboard to Monorepo**

```bash
# Copy entire frontend directory
cp -r /Users/rishav/Desktop/x402-observed/frontend typescript/packages/x402-observed-dashboard
```

**2. Data Model Mapping**

Transform x402 events into the existing Workflow/WorkflowStep format:

```typescript
// src/lib/transform.ts
import { WorkflowEvent, EventType } from '@x402-observed/core';

// Map event types to step names
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

// Map event types to step status
function eventToStepStatus(event: WorkflowEvent): StepStatus {
  if (event.eventType === 'workflow_completed') return 'success';
  if (event.eventType === 'verify_result' && !event.data.isValid) return 'failed';
  if (event.eventType === 'settle_result' && !event.data.success) return 'failed';
  return 'success';
}

// Transform API response to dashboard format
export function transformWorkflow(apiWorkflow: APIWorkflow): Workflow {
  return {
    id: apiWorkflow.id,
    triggerType: 'agent',  // Default - not in x402 events
    status: apiWorkflow.status,
    startedAt: new Date(apiWorkflow.createdAt).toISOString(),
    completedAt: apiWorkflow.completedAt 
      ? new Date(apiWorkflow.completedAt).toISOString() 
      : undefined,
    steps: apiWorkflow.events.map(event => ({
      id: event.id,
      name: EVENT_TO_STEP_NAME[event.eventType],
      timestamp: new Date(event.timestamp).toISOString(),
      status: eventToStepStatus(event),
      transactionHash: event.data.txHash,
      errorMessage: event.data.reason || event.data.errorMessage,
      duration: event.data.duration ? `${event.data.duration}ms` : undefined,
      // agentDecisionReason: removed (not applicable)
      // metadata: event.data (optional, for additional fields)
    })),
  };
}
```

**3. API Client Implementation**

Replace mock data with real API calls:

```typescript
// src/lib/api.ts
export interface APIWorkflow {
  id: string;
  createdAt: number;
  updatedAt: number;
  status: 'pending' | 'completed' | 'failed';
  events: WorkflowEvent[];
}

export class WorkflowAPI {
  private baseUrl = 'http://localhost:4402/api';
  
  async getWorkflows(): Promise<Workflow[]> {
    const res = await fetch(`${this.baseUrl}/workflows`);
    const data = await res.json();
    return data.workflows.map(transformWorkflow);
  }
  
  async getWorkflow(id: string): Promise<Workflow> {
    const res = await fetch(`${this.baseUrl}/workflows/${id}`);
    const data = await res.json();
    return transformWorkflow(data.workflow);
  }
  
  // SSE connection for live updates
  subscribeToEvents(onEvent: (event: WorkflowEvent) => void): () => void {
    const eventSource = new EventSource(`${this.baseUrl}/events`);
    
    eventSource.onmessage = (e) => {
      const event = JSON.parse(e.data);
      onEvent(event);
    };
    
    eventSource.onerror = () => {
      console.error('SSE connection error');
    };
    
    return () => eventSource.close();
  }
}

export const api = new WorkflowAPI();
```

**4. Update page.tsx**

Replace mock data with API calls and add SSE subscription:

```typescript
// src/app/page.tsx
"use client"

import { useState, useEffect } from "react"
import { WorkflowList } from "@/components/workflow-list"
import { ExecutionTimeline } from "@/components/execution-timeline"
import { StepInspection } from "@/components/step-inspection"
import { api } from "@/lib/api"
import { Workflow } from "@/lib/mock-data"

export default function Dashboard() {
  const [workflows, setWorkflows] = useState<Workflow[]>([]);
  const [selectedWorkflowId, setSelectedWorkflowId] = useState<string | null>(null);
  const [selectedStepId, setSelectedStepId] = useState<string | null>(null);

  // Initial load
  useEffect(() => {
    api.getWorkflows().then(setWorkflows);
  }, []);

  // SSE subscription for live updates
  useEffect(() => {
    const unsubscribe = api.subscribeToEvents((event) => {
      // Refresh workflows when new events arrive
      api.getWorkflows().then(setWorkflows);
    });
    
    return unsubscribe;
  }, []);

  const selectedWorkflow = workflows.find(w => w.id === selectedWorkflowId);
  const selectedStep = selectedWorkflow?.steps.find(s => s.id === selectedStepId) || null;

  // ... rest of component unchanged
}
```

**5. Build Configuration**

Update `next.config.ts` for static export:

```typescript
// next.config.ts
import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: 'export',  // Enable static export
  distDir: 'out',    // Output directory
};

export default nextConfig;
```

**6. Package.json Updates**

Update build script and add package metadata:

```json
{
  "name": "@x402-observed/dashboard",
  "version": "0.1.0",
  "private": true,
  "scripts": {
    "dev": "next dev --turbopack",
    "build": "next build",
    "start": "next start"
  },
  "dependencies": {
    // ... existing dependencies unchanged
  }
}
```

#### What NOT to Change

**Keep Existing (No Changes):**
- All UI components (workflow-list.tsx, execution-timeline.tsx, step-inspection.tsx)
- Color scheme and styling
- Layout structure
- Component hierarchy
- shadcn/ui components
- Tailwind configuration

**Remove/Ignore:**
- `triggerType` field (not in x402 events, default to 'agent')
- `agentDecisionReason` field (not applicable to x402)
- TriggerBadge component (can keep for visual consistency, always shows 'agent')

#### Dashboard Features (Preserved)

- **Workflow List:** Table showing all workflows with status and timestamps
- **Execution Timeline:** Vertical timeline of all events in a workflow
- **Step Details:** Right panel showing detailed information for selected step
- **Real-time Updates:** SSE connection refreshes workflow list automatically
- **Transaction Hashes:** Displayed in step inspection panel (from settle_result events)
- **Error Messages:** Displayed for failed verify/settle operations
- **Duration Display:** Shown for verify_result and settle_result events

#### Migration Checklist

**Step 1: Copy Dashboard**
```bash
cp -r /Users/rishav/Desktop/x402-observed/frontend typescript/packages/x402-observed-dashboard
```

**Step 2: Create Transform Layer**
- Create `src/lib/transform.ts` with event-to-step mapping
- Implement `transformWorkflow()` function
- Map x402 event types to step names
- Handle missing fields (triggerType defaults to 'agent', agentDecisionReason removed)

```typescript
// src/lib/transform.ts - Complete implementation
import { WorkflowEvent, EventType } from '@x402-observed/core';
import { Workflow, WorkflowStep, StepStatus } from './mock-data';

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

function eventToStepStatus(event: WorkflowEvent): StepStatus {
  if (event.eventType === 'workflow_completed') return 'success';
  if (event.eventType === 'verify_result' && !event.data.isValid) return 'failed';
  if (event.eventType === 'settle_result' && !event.data.success) return 'failed';
  return 'success';
}

export function transformWorkflow(apiWorkflow: APIWorkflow): Workflow {
  return {
    id: apiWorkflow.id,
    triggerType: 'agent',  // Default - not in x402 events
    status: apiWorkflow.status,
    startedAt: new Date(apiWorkflow.createdAt).toISOString(),
    completedAt: apiWorkflow.completedAt 
      ? new Date(apiWorkflow.completedAt).toISOString() 
      : undefined,
    steps: apiWorkflow.events.map(event => ({
      id: event.id,
      name: EVENT_TO_STEP_NAME[event.eventType],
      timestamp: new Date(event.timestamp).toISOString(),
      status: eventToStepStatus(event),
      transactionHash: event.data.txHash,
      errorMessage: event.data.reason || event.data.errorMessage,
      duration: event.data.duration ? `${event.data.duration}ms` : undefined,
    })),
  };
}
```

**Step 3: Create API Client**
- Create `src/lib/api.ts` with WorkflowAPI class
- Implement `getWorkflows()` and `getWorkflow()` methods
- Implement `subscribeToEvents()` for SSE

**Step 4: Update page.tsx**
- Replace `mockWorkflows` import with `api` import
- Add `useEffect` for initial data load
- Add `useEffect` for SSE subscription
- Keep all other logic unchanged

**Step 5: Update Build Config**
- Add `output: 'export'` to next.config.ts
- Verify build outputs to `out/` directory

**Step 6: Test Integration**
- Run `pnpm build` in dashboard package
- Verify static files in `out/` directory
- Test CLI serving dashboard files
- Verify API calls work from dashboard

#### CLI Integration

The CLI package serves the built dashboard:

```typescript
// packages/x402-observed-cli/src/server.ts
import express from 'express';
import path from 'path';

export function createServer() {
  const app = express();
  
  // ... API routes ...
  
  // Serve dashboard static files
  const dashboardPath = path.join(__dirname, '../../x402-observed-dashboard/out');
  app.use(express.static(dashboardPath));
  
  // SPA fallback
  app.get('*', (req, res) => {
    res.sendFile(path.join(dashboardPath, 'index.html'));
  });
  
  return app;
}
```

## Data Models

### Workflow

```typescript
interface Workflow {
  id: string;
  createdAt: number;      // Unix timestamp (ms)
  updatedAt: number;      // Unix timestamp (ms)
  status: 'pending' | 'completed' | 'failed';
  events: WorkflowEvent[];
}
```

### WorkflowEvent

```typescript
interface WorkflowEvent {
  id: string;             // UUID
  workflowId: string;
  eventType: EventType;
  timestamp: number;      // Unix timestamp (ms) - from actual event
  data: EventData;
}

type EventData = 
  | RequestReceivedData
  | PaymentRequiredData
  | PaymentHeaderReceivedData
  | VerifyCalledData
  | VerifyResultData
  | SettleCalledData
  | SettleResultData
  | WorkflowCompletedData;

interface RequestReceivedData {
  method: string;
  path: string;
  headers?: Record<string, string>;
}

interface PaymentRequiredData {
  statusCode: 402;
  paymentRequired?: PaymentRequired;
}

interface PaymentHeaderReceivedData {
  paymentHeader: string;
}

interface VerifyCalledData {
  paymentPayload: PaymentPayload;
  paymentRequirements: PaymentRequirements;
}

interface VerifyResultData {
  isValid: boolean;
  reason?: string;
  duration: number;  // milliseconds
}

interface SettleCalledData {
  paymentPayload: PaymentPayload;
  paymentRequirements: PaymentRequirements;
}

interface SettleResultData {
  success: boolean;
  txHash?: string;
  network?: string;
  duration: number;  // milliseconds
}

interface WorkflowCompletedData {
  statusCode: 200;
  totalDuration: number;  // milliseconds
}
```


## Correctness Properties

A property is a characteristic or behavior that should hold true across all valid executions of a system—essentially, a formal statement about what the system should do. Properties serve as the bridge between human-readable specifications and machine-verifiable correctness guarantees.

### Property 1: API Compatibility Across Frameworks

*For any* valid configuration (routes, server, paywall config), the observed paymentMiddleware function signature and return type SHALL be identical to the original x402 middleware for both Express and Next.js frameworks.

**Validates: Requirements 1.1, 1.2**

### Property 2: Behavioral Transparency

*For any* HTTP request processed through the observed middleware, the response (status code, headers, body) SHALL be identical to what the original x402 middleware would produce.

**Validates: Requirements 1.3**

### Property 3: Facilitator Method Interception Logging

*For any* call to HTTPFacilitatorClient.verify() or settle(), the observer SHALL log both a `*_called` event before invocation and a `*_result` event after completion, with each event containing the actual timestamp of occurrence.

**Validates: Requirements 2.2, 2.3, 2.4, 2.5, 3.4, 3.5, 3.6, 3.7**

### Property 4: Return Value Preservation

*For any* facilitator method call (verify or settle), the proxy SHALL return exactly the same value (or throw the same error) as the original HTTPFacilitatorClient would return.

**Validates: Requirements 2.6**

### Property 5: Workflow Creation Uniqueness

*For any* HTTP request entering the observed middleware, exactly one workflow record SHALL be created with a unique workflow ID and a request_received event.

**Validates: Requirements 3.1**

### Property 6: Event-Response Correlation

*For any* HTTP response with status code 402, a payment_required event SHALL be logged; for any response with status code 200 after payment processing, a workflow_completed event SHALL be logged.

**Validates: Requirements 3.2, 3.8**

### Property 7: Payment Header Detection

*For any* HTTP request containing a payment header (payment-signature or x-payment), a payment_header_received event SHALL be logged with the workflow ID.

**Validates: Requirements 3.3**

### Property 8: Timestamp Authenticity

*For any* event logged to the database, the timestamp SHALL be the actual time the event occurred, not a generated timestamp from Date.now() called during logging.

**Validates: Requirements 3.9, 9.5**

### Property 9: Event Insertion Success

*For any* valid WorkflowEvent, calling EventStorage.insertEvent() SHALL successfully insert the event into the SQLite database.

**Validates: Requirements 4.2**

### Property 10: Event Idempotency

*For any* WorkflowEvent, inserting it N times (where N ≥ 1) SHALL result in exactly one record in the database with that event ID.

**Validates: Requirements 4.3**

### Property 11: Database Initialization Idempotency

*For any* EventStorage instance, calling initialize() multiple times SHALL not corrupt the database or fail, and the schema SHALL remain valid.

**Validates: Requirements 4.5**

### Property 12: SSE Event Broadcasting

*For any* event written to SQLite, all currently connected SSE clients SHALL receive the event through their Server-Sent Events connection.

**Validates: Requirements 6.4, 8.1**

### Property 13: SSE Client Isolation

*For any* SSE client disconnection, all other connected clients SHALL remain connected and continue receiving events without interruption.

**Validates: Requirements 8.3**

### Property 14: Multi-Workflow Event Streaming

*For any* set of active workflows, all events from all workflows SHALL be streamed to connected SSE clients regardless of the number of concurrent workflows.

**Validates: Requirements 8.4**

### Property 15: Workflow Retrieval Completeness

*For any* database state, calling GET /api/workflows SHALL return all workflows in the database with all their associated events.

**Validates: Requirements 9.1, 9.3**

### Property 16: Workflow ID Lookup

*For any* valid workflow ID in the database, calling GET /api/workflows/:id SHALL return that specific workflow with all its events.

**Validates: Requirements 9.2**

### Property 17: Transaction Hash Preservation

*For any* workflow containing a settle_result event with a transaction hash, the API response SHALL include that transaction hash in the event data.

**Validates: Requirements 9.4**

### Property 18: Dependency Acyclicity

*For any* package in the @x402-observed namespace, the transitive dependency graph SHALL NOT contain cycles (no package depends on itself directly or indirectly).

**Validates: Requirements 7.6**

## Error Handling

### Proxy Error Handling

The FacilitatorProxy must preserve all error behavior from the original HTTPFacilitatorClient:

1. **Verification Errors:** If verify() throws a VerifyError, the proxy logs the error event and re-throws the exact same error
2. **Settlement Errors:** If settle() throws a SettleError, the proxy logs the error event and re-throws the exact same error
3. **Network Errors:** Any network-level errors are logged and re-thrown without modification
4. **Timeout Errors:** Timeout behavior is preserved exactly as the original client implements it

### Database Error Handling

SQLite operations must handle errors gracefully:

1. **Database Locked:** Retry with exponential backoff (max 3 attempts)
2. **Disk Full:** Log error and fail gracefully without crashing the middleware
3. **Schema Mismatch:** Detect version mismatch and provide clear error message
4. **Constraint Violations:** Idempotent inserts use INSERT OR IGNORE, so violations are silent

### SSE Error Handling

Server-Sent Events connections must handle failures:

1. **Client Disconnect:** Clean up client from manager without affecting other clients
2. **Write Errors:** If writing to a client fails, remove that client and continue with others
3. **Broadcast Errors:** If broadcasting fails for one client, continue broadcasting to remaining clients

### API Error Handling

REST API endpoints must return appropriate HTTP status codes:

1. **404 Not Found:** When workflow ID doesn't exist
2. **500 Internal Server Error:** When database query fails
3. **503 Service Unavailable:** When database is not initialized

## Testing Strategy

The x402-observed tool requires both unit tests and property-based tests to ensure correctness and reliability.

### Property-Based Testing

Property-based tests validate universal properties across many generated inputs. We will use **fast-check** for TypeScript property-based testing.

**Configuration:**
- Minimum 100 iterations per property test
- Each test tagged with: `Feature: x402-observed-tool, Property N: [property text]`
- Tests run in CI on every commit

**Property Test Examples:**

```typescript
// Property 4: Return Value Preservation
import fc from 'fast-check';

test('Feature: x402-observed-tool, Property 4: Return Value Preservation', async () => {
  await fc.assert(
    fc.asyncProperty(
      fc.record({
        paymentPayload: arbitraryPaymentPayload(),
        paymentRequirements: arbitraryPaymentRequirements(),
      }),
      async ({ paymentPayload, paymentRequirements }) => {
        const mockClient = createMockFacilitatorClient();
        const proxy = new FacilitatorProxy(mockClient, testConfig);
        
        const originalResult = await mockClient.verify(paymentPayload, paymentRequirements);
        const proxyResult = await proxy.getProxy().verify(paymentPayload, paymentRequirements);
        
        expect(proxyResult).toEqual(originalResult);
      }
    ),
    { numRuns: 100 }
  );
});

// Property 10: Event Idempotency
test('Feature: x402-observed-tool, Property 10: Event Idempotency', async () => {
  await fc.assert(
    fc.asyncProperty(
      arbitraryWorkflowEvent(),
      fc.integer({ min: 1, max: 10 }),
      async (event, insertCount) => {
        const storage = new EventStorage(':memory:');
        storage.initialize();
        
        // Insert the same event N times
        for (let i = 0; i < insertCount; i++) {
          storage.insertEvent(event);
        }
        
        // Should have exactly one record
        const events = storage.getEventsByWorkflowId(event.workflowId);
        expect(events.filter(e => e.id === event.id)).toHaveLength(1);
      }
    ),
    { numRuns: 100 }
  );
});
```

### Unit Testing

Unit tests validate specific examples, edge cases, and integration points.

**Test Organization:**
```
packages/x402-observed-core/
└── test/
    ├── unit/
    │   ├── proxy.test.ts
    │   ├── storage.test.ts
    │   └── tracker.test.ts
    └── integration/
        └── end-to-end.test.ts
```

**Unit Test Focus Areas:**

1. **Proxy Behavior:**
   - Verify method interception
   - Settle method interception
   - Error propagation
   - Timestamp capture

2. **Storage Layer:**
   - Database initialization
   - Event insertion
   - Query operations
   - Schema migrations

3. **Middleware Integration:**
   - Request interception
   - Response wrapping
   - Workflow lifecycle
   - Error handling

4. **API Endpoints:**
   - GET /api/workflows returns correct format
   - GET /api/workflows/:id handles missing IDs
   - SSE connection establishment
   - SSE message format

5. **Edge Cases:**
   - Empty database queries
   - Concurrent workflow creation
   - Rapid event insertion
   - SSE client disconnection during broadcast

**Example Unit Tests:**

```typescript
// Edge case: Empty database
test('GET /api/workflows returns empty array when no workflows exist', async () => {
  const storage = new EventStorage(':memory:');
  storage.initialize();
  
  const workflows = storage.getAllWorkflows();
  expect(workflows).toEqual([]);
});

// Edge case: Missing workflow ID
test('GET /api/workflows/:id returns null for non-existent workflow', async () => {
  const storage = new EventStorage(':memory:');
  storage.initialize();
  
  const workflow = storage.getWorkflowById('non-existent-id');
  expect(workflow).toBeNull();
});

// Integration: Full workflow
test('Complete payment workflow logs all expected events', async () => {
  const storage = new EventStorage(':memory:');
  storage.initialize();
  const tracker = new WorkflowTracker(storage);
  
  const workflowId = tracker.createWorkflow();
  
  // Simulate full workflow
  tracker.logEvent(workflowId, EventType.REQUEST_RECEIVED, Date.now(), {});
  tracker.logEvent(workflowId, EventType.PAYMENT_REQUIRED, Date.now(), {});
  tracker.logEvent(workflowId, EventType.PAYMENT_HEADER_RECEIVED, Date.now(), {});
  tracker.logEvent(workflowId, EventType.VERIFY_CALLED, Date.now(), {});
  tracker.logEvent(workflowId, EventType.VERIFY_RESULT, Date.now(), { isValid: true });
  tracker.logEvent(workflowId, EventType.SETTLE_CALLED, Date.now(), {});
  tracker.logEvent(workflowId, EventType.SETTLE_RESULT, Date.now(), { txHash: '0x123' });
  tracker.logEvent(workflowId, EventType.WORKFLOW_COMPLETED, Date.now(), {});
  
  const events = storage.getEventsByWorkflowId(workflowId);
  expect(events).toHaveLength(8);
  expect(events.map(e => e.eventType)).toEqual([
    'request_received',
    'payment_required',
    'payment_header_received',
    'verify_called',
    'verify_result',
    'settle_called',
    'settle_result',
    'workflow_completed',
  ]);
});
```

### Testing Balance

- **Property tests** handle comprehensive input coverage and universal correctness
- **Unit tests** handle specific examples, edge cases, and integration validation
- Both are necessary and complementary
- Avoid writing too many unit tests for cases that property tests already cover
- Focus unit tests on concrete scenarios that demonstrate correct behavior

### Test Execution

```bash
# Run all tests
pnpm test

# Run property tests only
pnpm test:property

# Run unit tests only
pnpm test:unit

# Watch mode for development
pnpm test:watch
```

### CI Integration

All tests run on every commit:
- Property tests with 100 iterations
- Unit tests with coverage reporting
- Integration tests against real SQLite database
- Linting and type checking

## Implementation Notes

### Package Build Order

Due to dependencies, packages must be built in this order:
1. @x402-observed/core
2. @x402-observed/express and @x402-observed/next (parallel)
3. @x402-observed/dashboard
4. x402-observed (CLI)

### TypeScript Configuration

All packages use strict TypeScript configuration:
```json
{
  "compilerOptions": {
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "forceConsistentCasingInFileNames": true,
    "resolveJsonModule": true,
    "moduleResolution": "node",
    "target": "ES2020",
    "module": "commonjs"
  }
}
```

### Build Tool Configuration

Using tsup for building:
```typescript
// tsup.config.ts
import { defineConfig } from 'tsup';

export default defineConfig({
  entry: ['src/index.ts'],
  format: ['cjs', 'esm'],
  dts: true,
  splitting: false,
  sourcemap: true,
  clean: true,
});
```

### Database Schema Versioning

The SQLite schema includes a version table for future migrations:
```sql
CREATE TABLE IF NOT EXISTS schema_version (
  version INTEGER PRIMARY KEY,
  applied_at INTEGER NOT NULL
);

INSERT OR IGNORE INTO schema_version (version, applied_at) 
VALUES (1, strftime('%s', 'now') * 1000);
```

### Performance Considerations

1. **Database Writes:** Use prepared statements for all inserts
2. **SSE Broadcasting:** Async broadcast to avoid blocking event logging
3. **Proxy Overhead:** Minimal - only adds timestamp capture and async logging
4. **Memory Usage:** SSE clients stored in WeakMap for automatic cleanup

### Security Considerations

1. **SQL Injection:** All queries use parameterized statements
2. **Path Traversal:** Database path is fixed to `.x402-observed/events.db`
3. **CORS:** API endpoints only accessible from localhost
4. **Authentication:** Not required - tool is for local development only

### Deployment Considerations

1. **NPM Publishing:** Only CLI package is published to npm
2. **Dashboard Distribution:** Bundled with CLI package as static files
3. **Version Alignment:** All @x402-observed packages share the same version
4. **Changelog:** Use changesets for version management
