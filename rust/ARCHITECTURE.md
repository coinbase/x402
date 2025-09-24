# x402 Rust Implementation Architecture

This document describes the architecture and design decisions for the Rust implementation of the x402 HTTP-native micropayment protocol.

## Overview

The x402 Rust implementation provides a comprehensive library for implementing HTTP-native micropayments using the x402 protocol. It includes support for payment verification, settlement, client libraries, and web framework integrations.

## Core Components

### 1. Types Module (`src/types.rs`)

The types module defines all the core data structures used throughout the x402 protocol:

- **PaymentRequirements**: Defines what payment is required for a resource
- **PaymentPayload**: Contains the client's payment authorization
- **ExactEvmPayload**: EIP-3009 specific payment data
- **VerifyResponse/SettleResponse**: Facilitator API responses
- **FacilitatorConfig**: Configuration for facilitator clients

Key design decisions:
- Uses `rust_decimal::Decimal` for precise monetary calculations
- Leverages `serde` for JSON serialization/deserialization
- Includes network and scheme constants for easy configuration
- Provides helper methods for amount conversions and validation

### 2. Error Handling (`src/error.rs`)

Comprehensive error handling using `thiserror` for structured error types:

- **X402Error**: Main error enum covering all failure modes
- **Result<T>**: Type alias for consistent error handling
- Specific error variants for different failure scenarios
- Automatic conversion from common error types (HTTP, JSON, Base64)

### 3. Facilitator Client (`src/facilitator.rs`)

HTTP client for communicating with payment facilitators:

- **FacilitatorClient**: Main client for verify/settle operations
- **Coinbase integration**: Built-in support for Coinbase's facilitator
- **Authentication**: JWT-based authentication for Coinbase API
- **Timeout handling**: Configurable request timeouts
- **Error propagation**: Proper error handling for network issues

### 4. HTTP Client (`src/client.rs`)

Enhanced HTTP client with x402 payment support:

- **X402Client**: Main client with payment handling
- **X402RequestBuilder**: Request builder with payment methods
- **DiscoveryClient**: Client for discovering x402 resources
- **Automatic payment handling**: Retry requests with payment when needed
- **Header management**: Automatic X-PAYMENT header handling

### 5. Middleware (`src/middleware.rs`)

Framework-agnostic middleware for payment protection:

- **PaymentMiddlewareConfig**: Configuration for payment middleware
- **PaymentMiddleware**: Main middleware implementation
- **Web browser detection**: Different responses for browsers vs APIs
- **Payment verification**: Integration with facilitator clients
- **Response interception**: Capture and modify responses for settlement

### 6. Cryptographic Utilities (`src/crypto.rs`)

Cryptographic functions for payment signing and verification:

- **EIP-712 support**: Typed data signing for EIP-3009
- **Signature verification**: ECDSA signature validation
- **JWT creation**: Authentication tokens for Coinbase API
- **Keccak-256 hashing**: Ethereum-compatible hashing
- **Address derivation**: Public key to Ethereum address conversion

### 7. Framework Integrations

#### Axum Integration (`src/axum.rs`)
- **AxumPaymentConfig**: Axum-specific configuration
- **Service builder**: Easy integration with Axum applications
- **CORS support**: Built-in CORS handling
- **Tracing integration**: Request tracing support
- **Helper functions**: Common patterns and examples

## Design Principles

### 1. Type Safety
- Strong typing throughout the codebase
- Use of `rust_decimal::Decimal` for monetary calculations
- Comprehensive error types with `thiserror`
- Generic implementations where appropriate

### 2. Async/Await First
- All I/O operations are asynchronous
- Uses `tokio` for async runtime
- `reqwest` for HTTP operations
- Async-friendly middleware implementations

### 3. Framework Agnostic Core
- Core types and functionality are framework-independent
- Framework-specific code is in separate modules
- Easy to add support for new frameworks
- Consistent API across different frameworks

### 4. Configuration Driven
- Extensive configuration options
- Sensible defaults with override capability
- Environment variable support
- Runtime configuration changes

### 5. Error Handling
- Comprehensive error types
- Proper error propagation
- User-friendly error messages
- Debugging information where appropriate

## Security Considerations

### 1. Replay Attack Prevention
- Nonce tracking in facilitator implementations
- Time-based authorization windows
- Cryptographic signature verification
- Blockchain-level protection via EIP-3009

### 2. Authentication
- JWT-based authentication for Coinbase API
- Secure key management
- Request signing for API calls
- Correlation tracking for debugging

### 3. Input Validation
- Comprehensive validation of payment payloads
- Network and scheme validation
- Amount validation and bounds checking
- Address format validation

## Testing Strategy

### 1. Unit Tests
- Individual component testing
- Mock implementations for external dependencies
- Property-based testing for cryptographic functions
- Error condition testing

### 2. Integration Tests
- End-to-end payment flow testing
- Framework integration testing
- Facilitator communication testing
- Cross-framework compatibility testing

### 3. Examples as Tests
- Working examples serve as integration tests
- Real-world usage patterns
- Documentation through code
- Regression testing

## Performance Considerations

### 1. Async Operations
- Non-blocking I/O for all network operations
- Concurrent request handling
- Efficient resource utilization
- Minimal allocation patterns

### 2. Caching
- Nonce tracking with efficient data structures
- Connection pooling for HTTP clients
- Response caching where appropriate
- Memory-efficient implementations

### 3. Resource Management
- Proper connection cleanup
- Timeout handling
- Memory-efficient serialization
- Minimal dependencies

## Extension Points

### 1. New Payment Schemes
- Extensible scheme support
- Plugin architecture for custom schemes
- Generic interfaces for scheme implementations
- Easy integration with existing code

### 2. New Frameworks
- Middleware trait system
- Framework-specific configuration
- Consistent API patterns
- Example implementations

### 3. Custom Facilitators
- Configurable facilitator clients
- Custom authentication methods
- Protocol extensions
- Integration patterns

## Dependencies

### Core Dependencies
- **serde/serde_json**: Serialization
- **reqwest**: HTTP client
- **tokio**: Async runtime
- **rust_decimal**: Decimal arithmetic
- **thiserror**: Error handling

### Cryptographic Dependencies
- **k256/secp256k1**: ECDSA operations
- **ethereum-types**: Ethereum data types
- **sha3**: Keccak-256 hashing
- **jsonwebtoken**: JWT creation

### Framework Dependencies
- **axum**: Modern web framework
- **tower**: Service abstraction
- **tower-http**: HTTP middleware

## Future Enhancements

### 1. Additional Framework Support
- Actix Web integration
- Warp integration
- Custom framework adapters

### 2. Enhanced Security
- Hardware wallet integration
- Multi-signature support
- Advanced authentication methods

### 3. Performance Improvements
- Connection pooling
- Response caching
- Batch operations
- Streaming support

### 4. Developer Experience
- Better error messages
- More comprehensive examples
- Interactive tutorials
- Debugging tools

## Conclusion

The x402 Rust implementation provides a robust, type-safe, and extensible foundation for HTTP-native micropayments. The architecture prioritizes security, performance, and developer experience while maintaining flexibility for future enhancements and customizations.
