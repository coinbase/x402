# Python Error Handling Example

Comprehensive demonstration of robust error handling patterns for x402 Python SDK applications.

## Overview

This example shows production-ready error handling techniques for x402 payment applications, including:

- **Error Classification**: Automatic categorization of different error types for appropriate handling
- **Retry Logic**: Exponential backoff with jitter for network and transient errors  
- **Batch Operations**: Error isolation in concurrent operations
- **Configuration Validation**: Pydantic-based environment validation
- **Graceful Shutdown**: Proper resource cleanup and shutdown handling
- **Error Analysis**: Comprehensive error logging and reporting

## Error Types Handled

| Error Type | Retry Strategy | Description |
|------------|----------------|-------------|
| **Network Error** | ✅ Exponential backoff | Connectivity, timeout, DNS issues |
| **Payment Invalid** | ❌ No retry | Malformed payment data, user error |
| **Payment Expired** | ✅ Retry with new payment | Payment window expired |
| **Verification Failed** | ✅ Limited retry | Facilitator verification issues |
| **Settlement Failed** | ✅ Limited retry | Payment settlement problems |
| **Resource Error** | ❌ No retry | Server-side issues (4xx/5xx errors) |
| **Configuration Error** | ❌ No retry | Invalid setup, missing credentials |
| **Unknown Error** | ⚠️ Cautious retry | Unclassified errors |

## Features Demonstrated

### 🔄 Retry Logic with Exponential Backoff
```python
retry_config = RetryConfig(
    max_attempts=3,
    initial_delay=1.0,
    max_delay=60.0,
    backoff_multiplier=2.0,
    jitter=True  # Prevents thundering herd
)
```

### 🎯 Error Classification
```python
def categorize_error(self, error: Exception) -> PaymentErrorType:
    if isinstance(error, PaymentInvalidError):
        return PaymentErrorType.PAYMENT_INVALID
    elif isinstance(error, NetworkError):
        return PaymentErrorType.NETWORK_ERROR
    # ... automatic error categorization
```

### 🛡️ Batch Error Isolation
```python
# Failed requests don't affect successful ones
batch_result = await batch_requests_with_error_isolation(
    client, urls, error_handler, max_concurrent=5
)
print(f"Success rate: {batch_result.success_rate:.1%}")
```

### ✅ Configuration Validation
```python
class ConfigValidationModel(BaseModel):
    resource_server_url: str
    evm_private_key: Optional[str] = None
    request_timeout: float = 30.0
    # Automatic validation with clear error messages
```

## Setup

1. **Install dependencies:**
   ```bash
   uv sync
   ```

2. **Configure environment** (copy from `.env-example`):
   ```bash
   # Required
   RESOURCE_SERVER_URL=https://your-server.com
   
   # At least one required
   EVM_PRIVATE_KEY=0x...
   SVM_PRIVATE_KEY=base58_key...
   
   # Optional
   ENDPOINT_PATH=/api/data
   FACILITATOR_URL=https://facilitator.com
   REQUEST_TIMEOUT=30.0
   MAX_RETRIES=3
   ```

3. **Run the example:**
   ```bash
   uv run python main.py
   ```

## Example Output

```
🔧 Setting up x402 client...
✅ EVM client registered: 0x742d35...
🎯 Target URL: https://api.example.com/api/data

📡 Making single request with error handling...
✅ Single request successful:
   Status: 200
   Payment: Yes

🧪 Demonstrating error scenarios and recovery...
🔄 Processing 4 requests with concurrency limit of 5...
✅ Success: https://api.example.com/api/data
❌ Failed: https://api.example.com/api/nonexistent - ResourceError: Server error (status: 404)
❌ Failed: https://invalid-domain.com/api/data - NetworkError: DNS lookup failed

📈 Batch Results:
  - Success rate: 25.0%
  - Successful: 1
  - Failed: 3

📊 Error Summary (3 total errors):
  - network_error: 2
  - resource_error: 1

🔍 Recent errors:
  - [14:23:15] Server error (status: 404): Not Found
  - [14:23:16] DNS lookup failed
```

## Error Handling Patterns

### Contextual Retry Logic
The error handler uses context-aware retry strategies:

```python
async with error_handler.with_retry(url, "payment_request"):
    # Automatic retry for network/transient errors
    response = await session.get(url)
    # User errors and server errors are not retried
```

### Graceful Degradation
```python
# Batch operations continue even if individual requests fail
for success in batch_result.successful:
    process_successful_payment(success["result"])

for failure in batch_result.failed:
    log_failed_payment(failure["item"], failure["error"])
```

### Comprehensive Error Context
```python
@dataclass
class ErrorContext:
    timestamp: datetime
    url: str
    error_type: PaymentErrorType
    error_message: str
    attempt: int
    total_attempts: int
    retry_delay: Optional[float] = None
```

## Integration with Frameworks

This error handling pattern integrates well with:

- **FastAPI**: Use as middleware for request error handling
- **Django**: Integrate with Django's exception handling
- **Flask**: Use as decorator for route error handling  
- **Celery**: Handle payment task failures with retry logic
- **Async frameworks**: Compatible with asyncio-based applications

## Best Practices Demonstrated

1. **Fail Fast**: Don't retry user errors or configuration issues
2. **Exponential Backoff**: Prevent overwhelming services during outages
3. **Jitter**: Avoid thundering herd effects in concurrent applications
4. **Error Context**: Capture detailed information for debugging
5. **Graceful Shutdown**: Clean resource management
6. **Batch Isolation**: Don't let individual failures affect the batch
7. **Clear Logging**: Structured error information for monitoring
8. **Configuration Validation**: Catch setup issues early

## Related Documentation

- [x402 Error Handling Guide](../../../../docs/ERROR_HANDLING.md)
- [TypeScript Error Handling Example](../../typescript/clients/error-handling/)
- [Python SDK Documentation](../../../../python/README.md)
- [Troubleshooting Guide](../../../../docs/TROUBLESHOOTING.md)

## Error Recovery Strategies

| Scenario | Strategy | Implementation |
|----------|----------|----------------|
| **Temporary Network Issues** | Exponential backoff retry | Automatic with jitter |
| **Rate Limiting** | Respect retry-after headers | Custom delay calculation |
| **Payment Expiration** | Generate fresh payment | New payment flow |
| **Invalid Configuration** | Early validation failure | Pydantic validation |
| **Partial Batch Failure** | Continue with successful items | Error isolation |
| **Graceful Shutdown** | Complete in-flight requests | Context managers |

This example provides a foundation for building robust x402 applications that handle errors gracefully and provide excellent user experience even when things go wrong.