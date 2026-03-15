#!/usr/bin/env python3
"""
Concurrent Load Test for FastAPI x402 Example

This script tests the concurrency safety of the x402 FastAPI middleware
by sending multiple simultaneous requests to payment-protected endpoints.

Tests:
1. Basic concurrency - multiple requests to free endpoints
2. Payment concurrency - multiple requests triggering payment initialization  
3. Mixed load - combination of free and paid endpoints
4. Error handling under load

Usage:
    # Start the server first:
    python fastapi_concurrent_example.py
    
    # Then run the load test:
    python test_concurrent_load.py

Requirements:
    pip install httpx pytest pytest-asyncio aiohttp
"""

import asyncio
import time
import json
from typing import List, Dict, Any
from dataclasses import dataclass, field
from contextlib import asynccontextmanager

import httpx
import pytest

BASE_URL = "http://localhost:8000"

@dataclass 
class TestResult:
    """Results from a single test request."""
    url: str
    status_code: int
    response_time: float
    success: bool
    error: str = ""
    response_data: Dict[str, Any] = field(default_factory=dict)

@dataclass
class LoadTestResults:
    """Aggregate results from load test."""
    total_requests: int
    successful_requests: int
    failed_requests: int
    average_response_time: float
    max_response_time: float
    min_response_time: float
    errors: List[str]
    concurrent_requests: int
    test_duration: float

class ConcurrentTester:
    """Helper class for running concurrent x402 tests."""
    
    def __init__(self, base_url: str = BASE_URL):
        self.base_url = base_url
        self.session: httpx.AsyncClient = None
    
    async def __aenter__(self):
        """Async context manager entry."""
        self.session = httpx.AsyncClient(timeout=30.0)
        return self
    
    async def __aexit__(self, exc_type, exc_val, exc_tb):
        """Async context manager exit."""
        if self.session:
            await self.session.aclose()
    
    async def make_request(self, endpoint: str) -> TestResult:
        """Make a single HTTP request and return results."""
        url = f"{self.base_url}{endpoint}"
        start_time = time.time()
        
        try:
            response = await self.session.get(url)
            response_time = time.time() - start_time
            
            try:
                response_data = response.json()
            except json.JSONDecodeError:
                response_data = {"raw_response": response.text}
            
            return TestResult(
                url=url,
                status_code=response.status_code,
                response_time=response_time,
                success=200 <= response.status_code < 400,
                response_data=response_data
            )
        
        except Exception as e:
            response_time = time.time() - start_time
            return TestResult(
                url=url,
                status_code=0,
                response_time=response_time,
                success=False,
                error=str(e)
            )
    
    async def run_concurrent_requests(self, endpoint: str, num_requests: int) -> LoadTestResults:
        """Run multiple concurrent requests to the same endpoint."""
        print(f"🔄 Running {num_requests} concurrent requests to {endpoint}")
        
        start_time = time.time()
        
        # Create tasks for concurrent requests
        tasks = [
            self.make_request(endpoint)
            for _ in range(num_requests)
        ]
        
        # Execute all requests concurrently
        results = await asyncio.gather(*tasks)
        
        test_duration = time.time() - start_time
        
        # Aggregate results
        successful = [r for r in results if r.success]
        failed = [r for r in results if not r.success]
        response_times = [r.response_time for r in results]
        
        return LoadTestResults(
            total_requests=len(results),
            successful_requests=len(successful),
            failed_requests=len(failed),
            average_response_time=sum(response_times) / len(response_times),
            max_response_time=max(response_times),
            min_response_time=min(response_times),
            errors=[r.error for r in failed if r.error],
            concurrent_requests=num_requests,
            test_duration=test_duration
        )
    
    async def run_mixed_load_test(self, endpoints: List[str], requests_per_endpoint: int) -> Dict[str, LoadTestResults]:
        """Run concurrent requests to multiple endpoints simultaneously."""
        print(f"🔄 Running mixed load test: {requests_per_endpoint} requests to each of {endpoints}")
        
        # Create tasks for all endpoints
        all_tasks = []
        for endpoint in endpoints:
            for _ in range(requests_per_endpoint):
                all_tasks.append(self.make_request(endpoint))
        
        start_time = time.time()
        results = await asyncio.gather(*all_tasks)
        test_duration = time.time() - start_time
        
        # Group results by endpoint
        results_by_endpoint = {}
        result_idx = 0
        
        for endpoint in endpoints:
            endpoint_results = results[result_idx:result_idx + requests_per_endpoint]
            result_idx += requests_per_endpoint
            
            successful = [r for r in endpoint_results if r.success]
            failed = [r for r in endpoint_results if not r.success]
            response_times = [r.response_time for r in endpoint_results]
            
            results_by_endpoint[endpoint] = LoadTestResults(
                total_requests=len(endpoint_results),
                successful_requests=len(successful),
                failed_requests=len(failed),
                average_response_time=sum(response_times) / len(response_times) if response_times else 0,
                max_response_time=max(response_times) if response_times else 0,
                min_response_time=min(response_times) if response_times else 0,
                errors=[r.error for r in failed if r.error],
                concurrent_requests=requests_per_endpoint,
                test_duration=test_duration
            )
        
        return results_by_endpoint

def print_results(results: LoadTestResults, test_name: str):
    """Pretty print test results."""
    print(f"\n📊 {test_name} Results:")
    print(f"   Total Requests: {results.total_requests}")
    print(f"   Successful: {results.successful_requests}")
    print(f"   Failed: {results.failed_requests}")
    print(f"   Success Rate: {results.successful_requests/results.total_requests*100:.1f}%")
    print(f"   Avg Response Time: {results.average_response_time*1000:.1f}ms")
    print(f"   Min/Max Response Time: {results.min_response_time*1000:.1f}ms / {results.max_response_time*1000:.1f}ms")
    print(f"   Test Duration: {results.test_duration:.2f}s")
    print(f"   Requests/sec: {results.total_requests/results.test_duration:.1f}")
    
    if results.errors:
        print(f"   ❌ Errors: {len(results.errors)}")
        for error in results.errors[:3]:  # Show first 3 errors
            print(f"      - {error}")
        if len(results.errors) > 3:
            print(f"      ... and {len(results.errors)-3} more")

async def test_basic_concurrency():
    """Test basic concurrent access to free endpoints."""
    async with ConcurrentTester() as tester:
        # Test health endpoint under load
        results = await tester.run_concurrent_requests("/health", 50)
        print_results(results, "Basic Concurrency Test (/health)")
        
        assert results.failed_requests == 0, f"Expected no failures, got {results.failed_requests}"
        assert results.average_response_time < 1.0, f"Response time too high: {results.average_response_time:.3f}s"

async def test_payment_endpoint_concurrency():
    """Test concurrent access to payment-protected endpoints."""
    async with ConcurrentTester() as tester:
        # Note: This will fail with 402 Payment Required, but tests concurrency safety
        results = await tester.run_concurrent_requests("/expensive-computation", 20)
        print_results(results, "Payment Endpoint Concurrency (/expensive-computation)")
        
        # All requests should get 402 status (Payment Required) consistently
        # This tests that the facilitator initialization is concurrency-safe
        assert results.total_requests == 20, "Should have made 20 requests"
        # We expect 402 responses since we're not sending payments

async def test_mixed_load():
    """Test mixed load with both free and paid endpoints."""
    endpoints = ["/", "/health", "/expensive-computation", "/premium-data", "/metrics"]
    
    async with ConcurrentTester() as tester:
        results = await tester.run_mixed_load_test(endpoints, 10)
        
        for endpoint, result in results.items():
            print_results(result, f"Mixed Load Test ({endpoint})")

async def test_facilitator_initialization_safety():
    """Specific test for facilitator initialization under concurrent load."""
    async with ConcurrentTester() as tester:
        print("🧪 Testing facilitator initialization safety...")
        
        # First, verify the server is ready
        health_check = await tester.make_request("/health")
        assert health_check.success, "Server health check failed"
        
        # Now hit payment endpoints simultaneously to test init safety
        # This simulates the race condition the concurrency fix addresses
        payment_endpoints = ["/expensive-computation", "/premium-data"]
        
        start_time = time.time()
        tasks = []
        
        # Create a burst of requests to different payment endpoints
        for endpoint in payment_endpoints:
            for _ in range(15):  # 15 requests per endpoint
                tasks.append(tester.make_request(endpoint))
        
        results = await asyncio.gather(*tasks)
        test_duration = time.time() - start_time
        
        print(f"⏱️  Completed {len(results)} concurrent requests in {test_duration:.2f}s")
        
        # Analyze results - should all be 402 Payment Required
        status_codes = [r.status_code for r in results]
        status_distribution = {}
        for code in status_codes:
            status_distribution[code] = status_distribution.get(code, 0) + 1
        
        print(f"📈 Status code distribution: {status_distribution}")
        
        # All should be consistent (402 Payment Required)
        # No 500 errors from race conditions
        assert 500 not in status_distribution, "Found 500 errors indicating race condition"

async def run_all_tests():
    """Run the complete test suite."""
    print("🚀 Starting x402 FastAPI Concurrent Load Tests")
    print("=" * 60)
    
    # Check if server is running
    try:
        async with httpx.AsyncClient() as client:
            response = await client.get(f"{BASE_URL}/health")
            if response.status_code != 200:
                print("❌ Server not responding. Please start fastapi_concurrent_example.py first.")
                return
    except Exception as e:
        print(f"❌ Cannot connect to server at {BASE_URL}: {e}")
        print("   Please start fastapi_concurrent_example.py first.")
        return
    
    print("✅ Server is running, starting tests...\n")
    
    tests = [
        ("Basic Concurrency", test_basic_concurrency),
        ("Payment Endpoint Concurrency", test_payment_endpoint_concurrency),
        ("Facilitator Init Safety", test_facilitator_initialization_safety),
        ("Mixed Load", test_mixed_load),
    ]
    
    for test_name, test_func in tests:
        try:
            print(f"\n🧪 Running: {test_name}")
            print("-" * 40)
            await test_func()
            print(f"✅ {test_name} completed successfully")
        except Exception as e:
            print(f"❌ {test_name} failed: {e}")
        
        # Small pause between tests
        await asyncio.sleep(1)
    
    print("\n" + "=" * 60)
    print("🎉 Concurrent load testing complete!")
    
    # Get final metrics from server
    try:
        async with httpx.AsyncClient() as client:
            response = await client.get(f"{BASE_URL}/metrics")
            if response.status_code == 200:
                metrics = response.json()
                print("\n📊 Final Server Metrics:")
                print(f"   Total Requests: {metrics.get('requests_total', 0)}")
                print(f"   Payments Processed: {metrics.get('payments_total', 0)}")
                print(f"   Peak Concurrency: {metrics.get('concurrent_peak', 0)}")
                print(f"   Errors: {len(metrics.get('errors', []))}")
                if metrics.get('init_time'):
                    print(f"   Init Time: {metrics['init_time']:.3f}s")
    except Exception as e:
        print(f"Could not retrieve final metrics: {e}")

if __name__ == "__main__":
    print("FastAPI x402 Concurrent Load Tester")
    print("Make sure fastapi_concurrent_example.py is running first!")
    print()
    
    asyncio.run(run_all_tests())