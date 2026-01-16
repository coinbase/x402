# X402 Java Examples

This directory contains Java examples for using the X402 protocol in clients, servers, and discovery use cases. Examples reuse the Java SDK under `java/` and are minimal, runnable Maven projects.

## Setup

Before running any examples, ensure you have:

- JDK 17+
- Maven 3.8+

Install the core Java SDK locally so the examples can depend on it:

```bash
# From the repo root
mvn -q -f java/pom.xml -DskipTests install
```

## Example Structure

- Clients:
  - `clients/httpclient/` – Java 17 `HttpClient` using `X402HttpClient` and a simple `CryptoSigner`.
  
- Discovery:
  - `discovery/http-facilitator/` – Calls the facilitator to list supported kinds.
- Servers:
  - `servers/jetty-servlet/` – Embedded Jetty registering `PaymentFilter` with a price table.
  - `servers/spring-boot-filter/` – Spring Boot application wiring `PaymentFilter` as a bean to protect routes.
- Fullstack:
  - (optional) `fullstack/basic/` – Spring Boot backend + small UI with a protected endpoint.

## Running Examples

Each example directory includes its own README with specific instructions. In general:

```bash
cd <example-dir>
cp .env-local .env   # then fill in required values
mvn exec:java        # or: mvn spring-boot:run (for Spring Boot examples)
```

Common environment variables:

- `X402_PRIVATE_KEY` – Development wallet private key (never use a mainnet-funded key).
- `X402_FACILITATOR_URL` – Facilitator base URL.
- `X402_PAY_TO` – Receiver address for payments.
- `X402_ASSET` – Asset symbol or contract (e.g., `USDC`).

## Development

- Build tools: Maven, JDK 17.
- Dependency flow: examples depend on `com.coinbase:x402:1.0.0-SNAPSHOT` installed locally from the repo’s `java/` module.
- Keep examples minimal and focused; each example is an independent Maven project.

## A note on private keys

The examples commonly use private keys to sign messages. Never put a private key with mainnet funds in a `.env` file or commit any secrets. Use a development wallet funded on testnets (e.g., Base Sepolia USDC/ETH).
