# Requirements Document: x402-observed Tool

## Introduction

The x402-observed tool is a zero-configuration observability solution for x402 payment workflows. It provides developers with real-time visibility into HTTP 402 payment flows through a drop-in replacement for existing x402 middleware, combined with a local dashboard similar to "npx prisma studio". The tool intercepts and logs all payment workflow events to a local SQLite database without modifying the original x402 behavior.

## Glossary

- **x402**: HTTP 402 Payment Required protocol implementation
- **HTTPFacilitatorClient**: Core x402 class that handles verify() and settle() calls to payment facilitators
- **Payment_Middleware**: Express/Next.js middleware function that enforces 402 payment requirements
- **Workflow**: Complete sequence of events from initial request through payment verification and settlement
- **Facilitator**: External service that verifies and settles payments
- **Observer**: Proxy wrapper that intercepts and logs x402 operations without modifying behavior
- **Dashboard**: Local web UI for viewing workflow events and payment data
- **CLI**: Command-line interface tool invoked via npx
- **Event**: Timestamped record of a specific action in the payment workflow
- **SQLite_Database**: Local file-based database stored at .x402-observed/events.db

## Requirements

### Requirement 1: Drop-in Middleware Replacement

**User Story:** As a developer, I want to enable observability by changing a single import statement, so that I can add monitoring without refactoring my codebase.

#### Acceptance Criteria

1. WHEN a developer imports paymentMiddleware from @x402-observed/express, THE System SHALL provide identical function signature and behavior to @x402/express
2. WHEN a developer imports paymentMiddleware from @x402-observed/next, THE System SHALL provide identical function signature and behavior to @x402/next
3. WHEN the observed middleware processes a request, THE System SHALL invoke the original x402 middleware without modifying its behavior
4. WHEN the observed middleware is used, THE System SHALL require zero configuration or environment variables from the developer

### Requirement 2: HTTPFacilitatorClient Interception

**User Story:** As a developer, I want all facilitator interactions to be automatically logged, so that I can debug payment verification and settlement issues.

#### Acceptance Criteria

1. WHEN the observed middleware is initialized, THE System SHALL wrap HTTPFacilitatorClient using a JavaScript Proxy
2. WHEN HTTPFacilitatorClient.verify() is called, THE Observer SHALL log the call with timestamp before invoking the original method
3. WHEN HTTPFacilitatorClient.verify() returns, THE Observer SHALL log the result with timestamp and verification status
4. WHEN HTTPFacilitatorClient.settle() is called, THE Observer SHALL log the call with timestamp before invoking the original method
5. WHEN HTTPFacilitatorClient.settle() returns, THE Observer SHALL log the result with timestamp and transaction hash
6. WHEN any facilitator method is intercepted, THE Observer SHALL preserve the original return value and error behavior

### Requirement 3: Workflow Event Tracking

**User Story:** As a developer, I want to see the complete timeline of each payment workflow, so that I can understand where delays or failures occur.

#### Acceptance Criteria

1. WHEN an HTTP request enters the middleware, THE System SHALL create a workflow record with a unique workflow ID and log a request_received event
2. WHEN the middleware returns a 402 response, THE System SHALL log a payment_required event with the workflow ID
3. WHEN a request includes a payment header, THE System SHALL log a payment_header_received event with the workflow ID
4. WHEN verify() is called on the facilitator, THE System SHALL log a verify_called event with the workflow ID
5. WHEN verify() returns, THE System SHALL log a verify_result event with the workflow ID and verification outcome
6. WHEN settle() is called on the facilitator, THE System SHALL log a settle_called event with the workflow ID
7. WHEN settle() returns, THE System SHALL log a settle_result event with the workflow ID and transaction hash
8. WHEN a workflow completes successfully, THE System SHALL log a workflow_completed event with the workflow ID
9. WHEN logging any event, THE System SHALL use the actual event timestamp, not Date.now()

### Requirement 4: SQLite Event Storage

**User Story:** As a developer, I want workflow events stored locally without infrastructure setup, so that I can inspect payment data without configuring databases.

#### Acceptance Criteria

1. WHEN the observed middleware is first used, THE System SHALL create a SQLite database at .x402-observed/events.db in the project root
2. WHEN an event is logged, THE System SHALL insert it into the SQLite database with idempotent behavior
3. WHEN the same event is logged multiple times, THE System SHALL ensure only one record exists (idempotency)
4. WHEN storing events, THE System SHALL use better-sqlite3 as the SQLite driver
5. WHEN the database file exists, THE System SHALL reuse it without recreating the schema

### Requirement 5: Zero-Configuration CLI

**User Story:** As a developer, I want to run "npx x402-observed" to launch the dashboard, so that I can view payment workflows without any setup.

#### Acceptance Criteria

1. WHEN a developer runs "npx x402-observed", THE CLI SHALL start an Express server on port 4402
2. WHEN the CLI starts, THE System SHALL serve the dashboard static files from the Express server
3. WHEN the CLI starts, THE System SHALL expose a REST API at /api/workflows that reads from the SQLite database
4. WHEN the CLI starts, THE System SHALL expose an SSE endpoint at /api/events for live workflow updates
5. WHEN the CLI starts, THE System SHALL require zero configuration or command-line arguments
6. WHEN the CLI starts, THE System SHALL read the SQLite database from .x402-observed/events.db in the current directory

### Requirement 6: Dashboard Data Integration

**User Story:** As a developer, I want the existing Next.js dashboard to display workflow data from SQLite, so that I can reuse the UI without rewriting it.

#### Acceptance Criteria

1. WHEN the dashboard loads, THE System SHALL fetch workflow data from http://localhost:4402/api/workflows
2. WHEN the dashboard polls for updates, THE System SHALL request data from the REST API endpoint
3. WHEN the dashboard connects to SSE, THE System SHALL establish a connection to http://localhost:4402/api/events
4. WHEN a new event is written to SQLite, THE System SHALL push the update through the SSE connection
5. WHERE the original dashboard used Postgres/Prisma, THE System SHALL replace data access with SQLite queries via the REST API

### Requirement 7: Package Dependency Isolation

**User Story:** As a maintainer, I want new packages to depend on original x402 packages without modifying them, so that upstream updates can be integrated cleanly.

#### Acceptance Criteria

1. THE @x402-observed/core package SHALL depend on @x402/core and better-sqlite3
2. THE @x402-observed/express package SHALL depend on @x402-observed/core and @x402/express
3. THE @x402-observed/next package SHALL depend on @x402-observed/core and @x402/next
4. THE x402-observed CLI package SHALL depend on @x402-observed/core, @x402-observed/dashboard, and express
5. THE @x402-observed/dashboard package SHALL depend on @x402-observed/core
6. WHEN any package is built, THE System SHALL NOT create circular dependencies
7. THE System SHALL NOT modify any files in @x402/core, @x402/express, @x402/next, or @x402/fetch

### Requirement 8: Real-Time Event Streaming

**User Story:** As a developer, I want to see workflow events appear in the dashboard immediately, so that I can debug issues in real-time.

#### Acceptance Criteria

1. WHEN an event is written to SQLite, THE System SHALL broadcast the event to all connected SSE clients
2. WHEN a client connects to /api/events, THE System SHALL establish a Server-Sent Events connection
3. WHEN an SSE client disconnects, THE System SHALL clean up the connection without affecting other clients
4. WHEN multiple workflows are active, THE System SHALL stream events for all workflows to connected clients

### Requirement 9: Workflow Data API

**User Story:** As a dashboard developer, I want a REST API to query workflow data, so that I can display payment history and statistics.

#### Acceptance Criteria

1. WHEN a GET request is made to api/workflow/s, THE System SHALL return all workflows with their events
2. WHEN a GET request is made to /api/workflows/:id, THE System SHALL return a specific workflow with all its events
3. WHEN querying workflows, THE System SHALL include all event types (request_received, payment_required, payment_header_received, verify_called, verify_result, settle_called, settle_result, workflow_completed)
4. WHEN returning workflow data, THE System SHALL include transaction hashes from settle_result events
5. WHEN returning workflow data, THE System SHALL use actual event timestamps, not generated timestamps

### Requirement 10: Monorepo Package Structure

**User Story:** As a maintainer, I want all new packages organized under a consistent naming convention, so that the codebase is maintainable and the fork relationship is clear.

#### Acceptance Criteria

1. THE System SHALL create packages in typescript/packages/ with the prefix "x402-observed-"
2. THE @x402-observed/core package SHALL be located at typescript/packages/x402-observed-core/
3. THE @x402-observed/express package SHALL be located at typescript/packages/x402-observed-express/
4. THE @x402-observed/next package SHALL be located at typescript/packages/x402-observed-next/
5. THE x402-observed CLI package SHALL be located at typescript/packages/x402-observed-cli/
6. THE @x402-observed/dashboard package SHALL be located at typescript/packages/x402-observed-dashboard/
7. WHEN publishing to npm, THE CLI package SHALL use the name "x402-observed" with a bin entry pointing to dist/index.js
8. WHEN creating package.json files, THE System SHALL follow the pnpm workspace structure with proper main, module, and types fields
9. WHEN creating packages, THE System SHALL include tsconfig.json, tsup.config.ts, vitest.config.ts, and eslint.config.js following existing patterns

### Requirement 11: Build and Development Tooling

**User Story:** As a developer, I want the observed packages to use the same build tooling as the main x402 packages, so that the development experience is consistent.

#### Acceptance Criteria

1. THE System SHALL use tsup for building TypeScript packages
2. THE System SHALL use vitest for running tests
3. THE System SHALL use ESLint with TypeScript rules for linting
4. THE System SHALL use Prettier for code formatting
5. WHEN building packages, THE System SHALL output both CommonJS (dist/cjs) and ESM (dist/esm) formats
6. WHEN running tests, THE System SHALL support both run and watch modes

### Requirement 12: Changelog Management

**User Story:** As a maintainer, I want user-facing changes to be documented with changesets, so that version bumps and release notes are properly managed.

#### Acceptance Criteria

1. WHEN a user-facing change is made to any @x402-observed package, THE System SHALL require a changeset fragment
2. WHEN creating a changeset, THE Developer SHALL run "pnpm changeset" from the typescript directory
3. WHEN creating a changeset, THE System SHALL prompt for affected packages and change description
4. WHEN a change is docs-only or internal refactoring, THE System SHALL allow skipping changeset creation
