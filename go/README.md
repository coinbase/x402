# x402 Go SDK

Go implementation of the x402 payment protocol for HTTP 402 Payment Required responses with cryptocurrency payments.

## Installation

```bash
go get github.com/coinbase/x402/go
```

## Quick Start

### Client Usage

```go
package main

import (
    "context"
    "fmt"
    "net/http"
    
    x402 "github.com/coinbase/x402/go"
    "github.com/coinbase/x402/go/http"
    "github.com/coinbase/x402/go/mechanisms/evm"
)

func main() {
    // Create EVM signer
    signer := evm.NewSigner(privateKey)
    
    // Create x402 HTTP client
    client := x402http.NewHTTPClient(
        x402http.WithScheme("eip155:8453", evm.NewExactClient(signer)),
    )
    
    // Wrap standard HTTP client
    httpClient := x402http.WrapHTTPClient(http.DefaultClient, client)
    
    // Make request - payment handled automatically
    resp, err := httpClient.Get("https://api.example.com/protected")
    if err != nil {
        panic(err)
    }
    defer resp.Body.Close()
    
    fmt.Println("Response:", resp.Status)
}
```

### Server Usage (Gin)

```go
package main

import (
    "github.com/gin-gonic/gin"
    x402 "github.com/coinbase/x402/go"
    "github.com/coinbase/x402/go/middleware/gin"
    "github.com/coinbase/x402/go/mechanisms/evm"
)

func main() {
    r := gin.Default()
    
    // Configure payment routes
    routes := x402gin.Routes{
        "GET /protected": {
            Scheme:  "exact",
            PayTo:   "0x...",
            Price:   "$0.001",
            Network: "eip155:8453",
        },
    }
    
    // Add payment middleware
    r.Use(x402gin.PaymentMiddleware(routes,
        x402gin.WithFacilitatorURL("https://facilitator.example.com"),
        x402gin.WithScheme("eip155:8453", evm.NewExactService()),
    ))
    
    r.GET("/protected", func(c *gin.Context) {
        c.JSON(200, gin.H{"data": "protected resource"})
    })
    
    r.Run(":8080")
}
```

## Features

- ✅ **Protocol v2 Support** - Full implementation of x402 protocol v2
- ✅ **EVM Support** - Built-in EVM blockchain support with EIP-3009
- ✅ **Framework Agnostic** - Core functionality with optional framework middleware
- ✅ **Tree-Shakeable** - Import only what you need
- ✅ **Type Safe** - Strong typing with Go generics
- ✅ **Context Support** - Proper context handling for cancellation
- ✅ **Concurrent Safe** - Thread-safe operations

## Documentation

- [Architecture](SDK_ARCHITECTURE.md)
- [Module Structure](MODULE_STRUCTURE.md)
- [API Reference](https://pkg.go.dev/github.com/coinbase/x402/go)

## Supported Frameworks

- [x] Gin
- [ ] Echo
- [x] net/http (standard library)
- [ ] Fiber
- [ ] Chi

## Supported Mechanisms

- [x] EVM (Ethereum, Base, etc.)
  - [x] Exact payment scheme (EIP-3009)
- [ ] Solana
- [ ] Bitcoin Lightning

## Testing

```bash
# Run all tests
make test

# Run with coverage
make test-cover

# Run integration tests
make test-integration

# Run e2e tests
make test-e2e
```

## Contributing

See [CONTRIBUTING.md](../CONTRIBUTING.md)

## License

MIT License - see [LICENSE](../LICENSE) for details
