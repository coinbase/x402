Resolves #1584

## Problem
Under concurrent load, multiple requests could race to initialize facilitator support in both FastAPI and Flask middleware, causing:
- Duplicate calls to `http_server.initialize()` 
- Inconsistent error propagation
- Potential resource conflicts

## Root Cause
Both middleware implementations used an unsafe lazy initialization pattern:
```python
if sync_facilitator_on_start and not init_done:
    http_server.initialize()  # ← Multiple threads/tasks could enter
    init_done = True
```

## Solution
Implemented proper concurrency-safe initialization:

### FastAPI Middleware
- Added `asyncio.Lock()` for async concurrency protection
- Double-check pattern to minimize lock contention

### Flask Middleware  
- Added `threading.Lock()` for sync thread safety
- Same double-check pattern for optimal performance

## Changes
- **FastAPI**: `asyncio.Lock` for async safety
- **Flask**: `threading.Lock` for thread safety  
- **Tests**: Concurrent initialization verification
- **Changeset**: Added changeset fragment

## Testing
✅ Added tests that verify multiple simultaneous requests only trigger initialization once
✅ Maintains backward compatibility
✅ Zero performance impact for single-threaded scenarios
✅ Proper error handling preservation

## Impact
- Fixes race conditions under high load
- Ensures reliable facilitator initialization
- Maintains existing API and behavior
- No breaking changes

Ready for review and testing!