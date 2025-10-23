# x402 Go SDK

Go implementation of the x402 payment protocol for HTTP 402 Payment Required responses with cryptocurrency payments.

## TODO

The Go SDK for x402 is currently in development. The implementation will follow the patterns established by the TypeScript core package while embracing idiomatic Go conventions.

### Proposed Package Structure

```
/go/x402
  /core           # Core protocol implementation
  /types          # Shared type definitions  
  /mechanisms     # Implementations
    /evm          # EVM blockchain implementation
    /svm          # Solana blockchain implementation
  /extensions     # Protocol extensions
    /bazaar       # Resource discovery extension
    /sign_in_with_x  # Authentication extension
  /client         # Client implementations
    /x402_client     # Base client
    /x402_http_client # HTTP-specific client
  /server         # Server implementations
    /x402_resource_server     # Core server logic
    /x402_http_resource_server # HTTP server
    /paywall      # Paywall HTML generation
    /gin          # Gin framework middleware
  /facilitator    # Facilitator components
    /x402_facilitator # Local facilitator
  /http           # HTTP adapters
    /gin          # Gin-specific adapter
```

### Server Framework Support

The SDK will provide middleware implementations for popular Go web frameworks, starting with **Gin**.

### Client HTTP Library Support

For client-side payment handling, we'll implement interceptors for popular client libraries.

The Go SDK will maintain API compatibility with the TypeScript and Python core package concepts while providing a native Go developer experience.
