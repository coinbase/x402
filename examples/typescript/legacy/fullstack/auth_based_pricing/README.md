# SIWE + JWT + Conditional x402 Demo

This project demonstrates a pattern for combining Sign-In with Ethereum (SIWE), JWT-based session management, and dynamic, conditional pricing for API endpoints using x402 payments. It includes a Hono backend server and a separate client script to simulate user interactions.

## Core Concepts

1.  **Wallet Authentication (SIWE)**:
    *   Users prove ownership of a wallet address by signing a server-issued EIP-4361 compliant message.
    *   The `siwe` library is used on both server and client for message creation and verification.

2.  **JWT for Sessions**:
    *   Upon successful SIWE message verification, the server issues a JSON Web Token (JWT).
    *   This JWT is sent by the client in subsequent requests (in the `Authorization: Bearer <token>` header) to access protected or feature-enhanced endpoints.

3.  **x402 Programmable Payments**:
    *   API endpoints can require micropayments for access using the [x402 standard](https://x402.dev).
    *   This demo shows manual x402 challenge/verification handling on the server for maximum control, inspired by the x402 SDK's advanced examples.

4.  **Conditional x402 Pricing**:
    *   The `/demo-weather` endpoint dynamically adjusts its price based on JWT authentication:
        *   **Authenticated users (with JWT):** $0.01.
        *   **Unauthenticated users (no JWT):** $0.10.

## Project Structure

```
siwe-x402-jwt-demo/
├── .env-local        # Local environment variables (gitignored)
├── package.json      # Project dependencies and scripts
├── tsconfig.json     # TypeScript configuration
├── README.md         # This file
├── backend.ts        # Hono server with SIWE auth and manual x402 logic
├── client.ts         # Script to simulate client login and API calls
```

## Prerequisites

*   Node.js (v18+ recommended)
*   npm or yarn
*   A testnet wallet with some test ETH (e.g., on Base Sepolia) for `CLIENT_SIM_PRIVATE_KEY` to make x402 payments.

## Setup

1.  **Clone/Setup Files**: Ensure all project files are in place.

2.  **Install dependencies**:
    ```bash
    npm install
    ```

3.  **Set up environment variables**:
    *   Create a file named `.env-local` in the project root.
    *   Populate it with your secrets (refer to `.env.example` or previous instructions for required variables like `JWT_SECRET`, `DEMO_SERVER_PORT`, `CLIENT_SIM_PRIVATE_KEY`, `BUSINESS_WALLET_ADDRESS`, `FACILITATOR_URL`, `X402_NETWORK`).
    *   **Crucially**, `CLIENT_SIM_PRIVATE_KEY` needs to be a funded testnet wallet private key.

## Running the Demo

You'll need two terminal windows:

1.  **Terminal 1: Start the Backend Server**
    *   For development with auto-reloading:
        ```bash
        npm run dev:server
        ```
    *   Or, to run the built version (after `npm run build`):
        ```bash
        npm run start:server
        ```
    *   The server will start (default: `http://localhost:3000`).

2.  **Terminal 2: Run the Client Simulation**
    *   Once the server is running, execute the client script:
        *   For direct TypeScript execution:
            ```bash
            npm run dev:client
            ```
        *   Or, to run the built version (after `npm run build`):
            ```bash
            npm run start:client
            ```

## Expected Output & Flow

*   **Server Terminal**: Shows server startup logs, SIWE nonce issuance, SIWE verification results, JWT pricing decisions, x402 payment verification, and settlement logs.
*   **Client Terminal**: Shows the client simulation steps:
    1.  Attempting SIWE login (requesting nonce, signing, verifying).
    2.  Logging the received JWT upon successful login.
    3.  Calling `/demo-weather` WITH the JWT:
        *   Server should apply the $0.01 price.
        *   Client handles the 402 challenge and pays $0.01.
        *   Logs the weather data and the `x-payment-response` for the $0.01 payment.
    4.  Calling `/demo-weather` WITHOUT the JWT:
        *   Server should apply the $0.10 price.
        *   Client handles the 402 challenge and pays $0.10.
        *   Logs the weather data and the `x-payment-response` for the $0.10 payment.

This demonstrates the end-to-end flow of wallet authentication, JWT-based sessions, and dynamic, conditional x402 payments.

## Migrating to Base Mainnet with the CDP Facilitator

To use x402 payments on Base mainnet (instead of Sepolia testnet), follow these steps:

### 1. Environment Variable Changes

- In your `.env` (or environment), set:
  ```
  X402_NETWORK=base
  BUSINESS_WALLET_ADDRESS=<your mainnet address>
  CLIENT_SIM_PRIVATE_KEY=<mainnet private key with USDC on Base>
  ```
- **Remove or ignore** any `FACILITATOR_URL` variable. The CDP facilitator is imported from `@coinbase/x402` in code.

### 2. Code Changes in `backend.ts` (don't forget to run `npm run build`)

- **Facilitator Import:**
  ```ts
  import { facilitator } from "@coinbase/x402";
  const { verify: verifyX402Payment, settle: settleX402Payment } = useFacilitator(facilitator);
  ```
- **Network:**
  Ensure `X402_NETWORK` is set to `'base'` (not `'base-sepolia'`).
- **Asset:**
  Make sure your price string (e.g., `$0.01`) maps to a supported asset on Base mainnet (typically USDC). The asset address is handled by the x402 SDK, but your wallet must have the correct token.
- **Funding:**
  Both `BUSINESS_WALLET_ADDRESS` and the client wallet must be funded with USDC on Base mainnet.

### 3. Code Changes in `client.ts`

- **Chain ID:**
  ```ts
  import { base } from 'viem/chains';
  const chainId = base.id; // 8453 for Base mainnet
  ```
- **Private Key:**
  The `CLIENT_SIM_PRIVATE_KEY` must be funded on Base mainnet with USDC.

### 4. Troubleshooting 500 Errors

- **Facilitator/Network Mismatch:**
  - Ensure you are using the mainnet facilitator from `@coinbase/x402` and not a testnet URL.
  - `X402_NETWORK` must be `'base'`.
- **Asset Issues:**
  - If your price string or asset is not supported on Base, payments will fail.
- **Wallet Funding:**
  - Both business and client wallets must have USDC on Base mainnet.
- **Error Logging:**
  - Check server logs for error details. Add more logging in `backend.ts` if needed.
- **Client Chain ID:**
  - Ensure the client uses the correct chain ID (8453 for Base mainnet).

If you encounter persistent 500 errors, check the logs for messages from the facilitator or asset processing functions. Most issues are due to misconfiguration of environment variables, unsupported assets, or lack of wallet funding.

## Notes & Further Development

*   **Nonce Store**: The server's nonce store is in-memory. For production, use a persistent, time-to-live (TTL) store like Redis.
*   **SIWE Message Fields**: The client constructs a SIWE message with basic fields. Ensure `domain`, `uri`, `chainId`, `issuedAt`, and `expirationTime` (optional) are robustly handled and verified by the server in a production setting according to EIP-4361 best practices.
*   **Error Handling**: The demo has basic error logging. Production systems need comprehensive error handling and user feedback.
*   **Security**: `JWT_SECRET` must be strong and kept confidential. Private keys should never be hardcoded directly in client-side code for real applications; use browser wallet extensions. `CLIENT_SIM_PRIVATE_KEY` is for this demo's automation only.
*   **x402 SDKs**: Ensure you are using compatible versions of `x402`, `x402-fetch`, and any Hono-specific x402 integrations if you deviate from this demo's manual server-side handling.
