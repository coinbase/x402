Addresses race conditions in FastAPI and Flask middleware where multiple concurrent requests could trigger multiple initialize() calls on the facilitator.

## Problem
Issue #1584 identified concurrency issues where:
- Multiple simultaneous requests to protected endpoints could race
- Each request could trigger facilitator initialization 
- This leads to inconsistent error propagation and potential state corruption

## Solution
Implements single-flight initialization with proper concurrency guards:

**FastAPI middleware:**
- Uses `asyncio.Lock()` for async concurrency protection
- Double-check locking pattern to avoid unnecessary waits
- Proper error propagation for failed initialization

**Flask middleware:**  
- Uses `threading.Lock()` for thread concurrency protection
- Same double-check pattern adapted for synchronous context
- Centralized error handling for initialization failures

## Changes
- ✅ Concurrency-safe lazy initialization 
- ✅ Single-flight pattern prevents multiple init calls
- ✅ Error propagation ensures all requests see init failures
- ✅ Comprehensive concurrency tests for both middleware
- ✅ GPG-signed commits
- ✅ Changeset fragment added

## Testing
Added extensive concurrency tests:
- `test_concurrent_initialization_single_call()` - verifies only one init call occurs
- `test_initialization_error_propagation()` - ensures error handling works correctly  
- `test_no_initialization_race_with_mixed_routes()` - validates mixed request patterns

Fixes #1584