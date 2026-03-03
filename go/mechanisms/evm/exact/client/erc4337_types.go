package client

import (
	"context"

	"github.com/coinbase/x402/go/mechanisms/evm"
)

// ERC4337UserOperationSigner defines the interface for signing ERC-4337 user operations.
type ERC4337UserOperationSigner interface {
	// Address returns the signer's smart account address.
	Address() string

	// SignUserOperation signs a prepared user operation and returns the signature.
	SignUserOperation(ctx context.Context, userOp evm.UserOperation07Json) (string, error)
}

// ERC4337BundlerClient defines the interface for bundler interactions during payment creation.
type ERC4337BundlerClient interface {
	// PrepareUserOperation prepares a user operation from calls.
	// Returns an unsigned UserOperation07Json ready for signing.
	PrepareUserOperation(ctx context.Context, calls []UserOperationCall, entryPoint string) (*evm.UserOperation07Json, error)

	// EstimateGas estimates gas for a user operation.
	EstimateGas(ctx context.Context, userOp evm.UserOperation07Json, entryPoint string) (*evm.UserOperation07Json, error)

	// SendUserOperation sends a signed user operation and returns the hash.
	SendUserOperation(ctx context.Context, userOp evm.UserOperation07Json, entryPoint string) (string, error)
}

// UserOperationCall represents a single call to include in a user operation.
type UserOperationCall struct {
	To    string `json:"to"`
	Value string `json:"value"`
	Data  string `json:"data"`
}
