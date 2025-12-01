# VRF NFT Minting Example (via x402 Payment)

This example demonstrates how a client pays USDC via the `x402` protocol (`exact` scheme) to a custom resource server. This resource server, upon successful payment verification and settlement via a facilitator, then uses its own funds to pay ETH and mint a VRF NFT to the client's address.

Based on the value returned by the VRF result, one of four characters will be selected for the NFT. The NFT and its image can be viewed on [OpenSea](https://testnets.opensea.io/) by connecting to Base Sepolia and searching for the NFT contract address. The source code for the contract can be viewed [here](https://sepolia.basescan.org/address/0xcD8841f9a8Dbc483386fD80ab6E9FD9656Da39A2#code).

## Architecture

This example involves three components running concurrently:

1.  **Facilitator Server (`examples/typescript/facilitator.ts`):** A standard x402 facilitator server responsible for verifying payment signatures (`/verify`) and settling USDC payments (`/settle`) by calling `transferWithAuthorization` on the USDC contract. The Facilitator responds to requests from the VRF Resource Server
2.  **VRF Resource Server (`resource.ts`):** A custom HTTP server (using Hono) that:
    - Exposes a `/request-mint` endpoint.
    - Handles initial requests by responding with `402 Payment Required`, providing the necessary `PaymentDetails` (USDC amount, recipient address, etc.).
    - Receives subsequent requests containing the `X-PAYMENT` header (sent by the client's interceptor, implmented in `x402/axios`).
    - Calls the **Facilitator's** `/verify` endpoint to validate the client's payment.
    - If valid, it extracts the client's address (`from`) from the payment payload.
    - Uses its _own wallet_ (funded with ETH) and `viem` to call `requestNFT(address _recipient)` on the target NFT contract, passing the client's address and the required ETH value.
    - Calls the **Facilitator's** `/settle` endpoint to trigger the actual USDC transfer from the client to the resource server's wallet.
    - Responds to the client with the outcome (including minting and settlement transaction hashes).
3.  **Client (`client.ts`):** A script that:
    - Uses `axios` with the `x402/axios` interceptor. The implementation of this custom interceptor is in `/typescript/packages/x402-axios`
    - Makes a request to the **Resource Server's** `/request-mint` endpoint.
    - The interceptor automatically handles the `402` response, prompts the client's wallet (via `viem`) to sign the EIP-3009 authorization for the USDC payment, constructs the `X-PAYMENT` header, and retries the request.

## Setup

1. **Install and Build Parent Dependencies:**

   ```bash
   cd typescript
   npx pnpm install
   npx pnpm build
   ```

2. **Install and Build Example Dependencies:**

   ```bash
   cd ../examples/typescript
   npx pnpm install
   npx pnpm build
   ```

3. **Install This Project's Dependencies:**

   ```bash
   cd clients/chainlink-vrf-nft
   pnpm install
   ```

4. **Environment Variables (`example/.env`):** Create a `.env` file in the `example` directory with the following variables (replace placeholder values):

   ```dotenv
   # Wallet that pays the USDC (needs USDC and ETH for gas)
   PRIVATE_KEY=0xYOUR_CLIENT_PRIVATE_KEY

   # HTTP RPC endpoint for the blockchain network (e.g., Base Sepolia)
   # Must be accessible by all components
   PROVIDER_URL=https://base-sepolia.g.alchemy.com/v2/YOUR_ALCHEMY_KEY
   ```

## Running the Example

You need three separate terminals, all navigated to the `example` directory.

1.  **Terminal 1: Start Facilitator:**

    Start a new terminal instance

    ```bash
    cd examples/typescript/facilitator
    cp .env-local .env
    ```

    Fill in the value for `PRIVATE_KEY=` in the `.env` file then run:

    ```bash
    pnpm dev
    ```

    Check that your terminal shows something along the lines of `Server listening at http://localhost:<<FACILITATOR\_\_PORT>>`

2.  **Terminal 2: Start VRF Resource Server:**

    Start a new terminal instance

    ```bash
    cd examples/typescript/clients/chainlink-vrf-nft
    npx pnpm install
    pnpm run resource
    ```

3.  **Terminal 3: Run VRF Client:**

    Start a new terminal instance

    ```bash
    cd examples/typescript/clients/chainlink-vrf-nft
    pnpm run client
    ```

## Expected Output

- **Facilitator Terminal:** Logs for starting.
- **Resource Server Terminal:** Logs for starting, receiving the client request, calling facilitator `/verify`, calling the NFT contract, calling facilitator `/settle`, and responding 200 OK to the client.
- **Client Terminal:** Logs attempting the request, followed by the success response (Status 200) from the resource server, including the NFT mint transaction hash.
