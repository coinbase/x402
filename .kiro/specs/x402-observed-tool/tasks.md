# Implementation Plan: x402-observed Tool

## Overview

This implementation plan breaks down the x402-observed tool into discrete coding tasks across five TypeScript packages. The tool provides zero-configuration observability for x402 payment workflows through transparent interception, SQLite storage, and a real-time dashboard.

The implementation follows a bottom-up approach: core infrastructure first, then framework integrations, then dashboard adaptation, and finally CLI assembly.

## Current Status

Most core implementation is complete. The remaining work focuses on:
- Property-based tests for correctness validation
- Unit tests for edge cases and error scenarios
- Documentation and README files
- Changeset configuration for versioning
- Final integration testing and validation

## Tasks

- [x] 1. Set up monorepo package structure and build tooling
  - Create directory structure for all five packages
  - Create package.json files with correct dependencies
  - Create tsconfig.json, tsup.config.ts, vitest.config.ts for each package
  - Configure pnpm workspace in root package.json
  - _Requirements: 10.1, 10.2, 10.3, 10.4, 10.5, 10.6, 10.7, 10.8, 10.9, 11.1, 11.2, 11.3, 11.4, 11.5_

- [x] 2. Implement @x402-observed/core package
  - [x] 2.1 Create event types and interfaces
    - Define EventType enum with all 8 event types
    - Define WorkflowEvent interface
    - Define all EventData type variants (RequestReceivedData, VerifyResultData, etc.)
    - Define Workflow interface
    - _Requirements: 3.1, 3.2, 3.3, 3.4, 3.5, 3.6, 3.7, 3.8_
  
  - [x] 2.2 Implement EventStorage class with SQLite
    - Create SQLite schema (workflows table, events table, indexes)
    - Implement initialize() method with idempotent schema creation
    - Implement insertEvent() with INSERT OR IGNORE for idempotency
    - Implement getAllWorkflows() query method
    - Implement getWorkflowById() query method
    - Implement getEventsByWorkflowId() query method
    - Add onEvent() callback mechanism for SSE broadcasting
    - Use better-sqlite3 with prepared statements
    - _Requirements: 4.1, 4.2, 4.3, 4.4, 4.5_
  
  - [ ]* 2.3 Write property test for EventStorage
    - **Property 10: Event Idempotency**
    - **Validates: Requirements 4.3**
  
  - [ ]* 2.4 Write property test for database initialization
    - **Property 11: Database Initialization Idempotency**
    - **Validates: Requirements 4.5**
  
  - [x] 2.5 Implement WorkflowTracker class
    - Implement createWorkflow() to generate unique workflow IDs
    - Implement logEvent() to insert events with actual timestamps
    - Implement completeWorkflow() to update workflow status
    - _Requirements: 3.1, 3.8, 3.9_
  
  - [ ]* 2.6 Write property test for workflow creation
    - **Property 5: Workflow Creation Uniqueness**
    - **Validates: Requirements 3.1**
  
  - [ ]* 2.7 Write property test for timestamp authenticity
    - **Property 8: Timestamp Authenticity**
    - **Validates: Requirements 3.9, 9.5**
  
  - [x] 2.8 Implement FacilitatorProxy class
    - Create JavaScript Proxy wrapper for HTTPFacilitatorClient
    - Intercept verify() method: log verify_called before, verify_result after
    - Intercept settle() method: log settle_called before, settle_result after
    - Capture actual timestamps at event occurrence
    - Preserve original return values and error behavior
    - Extract transaction hash from settle() result
    - _Requirements: 2.1, 2.2, 2.3, 2.4, 2.5, 2.6_
  
  - [ ]* 2.9 Write property test for facilitator interception
    - **Property 3: Facilitator Method Interception Logging**
    - **Validates: Requirements 2.2, 2.3, 2.4, 2.5, 3.4, 3.5, 3.6, 3.7**
  
  - [ ]* 2.10 Write property test for return value preservation
    - **Property 4: Return Value Preservation**
    - **Validates: Requirements 2.6**
  
  - [ ]* 2.11 Write unit tests for error handling
    - Test database locked retry logic
    - Test disk full graceful failure
    - Test proxy error propagation
    - _Requirements: 2.6_

- [x] 3. Checkpoint - Ensure core package tests pass
  - Ensure all tests pass, ask the user if questions arise.

- [x] 4. Implement @x402-observed/express package
  - [x] 4.1 Create observed paymentMiddleware wrapper
    - Import original paymentMiddleware from @x402/express
    - Initialize EventStorage at .x402-observed/events.db
    - Create WorkflowTracker instance
    - Wrap middleware to create workflow on each request
    - Log request_received event with actual timestamp
    - Wrap HTTPFacilitatorClient with FacilitatorProxy
    - Intercept res.status() to log payment_required on 402
    - Detect payment header and log payment_header_received
    - Listen to res 'finish' event to log workflow_completed on 200
    - Call original middleware with all original parameters
    - _Requirements: 1.1, 1.3, 1.4, 2.1, 3.1, 3.2, 3.3, 3.8_
  
  - [ ]* 4.2 Write property test for API compatibility
    - **Property 1: API Compatibility Across Frameworks**
    - **Validates: Requirements 1.1, 1.2**
  
  - [ ]* 4.3 Write property test for behavioral transparency
    - **Property 2: Behavioral Transparency**
    - **Validates: Requirements 1.3**
  
  - [ ]* 4.4 Write property test for event-response correlation
    - **Property 6: Event-Response Correlation**
    - **Validates: Requirements 3.2, 3.8**
  
  - [ ]* 4.5 Write property test for payment header detection
    - **Property 7: Payment Header Detection**
    - **Validates: Requirements 3.3**
  
  - [ ]* 4.6 Write unit tests for middleware integration
    - Test full workflow event sequence
    - Test 402 response logging
    - Test payment header detection
    - Test workflow completion
    - _Requirements: 3.1, 3.2, 3.3, 3.8_

- [x] 5. Implement @x402-observed/next package
  - [x] 5.1 Create observed paymentMiddleware for Next.js
    - Import original paymentMiddleware from @x402/next
    - Adapt Express middleware logic for Next.js Request/Response API
    - Use same EventStorage, WorkflowTracker, FacilitatorProxy pattern
    - Ensure identical behavior to Express package
    - _Requirements: 1.2, 1.3, 1.4_
  
  - [ ]* 5.2 Write unit tests for Next.js middleware
    - Test Next.js-specific request/response handling
    - Test workflow event sequence
    - _Requirements: 1.2_

- [x] 6. Checkpoint - Ensure middleware packages tests pass
  - Ensure all tests pass, ask the user if questions arise.

- [x] 7. Implement @x402-observed/dashboard package
  - [x] 7.1 Copy existing dashboard to monorepo
    - Copy /Users/rishav/Desktop/x402-observed/frontend to typescript/packages/x402-observed-dashboard
    - Verify all existing components, styles, and configuration are preserved
    - _Requirements: 6.1, 6.5_
  
  - [x] 7.2 Create data transform layer
    - Create src/lib/transform.ts
    - Define EVENT_TO_STEP_NAME mapping for all 8 event types
    - Implement eventToStepStatus() function
    - Implement transformWorkflow() to convert API format to dashboard format
    - Handle missing fields (triggerType defaults to 'agent', remove agentDecisionReason)
    - Map transaction hashes from settle_result events
    - _Requirements: 6.5_
  
  - [x] 7.3 Create API client
    - Create src/lib/api.ts with WorkflowAPI class
    - Implement getWorkflows() to fetch from http://localhost:4402/api/workflows
    - Implement getWorkflow(id) to fetch from http://localhost:4402/api/workflows/:id
    - Implement subscribeToEvents() for SSE connection to http://localhost:4402/api/events
    - Handle EventSource connection and cleanup
    - _Requirements: 6.1, 6.2, 6.3_
  
  - [x] 7.4 Update page.tsx to use real API
    - Replace mock data import with api import
    - Add useEffect for initial data load via api.getWorkflows()
    - Add useEffect for SSE subscription via api.subscribeToEvents()
    - Refresh workflows when SSE events arrive
    - Keep all existing UI components unchanged
    - _Requirements: 6.1, 6.2, 6.3, 6.4_
  
  - [x] 7.5 Configure Next.js for static export
    - Update next.config.ts with output: 'export' and distDir: 'out'
    - Update package.json build script
    - Verify build outputs static files to out/ directory
    - _Requirements: 5.2_
  
  - [ ]* 7.6 Write unit tests for transform layer
    - Test EVENT_TO_STEP_NAME mapping
    - Test eventToStepStatus() for all event types
    - Test transformWorkflow() with various event combinations
    - _Requirements: 6.5_

- [ ] 8. Implement x402-observed CLI package
  - [x] 8.1 Create Express server setup
    - Create src/server.ts with createServer() function
    - Initialize EventStorage at .x402-observed/events.db
    - Set up Express app with JSON middleware
    - Configure static file serving for dashboard (from ../x402-observed-dashboard/out)
    - Add SPA fallback route
    - _Requirements: 5.1, 5.2, 5.6_
  
  - [x] 8.2 Implement REST API routes
    - Create API routes for workflows
    - Implement GET /api/workflows to return all workflows with events
    - Implement GET /api/workflows/:id to return specific workflow
    - Handle 404 for missing workflow IDs
    - Handle 500 for database errors
    - Include transaction hashes in settle_result events
    - Use actual event timestamps
    - _Requirements: 5.3, 9.1, 9.2, 9.3, 9.4, 9.5_
  
  - [ ]* 8.3 Write property test for workflow retrieval
    - **Property 15: Workflow Retrieval Completeness**
    - **Validates: Requirements 9.1, 9.3**
  
  - [ ]* 8.4 Write property test for workflow ID lookup
    - **Property 16: Workflow ID Lookup**
    - **Validates: Requirements 9.2**
  
  - [ ]* 8.5 Write property test for transaction hash preservation
    - **Property 17: Transaction Hash Preservation**
    - **Validates: Requirements 9.4**
  
  - [x] 8.6 Implement SSE handler
    - Create src/sse.ts with SSEManager class
    - Implement addClient() to register SSE connections
    - Implement removeClient() to clean up disconnected clients
    - Implement broadcast() to send events to all clients
    - Create createSSEHandler() function for GET /api/events
    - Set SSE headers (Content-Type: text/event-stream, Cache-Control: no-cache)
    - Connect EventStorage.onEvent() to SSEManager.broadcast()
    - Handle client disconnection cleanup
    - _Requirements: 5.4, 6.3, 6.4, 8.1, 8.2, 8.3, 8.4_
  
  - [ ]* 8.7 Write property test for SSE broadcasting
    - **Property 12: SSE Event Broadcasting**
    - **Validates: Requirements 6.4, 8.1**
  
  - [ ]* 8.8 Write property test for SSE client isolation
    - **Property 13: SSE Client Isolation**
    - **Validates: Requirements 8.3**
  
  - [ ]* 8.9 Write property test for multi-workflow streaming
    - **Property 14: Multi-Workflow Event Streaming**
    - **Validates: Requirements 8.4**
  
  - [x] 8.10 Create CLI entry point
    - Create src/index.ts with shebang (#!/usr/bin/env node)
    - Import createServer() from server.ts
    - Start server on port 4402
    - Log dashboard URL to console
    - Handle graceful shutdown
    - _Requirements: 5.1, 5.5_
  
  - [x] 8.11 Configure package.json bin entry
    - Add "bin" field pointing to dist/index.js
    - Set package name to "x402-observed"
    - Configure main, module, types fields
    - _Requirements: 10.7_
  
  - [ ]* 8.12 Write unit tests for API endpoints
    - Test GET /api/workflows with empty database
    - Test GET /api/workflows with multiple workflows
    - Test GET /api/workflows/:id with valid ID
    - Test GET /api/workflows/:id with invalid ID (404)
    - Test SSE connection establishment
    - Test SSE message format
    - _Requirements: 9.1, 9.2_

- [x] 9. Checkpoint - Ensure CLI package tests pass
  - Ensure all tests pass, ask the user if questions arise.

- [ ] 10. Integration and end-to-end testing
  - [x] 10.1 Create integration test suite
    - Test full workflow: Express middleware → SQLite → API → Dashboard
    - Test concurrent workflows
    - Test SSE live updates
    - Test dashboard data refresh
    - _Requirements: 1.1, 1.2, 1.3, 6.1, 6.2, 6.3, 6.4_
  
  - [ ]* 10.2 Write property test for dependency acyclicity
    - **Property 18: Dependency Acyclicity**
    - **Validates: Requirements 7.6**
  
  - [ ]* 10.3 Write integration tests for error scenarios
    - Test database locked scenario
    - Test SSE client disconnect during broadcast
    - Test facilitator error propagation
    - _Requirements: 2.6, 8.3_

- [x] 11. Build configuration and tooling
  - [x] 11.1 Configure tsup for all packages
    - Create tsup.config.ts for each package
    - Configure dual output (CJS and ESM)
    - Enable source maps and type declarations
    - _Requirements: 11.1, 11.5_
  
  - [x] 11.2 Configure vitest for all packages
    - Create vitest.config.ts for each package
    - Configure test environment (node for backend, jsdom for dashboard)
    - Set up fast-check for property tests
    - Configure minimum 100 iterations for property tests
    - _Requirements: 11.2_
  
  - [x] 11.3 Add build scripts to package.json files
    - Add "build" script using tsup
    - Add "test" script using vitest
    - Add "test:watch" script for development
    - Add "lint" script using ESLint
    - _Requirements: 11.1, 11.2, 11.6_
  
  - [x] 11.4 Configure ESLint and Prettier
    - Create eslint.config.js for each package
    - Configure TypeScript rules
    - Set up Prettier integration
    - _Requirements: 11.3, 11.4_

- [x] 12. Create example projects for validation
  - [x] 12.1 Create Next.js example project
    - Create examples/nextjs-example directory
    - Initialize Next.js project with TypeScript
    - Install @x402-observed/next as dependency
    - Create API route that uses observed paymentMiddleware
    - Add simple frontend to trigger payment flow
    - Add README with setup and testing instructions
    - Verify workflow events are logged to .x402-observed/events.db
    - _Requirements: 1.2, 1.3, 1.4_
  
  - [x] 12.2 Create React-Express example project
    - Create examples/express-example directory
    - Initialize Express server with TypeScript
    - Install @x402-observed/express as dependency
    - Create Express route that uses observed paymentMiddleware
    - Add simple React frontend (or HTML) to trigger payment flow
    - Add README with setup and testing instructions
    - Verify workflow events are logged to .x402-observed/events.db
    - _Requirements: 1.1, 1.3, 1.4_
  
  - [x] 12.3 Test example projects end-to-end
    - Run Next.js example and verify events are captured
    - Run Express example and verify events are captured
    - Start x402-observed CLI and verify dashboard displays workflows from examples
    - Verify SSE updates work with live workflow execution
    - Document any issues or improvements needed
    - _Requirements: 1.1, 1.2, 1.3, 6.1, 6.2, 6.3, 6.4_

- [ ] 13. Documentation and changesets
  - [ ] 13.1 Create README files for each package
    - Document installation and usage
    - Provide code examples
    - Explain zero-config philosophy
    - _Requirements: 1.4, 5.5_
  
  - [ ] 13.2 Set up changeset configuration
    - Initialize changesets in monorepo
    - Document changeset workflow
    - Create initial changeset for v0.1.0
    - _Requirements: 12.1, 12.2, 12.3, 12.4_
  
  - [x] 13.3 Create root README
    - Explain monorepo structure
    - Document package relationships
    - Provide quick start guide
    - Link to individual package READMEs
    - Link to example projects
    - _Requirements: 10.1, 10.2, 10.3, 10.4, 10.5, 10.6_

- [ ] 14. Final checkpoint - Ensure all tests pass and build succeeds
  - Run pnpm build in all packages
  - Run pnpm test in all packages
  - Verify CLI can be run with npx
  - Verify dashboard loads and displays data
  - Test both example projects work correctly
  - Ensure all tests pass, ask the user if questions arise.

## Notes

- Tasks marked with `*` are optional property-based and unit tests that can be skipped for faster MVP
- Each task references specific requirements for traceability
- Build order matters: core → express/next → dashboard → CLI
- The dashboard is adapted from existing code, not rewritten from scratch
- All packages use TypeScript with strict mode
- Property tests use fast-check with minimum 100 iterations
- SQLite database is stored at .x402-observed/events.db in project root
- Zero configuration required from developers
