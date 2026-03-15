# FastAPI x402 Concurrent Example

This example demonstrates production-ready usage of x402 with FastAPI under concurrent load, showcasing the concurrency-safe facilitator initialization and proper error handling patterns.

## Overview

The example consists of three components:

1. **`fastapi_concurrent_example.py`** - Production-style FastAPI application with x402 payment middleware
2. **`test_concurrent_load.py`** - Comprehensive concurrent load testing suite  
3. **`README_concurrent.md`** - This documentation

## Key Features Demonstrated

### 🔐 Concurrency-Safe Initialization
- **Lazy facilitator initialization** - Server starts quickly, facilitator initializes on first payment request
- **Race condition prevention** - Multiple concurrent requests safely trigger single initialization
- **Double-checked locking** - Prevents duplicate initialization under load
- **Error propagation** - Consistent error handling when initialization fails

### 📊 Production Monitoring
- **Request metrics** - Track total requests, payments, and concurrent load
- **Error tracking** - Comprehensive error logging and metrics collection  
- **Performance monitoring** - Response times and throughput measurement
- **Health checks** - Application and facilitator status endpoints

### ⚡ Load Testing
- **Basic concurrency** - Multiple requests to free endpoints
- **Payment concurrency** - Concurrent access to payment-protected routes
- **Mixed load** - Realistic traffic patterns with combined endpoint types
- **Initialization safety** - Specific tests for facilitator init race conditions

## Quick Start

### 1. Install Dependencies

```bash
pip install fastapi uvicorn httpx pytest pytest-asyncio x402[fastapi]
```

### 2. Run the Server

```bash
python fastapi_concurrent_example.py
```

The server will start on `http://localhost:8000` with these endpoints:

- **Free endpoints:**
  - `GET /` - Application info and metrics
  - `GET /health` - Health check and initialization status  
  - `GET /metrics` - Current performance metrics

- **Payment-protected endpoints:**
  - `GET /expensive-computation` - $0.10 USD - CPU-intensive operation
  - `GET /premium-data` - $0.05 USD - Premium dataset access

### 3. Test Concurrent Load

In a new terminal:

```bash
python test_concurrent_load.py
```

This will run a comprehensive test suite:

1. **Basic Concurrency** - 50 concurrent requests to `/health`
2. **Payment Endpoint Concurrency** - 20 concurrent requests to payment endpoints
3. **Facilitator Init Safety** - 30 concurrent requests testing initialization race conditions
4. **Mixed Load** - Combined traffic to all endpoints

## Understanding the Output

### Server Logs
```
INFO:     Started server process [12345]
INFO:     Waiting for application startup.
2026-03-14 17:20:15 - fastapi_concurrent_example - INFO - Starting FastAPI x402 application
2026-03-14 17:20:15 - fastapi_concurrent_example - INFO - Application initialized in 0.102s
INFO:     Application startup complete.
```

### Load Test Results
```
📊 Basic Concurrency Test (/health) Results:
   Total Requests: 50
   Successful: 50
   Failed: 0
   Success Rate: 100.0%
   Avg Response Time: 12.3ms
   Min/Max Response Time: 8.1ms / 45.2ms
   Test Duration: 0.89s
   Requests/sec: 56.2
```

### Metrics Endpoint
```json
{
  "requests_total": 150,
  "payments_total": 0,
  "concurrent_peak": 30,
  "active_requests": 0,
  "init_time": 0.102,
  "errors": []
}
```

## Technical Deep Dive

### Concurrency Safety Implementation

The example demonstrates the concurrency safety fixes implemented in the x402 FastAPI middleware:

```python
# Lazy initialization state (concurrency-safe)
init_done = False
init_lock = asyncio.Lock()

async def middleware(request, call_next):
    # Initialize on first protected request (concurrency-safe)
    if sync_facilitator_on_start and not init_done:
        async with init_lock:
            # Double-check pattern: another request might have completed init
            # while we were waiting for the lock
            if not init_done:
                try:
                    http_server.initialize()
                    init_done = True
                except Exception as e:
                    # Centralized error propagation if init fails
                    return JSONResponse(...)
```

### Why This Matters

Without proper concurrency safety, multiple simultaneous requests could:

1. **Trigger multiple initializations** - Wasting resources and potentially causing conflicts
2. **Create inconsistent state** - Some requests succeed while others fail randomly
3. **Cause resource leaks** - Duplicate connections, memory usage, etc.
4. **Produce race condition errors** - Intermittent 500 errors under load

The double-checked locking pattern ensures:

- ✅ **Single initialization** - Only one thread/coroutine performs initialization
- ✅ **Fast path optimization** - Subsequent requests skip locking entirely  
- ✅ **Consistent error handling** - All requests get the same error if init fails
- ✅ **Production reliability** - No race conditions under concurrent load

### Error Scenarios Tested

1. **Concurrent first requests** - Multiple requests triggering initialization simultaneously
2. **Mixed request patterns** - Free and paid requests during initialization
3. **Initialization failures** - Proper error propagation when setup fails
4. **High concurrency** - Peak load testing to find race condition limits

## Production Considerations

### Environment Variables
In production, use environment variables for sensitive configuration:

```bash
export FACILITATOR_PRIVATE_KEY="0x..."
export FACILITATOR_ADDRESS="0x..."
export RPC_URL="https://mainnet.base.org"
export LOG_LEVEL="INFO"
```

### Monitoring Integration
The metrics endpoint provides data for integration with monitoring systems:

```python
# Prometheus metrics example
from prometheus_client import Counter, Histogram, Gauge

requests_counter = Counter('x402_requests_total', 'Total requests')
payment_counter = Counter('x402_payments_total', 'Total payments')
response_time = Histogram('x402_response_seconds', 'Response times')
active_requests = Gauge('x402_active_requests', 'Active requests')
```

### Database Integration
For production use, consider persistent storage for metrics and payment tracking:

```python
from sqlalchemy.ext.asyncio import AsyncSession
from x402.hooks import PaymentVerifiedHook

async def log_payment_hook(payment_data):
    async with database_session() as session:
        payment_record = PaymentLog(
            amount=payment_data.amount,
            sender=payment_data.sender,
            timestamp=datetime.utcnow()
        )
        session.add(payment_record)
        await session.commit()

server.register_hook(PaymentVerifiedHook(log_payment_hook))
```

## Common Issues & Solutions

### Issue: "Connection refused" when running tests
**Solution:** Make sure `fastapi_concurrent_example.py` is running first.

### Issue: All requests return 402 Payment Required
**Expected behavior** - The example uses mock payment configuration. In production, you'd integrate with real facilitators and payment providers.

### Issue: High response times under load
**Check:** System resources (CPU, memory) and consider:
- Connection pooling for database/external services
- Async/await patterns for I/O operations
- Load balancing for horizontal scaling

### Issue: Race condition errors in logs
**Investigate:** If you see initialization-related errors, check:
- FastAPI and x402 versions are up to date
- Proper async context management
- Database connection handling

## Related Documentation

- [x402 Python SDK Documentation](../../python/README.md)
- [FastAPI Middleware Guide](../../python/CONTRIBUTING.md#middleware)
- [Concurrency Safety Implementation](../../python/.changeset/concurrency-safe-init.md)
- [Production Deployment Guide](../../docs/deployment.md)

## Contributing

To improve this example:

1. **Add more test scenarios** - Different load patterns, error conditions
2. **Enhance monitoring** - Additional metrics, alerting integration
3. **Database examples** - Persistent payment logging, analytics
4. **Docker configuration** - Container deployment examples
5. **Performance tuning** - Optimization techniques and benchmarks

## License

This example is part of the x402 project and follows the same MIT license.