#!/usr/bin/env python3
"""
FastAPI Concurrent x402 Example

This example demonstrates:
1. Proper FastAPI middleware setup with x402
2. Handling concurrent requests safely  
3. Testing facilitator initialization under load
4. Production-ready error handling and monitoring

Usage:
    python fastapi_concurrent_example.py

Test with:
    python test_concurrent_load.py

Requirements:
    pip install fastapi uvicorn httpx pytest pytest-asyncio x402[fastapi]
"""

import asyncio
import logging
import time
from contextlib import asynccontextmanager
from typing import Dict, Any

import uvicorn
from fastapi import FastAPI, Request, HTTPException
from fastapi.responses import JSONResponse

from x402.http.middleware.fastapi import payment_middleware
from x402.server import x402ResourceServer
from x402.facilitator import x402FacilitatorClient
from x402.mechanisms.evm.facilitator import ExactEvmScheme as FacilitatorEvmScheme
from x402.mechanisms.evm.signer import FacilitatorWeb3Signer

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s - %(name)s - %(levelname)s - %(message)s"
)
logger = logging.getLogger(__name__)

# Global metrics for monitoring
METRICS = {
    "requests_total": 0,
    "payments_total": 0,
    "concurrent_peak": 0,
    "active_requests": 0,
    "init_time": None,
    "errors": []
}

@asynccontextmanager
async def lifespan(app: FastAPI):
    """Application lifespan manager with proper initialization."""
    logger.info("Starting FastAPI x402 application")
    start_time = time.time()
    
    # Simulate expensive initialization that would benefit from 
    # concurrency-safe lazy loading
    await asyncio.sleep(0.1)  # Simulate DB connection, etc.
    
    METRICS["init_time"] = time.time() - start_time
    logger.info(f"Application initialized in {METRICS['init_time']:.3f}s")
    
    yield
    
    logger.info("Shutting down FastAPI x402 application")
    logger.info(f"Final metrics: {METRICS}")

# Create FastAPI app with lifespan
app = FastAPI(
    title="x402 FastAPI Concurrent Example",
    description="Demonstrates safe concurrent x402 usage",
    version="1.0.0",
    lifespan=lifespan
)

# Configure x402 server with lazy initialization
# This simulates a production scenario where facilitator
# initialization is deferred until first payment request
server = x402ResourceServer()

# In production, you'd get these from environment variables
FACILITATOR_PRIVATE_KEY = "0x" + "42" * 32  # Dummy key for example
FACILITATOR_ADDRESS = "0x742d35Cc6634C0532925a3b8D4ac2cE58A1FaBb4"

facilitator_client = x402FacilitatorClient()

# Register EVM scheme with mock configuration
evm_scheme = FacilitatorEvmScheme(
    network="eip155:8453",  # Base mainnet
    signer=FacilitatorWeb3Signer.from_private_key(FACILITATOR_PRIVATE_KEY),
    recipient=FACILITATOR_ADDRESS,
    rpc_url="https://mainnet.base.org"  # Base RPC
)
facilitator_client.register(evm_scheme)

# Register facilitator with server (lazy initialization will happen on first request)
server.facilitators = [facilitator_client]

# Define payment-protected routes
routes = {
    "/expensive-computation": {
        "price": "0.10",  # $0.10 USD
        "description": "CPU-intensive computation"
    },
    "/premium-data": {
        "price": "0.05",
        "description": "Access to premium dataset"
    }
}

# Add x402 payment middleware
app.add_middleware(
    payment_middleware(server, routes),
)

@app.middleware("http")
async def metrics_middleware(request: Request, call_next):
    """Track concurrent request metrics."""
    METRICS["requests_total"] += 1
    METRICS["active_requests"] += 1
    
    # Track peak concurrency
    if METRICS["active_requests"] > METRICS["concurrent_peak"]:
        METRICS["concurrent_peak"] = METRICS["active_requests"]
    
    try:
        response = await call_next(request)
        return response
    except Exception as e:
        METRICS["errors"].append({
            "time": time.time(),
            "error": str(e),
            "path": request.url.path
        })
        raise
    finally:
        METRICS["active_requests"] -= 1

@app.get("/")
async def root():
    """Free endpoint for health checks."""
    return {
        "message": "x402 FastAPI Concurrent Example",
        "status": "running",
        "metrics": METRICS
    }

@app.get("/health")
async def health():
    """Health check endpoint."""
    return {
        "status": "healthy",
        "facilitator_initialized": server._initialized if hasattr(server, '_initialized') else False,
        "active_requests": METRICS["active_requests"]
    }

@app.get("/expensive-computation")
async def expensive_computation():
    """CPU-intensive endpoint requiring payment."""
    logger.info(f"Processing expensive computation (active: {METRICS['active_requests']})")
    
    # Simulate expensive work
    await asyncio.sleep(0.1)
    
    # Simulate computation
    result = sum(i * i for i in range(10000))
    
    METRICS["payments_total"] += 1
    
    return {
        "result": result,
        "computation_time": "100ms",
        "message": "Expensive computation completed",
        "request_id": METRICS["payments_total"]
    }

@app.get("/premium-data")
async def premium_data():
    """Premium data endpoint requiring payment."""
    logger.info(f"Serving premium data (active: {METRICS['active_requests']})")
    
    # Simulate data access
    await asyncio.sleep(0.05)
    
    METRICS["payments_total"] += 1
    
    return {
        "data": [
            {"id": i, "value": f"premium_value_{i}", "timestamp": time.time()}
            for i in range(100)
        ],
        "size": "100 records",
        "message": "Premium data delivered",
        "request_id": METRICS["payments_total"]
    }

@app.get("/metrics")
async def get_metrics():
    """Endpoint to view current metrics."""
    return METRICS

@app.exception_handler(HTTPException)
async def http_exception_handler(request: Request, exc: HTTPException):
    """Custom HTTP exception handler."""
    logger.warning(f"HTTP exception on {request.url.path}: {exc.status_code} - {exc.detail}")
    return JSONResponse(
        status_code=exc.status_code,
        content={"error": exc.detail}
    )

@app.exception_handler(Exception)
async def general_exception_handler(request: Request, exc: Exception):
    """General exception handler."""
    logger.error(f"Unhandled exception on {request.url.path}: {exc}", exc_info=True)
    METRICS["errors"].append({
        "time": time.time(),
        "error": str(exc),
        "path": request.url.path,
        "type": "unhandled"
    })
    return JSONResponse(
        status_code=500,
        content={"error": "Internal server error"}
    )

if __name__ == "__main__":
    print("🚀 Starting FastAPI x402 Concurrent Example")
    print("📊 Metrics available at: http://localhost:8000/metrics")
    print("💰 Protected endpoints:")
    for path, config in routes.items():
        print(f"   {path} - ${config['price']} - {config['description']}")
    print("🔄 Use test_concurrent_load.py to test concurrency")
    
    uvicorn.run(
        app,
        host="0.0.0.0",
        port=8000,
        log_level="info",
        access_log=True
    )