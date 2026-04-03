# x402 Spring Boot Server Example

This example demonstrates how to create a Spring Boot server with x402 payment integration using the PaymentFilter.

## Features

- **Payment-gated endpoints**: Some endpoints require payment, others are free
- **Configurable pricing**: Different endpoints can have different prices
- **Automatic payment verification**: PaymentFilter handles all payment logic
- **Standard Spring Boot setup**: Easy integration with existing Spring applications
- **Environment-based configuration**: Flexible configuration via environment variables

## Quick Start

### Prerequisites

- Java 17+
- Maven 3.6+

### Setup

1. **Copy environment file:**
   ```bash
   cp .env-local .env
   ```

2. **Edit `.env` with your configuration:**
   ```bash
   # Required: Address where payments should be sent
   PAY_TO_ADDRESS=0x1234567890123456789012345678901234567890
   
   # Optional: Facilitator service URL
   FACILITATOR_URL=https://x402.org/facilitator
   ```

3. **Run the server:**
   ```bash
   mvn spring-boot:run
   ```

4. **Test the endpoints:**
   ```bash
   # Free endpoint - no payment required
   curl http://localhost:8080/free
   
   # Premium endpoint - requires 1000 wei payment
   curl http://localhost:8080/premium
   # Returns: 402 Payment Required
   
   # Exclusive endpoint - requires 5000 wei payment  
   curl http://localhost:8080/exclusive
   # Returns: 402 Payment Required
   ```

## Available Endpoints

| Endpoint | Payment Required | Price | Description |
|----------|------------------|-------|-------------|
| `/free` | No | 0 | Public content available to everyone |
| `/premium` | Yes | 1000 wei | Premium content requiring payment |
| `/exclusive` | Yes | 5000 wei | Exclusive content with higher price |
| `/health` | No | 0 | Health check endpoint |

## How Payment Works

1. **Client makes request** to a paid endpoint without payment
2. **PaymentFilter intercepts** the request
3. **Server returns 402** with payment challenge containing:
   - Required amount
   - Payment address
   - Accepted assets and networks
4. **Client creates payment** and resends request with payment header
5. **PaymentFilter verifies** payment with facilitator
6. **Request proceeds** to controller if payment is valid
7. **Settlement occurs** asynchronously after response

## Payment Response Example

When accessing `/premium` without payment:

```json
{
  "x402Version": 1,
  "accepts": [
    {
      "scheme": "exact",
      "network": "base-sepolia", 
      "maxAmountRequired": "1000",
      "asset": "USDC",
      "resource": "/premium",
      "mimeType": "application/json",
      "payTo": "0x1234567890123456789012345678901234567890",
      "maxTimeoutSeconds": 30
    }
  ],
  "error": "missing payment header"
}
```

## Configuration

The application uses a `FilterRegistrationBean` to register the `PaymentFilter`:

```java
@Bean
public FilterRegistrationBean<PaymentFilter> paymentFilter() {
    // Price table - endpoint -> price in wei
    Map<String, BigInteger> priceTable = Map.of(
        "/premium", BigInteger.valueOf(1000),
        "/exclusive", BigInteger.valueOf(5000)
    );
    
    HttpFacilitatorClient facilitator = new HttpFacilitatorClient(facilitatorUrl);
    PaymentFilter filter = new PaymentFilter(payToAddress, priceTable, facilitator);
    
    FilterRegistrationBean<PaymentFilter> registration = new FilterRegistrationBean<>();
    registration.setFilter(filter);
    registration.addUrlPatterns("/*");
    
    return registration;
}
```

## Environment Variables

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `PAY_TO_ADDRESS` | Yes | - | Ethereum address to receive payments |
| `FACILITATOR_URL` | No | `https://x402.org/facilitator` | Payment facilitator service URL |
| `SERVER_PORT` | No | `8080` | Server port |
| `LOGGING_LEVEL` | No | `INFO` | Log level |

## Testing with a Client

You can test this server with the [OkHttp client example](../../clients/okhttp/):

1. **Start the server** (this example)
2. **Update client configuration** to point to `http://localhost:8080/premium`
3. **Run the client** to see the full payment flow

## Integration with Existing Applications

To add x402 payments to your existing Spring Boot application:

1. **Add the x402 dependency** to your `pom.xml`
2. **Create a FilterRegistrationBean** similar to the example above
3. **Define your pricing table** for protected endpoints
4. **Configure your pay-to address** and facilitator URL

Example integration:

```java
@Configuration
public class PaymentConfiguration {
    
    @Bean
    public FilterRegistrationBean<PaymentFilter> paymentFilter(
            @Value("${app.pay-to-address}") String payToAddress,
            @Value("${app.facilitator-url}") String facilitatorUrl) {
        
        Map<String, BigInteger> prices = Map.of(
            "/api/premium", BigInteger.valueOf(1000),
            "/api/exclusive", BigInteger.valueOf(5000)
        );
        
        PaymentFilter filter = new PaymentFilter(
            payToAddress, 
            prices, 
            new HttpFacilitatorClient(facilitatorUrl)
        );
        
        FilterRegistrationBean<PaymentFilter> registration = new FilterRegistrationBean<>();
        registration.setFilter(filter);
        registration.addUrlPatterns("/api/*");
        
        return registration;
    }
}
```

## Learn More

- [x402 Java SDK](../../../java/)
- [x402 Protocol Specification](../../../specs/x402-specification-v2.md)
- [Spring Boot Documentation](https://spring.io/projects/spring-boot)