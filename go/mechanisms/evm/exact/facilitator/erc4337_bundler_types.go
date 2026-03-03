package facilitator

// GasEstimate is the response from eth_estimateUserOperationGas.
type GasEstimate struct {
	CallGasLimit                  string `json:"callGasLimit,omitempty"`
	VerificationGasLimit          string `json:"verificationGasLimit,omitempty"`
	PreVerificationGas            string `json:"preVerificationGas,omitempty"`
	MaxFeePerGas                  string `json:"maxFeePerGas,omitempty"`
	MaxPriorityFeePerGas          string `json:"maxPriorityFeePerGas,omitempty"`
	PaymasterVerificationGasLimit string `json:"paymasterVerificationGasLimit,omitempty"`
	PaymasterPostOpGasLimit       string `json:"paymasterPostOpGasLimit,omitempty"`
}

// UserOperationReceipt is the response from eth_getUserOperationReceipt.
type UserOperationReceipt struct {
	UserOpHash    string                      `json:"userOpHash"`
	EntryPoint    string                      `json:"entryPoint"`
	Sender        string                      `json:"sender"`
	Nonce         string                      `json:"nonce"`
	Paymaster     string                      `json:"paymaster,omitempty"`
	ActualGasCost string                      `json:"actualGasCost"`
	ActualGasUsed string                      `json:"actualGasUsed"`
	Success       bool                        `json:"success"`
	Reason        string                      `json:"reason,omitempty"`
	Logs          []interface{}               `json:"logs"`
	Receipt       *UserOperationReceiptInner  `json:"receipt,omitempty"`
	// Some bundlers return transactionHash at the top level
	TransactionHash string `json:"transactionHash,omitempty"`
}

// UserOperationReceiptInner is the inner receipt with transaction hash.
type UserOperationReceiptInner struct {
	TransactionHash string `json:"transactionHash"`
}

// BundlerClientConfig holds configuration for the BundlerClient.
type BundlerClientConfig struct {
	// Timeout for RPC calls in milliseconds. Default: 10000.
	TimeoutMs int
	// Number of retries for failed requests. Default: 0.
	Retries int
}

// BundlerError is a custom error for bundler-related failures.
type BundlerError struct {
	Message    string
	Code       int
	Data       interface{}
	Method     string
	BundlerUrl string
}

func (e *BundlerError) Error() string {
	return e.Message
}

// jsonRpcRequest is a JSON-RPC request payload.
type jsonRpcRequest struct {
	Jsonrpc string        `json:"jsonrpc"`
	ID      int           `json:"id"`
	Method  string        `json:"method"`
	Params  []interface{} `json:"params"`
}

// jsonRpcError is a JSON-RPC error.
type jsonRpcError struct {
	Message string      `json:"message"`
	Code    int         `json:"code"`
	Data    interface{} `json:"data"`
}

// jsonRpcResponse is a generic JSON-RPC response.
type jsonRpcResponse struct {
	Result interface{}   `json:"result"`
	Error  *jsonRpcError `json:"error"`
}
