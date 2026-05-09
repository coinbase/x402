# x402 OkHttp Client Example

This example demonstrates how to use the x402 Java SDK with OkHttp for making HTTP requests with automatic payment handling.

## Features

- Automatic payment header generation
- Ethereum signature creation using Web3j
- Environment-based configuration
- Error handling for payment scenarios
- Integration with popular OkHttp library

## Quick Start

### Prerequisites

- Java 17+
- Maven 3.6+
- An Ethereum private key for testing

### Setup

1. **Copy environment file:**
   ```bash
   cp .env-local .env
   ```

2. **Edit `.env` with your configuration:**
   ```bash
   # Required: Your EVM private key
   EVM_PRIVATE_KEY=0x1234...your_key_here
   
   # Optional: Test server (defaults to echo server)
   RESOURCE_SERVER_URL=https://echo.x402.org
   ENDPOINT_PATH=/echo
   ```

3. **Install dependencies and run:**
   ```bash
   mvn clean compile exec:java
   ```

## How It Works

1. **Environment Loading**: Loads configuration from `.env` file
2. **Client Setup**: Creates x402 client with Ethereum signing capabilities  
3. **Payment Request**: Makes HTTP request with automatic payment handling
4. **Response Processing**: Handles both 402 (payment required) and 200 (success) responses

## Code Structure

```
src/main/java/com/coinbase/x402/examples/client/
├── Main.java              # Main application class
├── Config.java           # Configuration record (inner class)
└── Web3jSigner.java      # Ethereum signer implementation (inner class)
```

## Configuration

| Environment Variable | Required | Default | Description |
|---------------------|----------|---------|-------------|
| `EVM_PRIVATE_KEY` | Yes | - | Ethereum private key for signing payments |
| `RESOURCE_SERVER_URL` | No | `https://echo.x402.org` | Base URL of the resource server |
| `ENDPOINT_PATH` | No | `/echo` | Path to the protected endpoint |

## Dependencies

- **x402 Java SDK**: Core x402 payment functionality
- **OkHttp**: HTTP client library
- **Web3j**: Ethereum integration for signing
- **Jackson**: JSON processing
- **dotenv-java**: Environment variable loading

## Error Scenarios

### Missing Private Key
```
Error: EVM_PRIVATE_KEY environment variable is required. 
Please copy .env-local to .env and set your private key.
```

### Payment Required (402)
```
Response status: 402
402 Payment Required - payment challenge received
```

### Successful Payment (200)
```  
Response status: 200
✅ Payment successful - received protected content
```

## Integration with Your Application

To integrate this pattern into your application:

1. **Create a signer implementation** for your preferred crypto library
2. **Initialize the x402 client** with your signer
3. **Make requests** using the client's HTTP methods
4. **Handle payment responses** appropriately

Example integration:

```java
// Create your signer
CryptoSigner signer = new YourCustomSigner(privateKey);

// Create x402 client
X402HttpClient client = new X402HttpClient(signer);

// Make payment-enabled requests
HttpResponse<String> response = client.get(
    URI.create("https://api.example.com/premium"), 
    BigInteger.valueOf(1000), // amount
    "USDC",                   // asset
    "0x123..."                // payTo
);
```

## Learn More

- [x402 Java SDK](../../../java/)
- [x402 Protocol Specification](../../../specs/x402-specification-v2.md)
- [OkHttp Documentation](https://square.github.io/okhttp/)
- [Web3j Documentation](https://docs.web3j.io/)