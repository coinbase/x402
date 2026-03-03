package facilitator

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"io"
	"math"
	"net/http"
	"time"
)

// BundlerClient is a JSON-RPC client for ERC-4337 bundler operations.
type BundlerClient struct {
	rpcUrl string
	config BundlerClientConfig
	client *http.Client
}

// NewBundlerClient creates a new BundlerClient.
func NewBundlerClient(rpcUrl string, config *BundlerClientConfig) *BundlerClient {
	cfg := BundlerClientConfig{
		TimeoutMs: 10000,
		Retries:   0,
	}
	if config != nil {
		if config.TimeoutMs > 0 {
			cfg.TimeoutMs = config.TimeoutMs
		}
		if config.Retries > 0 {
			cfg.Retries = config.Retries
		}
	}

	return &BundlerClient{
		rpcUrl: rpcUrl,
		config: cfg,
		client: &http.Client{},
	}
}

// EstimateUserOperationGas estimates gas for a user operation.
func (b *BundlerClient) EstimateUserOperationGas(ctx context.Context, userOp interface{}, entryPoint string) (*GasEstimate, error) {
	result, err := b.call(ctx, "eth_estimateUserOperationGas", []interface{}{userOp, entryPoint})
	if err != nil {
		return nil, err
	}

	data, err := json.Marshal(result)
	if err != nil {
		return nil, &BundlerError{
			Message:    fmt.Sprintf("failed to marshal gas estimate: %s", err.Error()),
			Method:     "eth_estimateUserOperationGas",
			BundlerUrl: b.rpcUrl,
		}
	}

	var gasEstimate GasEstimate
	if err := json.Unmarshal(data, &gasEstimate); err != nil {
		return nil, &BundlerError{
			Message:    fmt.Sprintf("failed to parse gas estimate: %s", err.Error()),
			Method:     "eth_estimateUserOperationGas",
			BundlerUrl: b.rpcUrl,
		}
	}

	return &gasEstimate, nil
}

// SendUserOperation sends a user operation to the bundler.
func (b *BundlerClient) SendUserOperation(ctx context.Context, userOp interface{}, entryPoint string) (string, error) {
	result, err := b.call(ctx, "eth_sendUserOperation", []interface{}{userOp, entryPoint})
	if err != nil {
		return "", err
	}

	hash, ok := result.(string)
	if !ok {
		return "", &BundlerError{
			Message:    "unexpected result type from eth_sendUserOperation",
			Method:     "eth_sendUserOperation",
			BundlerUrl: b.rpcUrl,
		}
	}

	return hash, nil
}

// GetUserOperationReceipt gets the receipt for a user operation.
func (b *BundlerClient) GetUserOperationReceipt(ctx context.Context, userOpHash string) (*UserOperationReceipt, error) {
	result, err := b.call(ctx, "eth_getUserOperationReceipt", []interface{}{userOpHash})
	if err != nil {
		return nil, err
	}

	if result == nil {
		return nil, nil
	}

	data, err := json.Marshal(result)
	if err != nil {
		return nil, &BundlerError{
			Message:    fmt.Sprintf("failed to marshal receipt: %s", err.Error()),
			Method:     "eth_getUserOperationReceipt",
			BundlerUrl: b.rpcUrl,
		}
	}

	var receipt UserOperationReceipt
	if err := json.Unmarshal(data, &receipt); err != nil {
		return nil, &BundlerError{
			Message:    fmt.Sprintf("failed to parse receipt: %s", err.Error()),
			Method:     "eth_getUserOperationReceipt",
			BundlerUrl: b.rpcUrl,
		}
	}

	return &receipt, nil
}

// call makes a JSON-RPC call with timeout and retry.
func (b *BundlerClient) call(ctx context.Context, method string, params []interface{}) (interface{}, error) {
	reqBody := jsonRpcRequest{
		Jsonrpc: "2.0",
		ID:      1,
		Method:  method,
		Params:  params,
	}

	bodyBytes, err := json.Marshal(reqBody)
	if err != nil {
		return nil, &BundlerError{
			Message:    fmt.Sprintf("failed to marshal request: %s", err.Error()),
			Method:     method,
			BundlerUrl: b.rpcUrl,
		}
	}

	maxAttempts := b.config.Retries + 1
	var lastErr error

	for attempt := 0; attempt < maxAttempts; attempt++ {
		timeoutCtx, cancel := context.WithTimeout(ctx, time.Duration(b.config.TimeoutMs)*time.Millisecond)

		req, err := http.NewRequestWithContext(timeoutCtx, "POST", b.rpcUrl, bytes.NewReader(bodyBytes))
		if err != nil {
			cancel()
			return nil, &BundlerError{
				Message:    fmt.Sprintf("failed to create request: %s", err.Error()),
				Method:     method,
				BundlerUrl: b.rpcUrl,
			}
		}
		req.Header.Set("Content-Type", "application/json")

		resp, err := b.client.Do(req)
		if err != nil {
			cancel()
			lastErr = err
			if ctx.Err() != nil {
				return nil, &BundlerError{
					Message:    fmt.Sprintf("bundler request timeout after %dms", b.config.TimeoutMs),
					Method:     method,
					BundlerUrl: b.rpcUrl,
				}
			}
			if attempt < maxAttempts-1 {
				time.Sleep(time.Duration(math.Pow(2, float64(attempt))*100) * time.Millisecond)
				continue
			}
			return nil, &BundlerError{
				Message:    fmt.Sprintf("bundler request failed: %s", lastErr.Error()),
				Method:     method,
				BundlerUrl: b.rpcUrl,
			}
		}

		respBody, err := io.ReadAll(resp.Body)
		resp.Body.Close()
		cancel()

		if err != nil {
			lastErr = err
			if attempt < maxAttempts-1 {
				time.Sleep(time.Duration(math.Pow(2, float64(attempt))*100) * time.Millisecond)
				continue
			}
			return nil, &BundlerError{
				Message:    fmt.Sprintf("failed to read response: %s", lastErr.Error()),
				Method:     method,
				BundlerUrl: b.rpcUrl,
			}
		}

		if resp.StatusCode != http.StatusOK {
			return nil, &BundlerError{
				Message:    fmt.Sprintf("bundler HTTP error: %d %s", resp.StatusCode, resp.Status),
				Method:     method,
				BundlerUrl: b.rpcUrl,
			}
		}

		var rpcResp jsonRpcResponse
		if err := json.Unmarshal(respBody, &rpcResp); err != nil {
			return nil, &BundlerError{
				Message:    fmt.Sprintf("failed to parse JSON-RPC response: %s", err.Error()),
				Method:     method,
				BundlerUrl: b.rpcUrl,
			}
		}

		if rpcResp.Error != nil {
			msg := "Bundler RPC error"
			if rpcResp.Error.Message != "" {
				msg = rpcResp.Error.Message
			}
			return nil, &BundlerError{
				Message:    msg,
				Code:       rpcResp.Error.Code,
				Data:       rpcResp.Error.Data,
				Method:     method,
				BundlerUrl: b.rpcUrl,
			}
		}

		return rpcResp.Result, nil
	}

	return nil, &BundlerError{
		Message:    "bundler request failed after retries",
		Method:     method,
		BundlerUrl: b.rpcUrl,
	}
}
