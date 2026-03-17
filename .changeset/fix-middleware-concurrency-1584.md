# Middleware Concurrency Fix

## Fix: Thread-safe lazy facilitator initialization

**Issue:** #1584 - Under concurrent load, multiple requests could race to initialize the facilitator, causing duplicate initialization calls and inconsistent error propagation.

**Root Cause:** Both FastAPI and Flask middleware used an unsafe pattern:
```python
if sync_facilitator_on_start and not init_done:
    http_server.initialize()  # ← Multiple threads/tasks could enter
    init_done = True
```

**Solution:** Implemented proper locking mechanisms:

### FastAPI Middleware (`fastapi.py`)
- Added `asyncio.Lock()` for async concurrency safety
- Used double-check pattern to avoid unnecessary lock contention:
  ```python
  async with init_lock:
      if not init_done:  # ← Re-check after acquiring lock
          http_server.initialize()
          init_done = True
  ```

### Flask Middleware (`flask.py`)  
- Added `threading.Lock()` for sync concurrency safety
- Same double-check pattern for thread safety:
  ```python
  with self._init_lock:
      if not self._init_done:  # ← Re-check after acquiring lock
          self._http_server.initialize()
          self._init_done = True
  ```

**Testing:** Added concurrent initialization tests to verify:
- Multiple simultaneous requests only trigger initialization once
- No race conditions between async tasks (FastAPI) or threads (Flask)
- Error propagation remains consistent

**Impact:** 
- ✅ Fixes race condition under high load
- ✅ Maintains backward compatibility
- ✅ Zero performance impact for single-threaded scenarios
- ✅ Proper error handling preservation

Co-authored-by: x402-patrol-bot