package main

import (
	"context"
	"fmt"
	"net/http"
	"strings"
	"sync"
	"time"

	x402 "github.com/coinbase/x402/go"
	x402http "github.com/coinbase/x402/go/http"
	evm "github.com/coinbase/x402/go/mechanisms/evm/exact/client"
	evmsigners "github.com/coinbase/x402/go/signers/evm"
)

/**
 * Concurrent Requests Example
 *
 * This example demonstrates how to make multiple paid requests concurrently:
 * - Parallel payment creation and execution
 * - Proper synchronization and error handling
 * - Request pooling for efficiency
 * - Collecting and aggregating results
 */

type RequestResult struct {
	URL      string
	Duration time.Duration
	Error    error
	Status   int
}

func runConcurrentRequestsExample(ctx context.Context, evmPrivateKey, baseURL string) error {
	fmt.Println("⚡ Making concurrent paid requests...\n")

	// Create signer
	evmSigner, err := evmsigners.NewClientSignerFromPrivateKey(evmPrivateKey)
	if err != nil {
		return err
	}

	// Create x402 client
	client := x402.Newx402Client().
		Register("eip155:*", evm.NewExactEvmScheme(evmSigner))

	// Add concurrency tracking
	var mu sync.Mutex
	activeRequests := 0
	maxConcurrent := 0

	client.OnBeforePaymentCreation(func(ctx x402.PaymentCreationContext) (*x402.BeforePaymentCreationResult, error) {
		mu.Lock()
		activeRequests++
		if activeRequests > maxConcurrent {
			maxConcurrent = activeRequests
		}
		fmt.Printf("📊 Active concurrent requests: %d\n", activeRequests)
		mu.Unlock()
		return nil, nil
	})

	client.OnAfterPaymentCreation(func(ctx x402.PaymentCreationResultContext) error {
		mu.Lock()
		activeRequests--
		mu.Unlock()
		return nil
	})

	// Wrap HTTP client
	httpClient := x402http.Newx402HTTPClient(client)
	wrappedClient := x402http.WrapHTTPClientWithPayment(http.DefaultClient, httpClient)

	// Define multiple endpoints to request
	endpoints := []string{
		"/weather?city=San+Francisco",
		"/weather?city=New+York",
		"/weather?city=London",
		"/weather?city=Tokyo",
		"/weather?city=Paris",
	}

	fmt.Printf("🚀 Making %d concurrent requests...\n\n", len(endpoints))

	// Execute requests concurrently
	var wg sync.WaitGroup
	results := make([]RequestResult, len(endpoints))
	startTime := time.Now()

	for i, endpoint := range endpoints {
		wg.Add(1)
		go func(index int, path string) {
			defer wg.Done()

			url := baseURL + path
			reqStart := time.Now()

			req, err := http.NewRequestWithContext(ctx, "GET", url, nil)
			if err != nil {
				results[index] = RequestResult{
					URL:      url,
					Duration: time.Since(reqStart),
					Error:    err,
				}
				return
			}

			resp, err := wrappedClient.Do(req)
			duration := time.Since(reqStart)

			if err != nil {
				results[index] = RequestResult{
					URL:      url,
					Duration: duration,
					Error:    err,
				}
				return
			}
			defer resp.Body.Close()

			results[index] = RequestResult{
				URL:      url,
				Duration: duration,
				Status:   resp.StatusCode,
				Error:    nil,
			}

			fmt.Printf("✅ Completed: %s (status: %d, took: %v)\n", path, resp.StatusCode, duration)
		}(i, endpoint)
	}

	// Wait for all requests to complete
	wg.Wait()
	totalDuration := time.Since(startTime)

	// Print summary
	fmt.Printf("\n" + strings.Repeat("=", 60) + "\n")
	fmt.Println("📈 Concurrent Requests Summary")
	fmt.Printf(strings.Repeat("=", 60) + "\n\n")

	successCount := 0
	failureCount := 0
	var totalReqDuration time.Duration

	for i, result := range results {
		if result.Error != nil {
			failureCount++
			fmt.Printf("❌ Request %d: %s - Error: %v\n", i+1, result.URL, result.Error)
		} else {
			successCount++
			totalReqDuration += result.Duration
			fmt.Printf("✅ Request %d: %s - Status: %d, Duration: %v\n", i+1, result.URL, result.Status, result.Duration)
		}
	}

	avgDuration := time.Duration(0)
	if successCount > 0 {
		avgDuration = totalReqDuration / time.Duration(successCount)
	}

	fmt.Printf("\n📊 Statistics:\n")
	fmt.Printf("   Total requests: %d\n", len(endpoints))
	fmt.Printf("   Successful: %d\n", successCount)
	fmt.Printf("   Failed: %d\n", failureCount)
	fmt.Printf("   Max concurrent: %d\n", maxConcurrent)
	fmt.Printf("   Total time: %v\n", totalDuration)
	fmt.Printf("   Average request time: %v\n", avgDuration)
	fmt.Printf("   Concurrency benefit: %.2fx faster than serial\n",
		float64(totalReqDuration)/float64(totalDuration))

	return nil
}

