# x402 Java Examples

Examples for the x402 Java SDK.

## Quick Start

```bash
cd clients/okhttp
cp .env-local .env
# Edit .env with your EVM_PRIVATE_KEY and/or SVM_PRIVATE_KEY
mvn clean compile exec:java -Dexec.mainClass="com.coinbase.x402.examples.client.Main"
```

## Overview

### Clients
- **[clients/okhttp/](./clients/okhttp/)** - HTTP client using OkHttp with automatic payment handling
- **[clients/java-http/](./clients/java-http/)** - HTTP client using Java 11+ HttpClient
- **[clients/manual/](./clients/manual/)** - Manual payment handling without convenience wrappers
- **[clients/spring/](./clients/spring/)** - Spring Boot client integration

### Servers  
- **[servers/spring-boot/](./servers/spring-boot/)** - Spring Boot server with payment filter
- **[servers/servlet/](./servers/servlet/)** - Standard servlet container with payment filter
- **[servers/jetty/](./servers/jetty/)** - Embedded Jetty server with payment middleware
- **[servers/manual/](./servers/manual/)** - Manual payment verification

### Facilitator
- **[facilitator/](./facilitator/)** - Payment facilitator service implementation

## Legacy SDK

- **[legacy/](./legacy/)** - V1 SDK examples (for backward compatibility)

## Requirements

- Java 17+
- Maven 3.6+
- Jakarta Servlet API or javax.servlet

## Learn More

- [Java SDK](../../java/)
- [x402 Protocol](https://x402.org)
- [x402 Specification](../../specs/x402-specification-v2.md)