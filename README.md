# x402 Hedera

> Build and demo paywalled experiences on Hedera testnet in minutes. This fork is in alpha.

This repo packages everything you need to stand up the x402 payment flow on Hedera: a facilitator, a token-gated resource server, and a sample client that pays for access.

## Prerequisites

- Node.js 18+ and `pnpm` 10.7+ (`corepack enable pnpm` if you need to install it)
- `git` and a POSIX shell (`bash`/`zsh`)
- Hedera **ECDSA** testnet account funded with HBAR and associated with USDC `0.0.429274`
- Basic familiarity with editing `.env` files on your machine

Need help preparing the Hedera account? Jump to [Prepare your Hedera testnet wallet](#prepare-your-hedera-testnet-wallet).

## Quick Start (TL;DR)

```bash
git clone https://github.com/hedera-dev/x402-hedera.git
cd x402-hedera
chmod +x setup.sh
./setup.sh
```

Then open three terminals, all from the repo root:

1. **Facilitator** – `cd examples/typescript/facilitator && cp .env-local .env` → fill `HEDERA_ACCOUNT_ID` + `HEDERA_PRIVATE_KEY` → `pnpm dev`
2. **Resource server** – `cd examples/typescript/servers/express && cp .env-local .env` → set `ADDRESS` to the account that receives funds → `pnpm dev`
3. **Client** – `cd examples/typescript/clients/axios && cp .env-local .env` → set `PRIVATE_KEY` for the paying account → `pnpm dev`

You should see successful payments logged in all three terminals as the client purchases `/hedera-usdc` and `/hedera-native`.

## Prepare your Hedera testnet wallet

1. Create or log into the [Hedera Developer Portal](https://portal.hedera.com) and generate an **ECDSA** testnet account.
2. Fund the account with testnet HBAR from the portal faucet.
3. Associate USDC token `0.0.429274` with the wallet. Most wallets have an “Associate Token” action where you paste the token ID, or you can run this [Hedera Portal Script](<https://portal.hedera.com/playground?code=const%20%7B%0A%20%20%20%20AccountId%2C%0A%20%20%20%20PrivateKey%2C%0A%20%20%20%20Client%2C%0A%20%20%20%20TokenAssociateTransaction%0A%20%20%7D%20%3D%20require(%22%40hashgraph%2Fsdk%22)%3B%20%2F%2F%20v2.64.5%0A%0Aasync%20function%20main()%20%7B%0A%20%20let%20client%3B%0A%20%20try%20%7B%0A%20%20%20%20%2F%2F%20Your%20account%20ID%20and%20private%20key%20from%20string%20value%0A%20%20%20%20const%20MY_ACCOUNT_ID%20%3D%20AccountId.fromString(%22%3CAccountId%3E%22)%3B%0A%20%20%20%20const%20MY_PRIVATE_KEY%20%3D%20PrivateKey.fromStringECDSA(%22%3CPrivateKey%3E%22)%3B%0A%0A%20%20%20%20%2F%2F%20Pre-configured%20client%20for%20testnet%0A%20%20%20%20client%20%3D%20Client.forTestnet()%3B%0A%0A%20%20%20%20%2F%2FSet%20the%20operator%20with%20the%20account%20ID%20and%20private%20key%0A%20%20%20%20client.setOperator(MY_ACCOUNT_ID%2C%20MY_PRIVATE_KEY)%3B%0A%0A%20%20%20%20%2F%2F%20Start%20your%20code%20here%0A%20%20%20%20const%20tokenId%20%3D%20'0.0.429274'%0A%20%20%20%20%0A%20%20%20%20%2F%2FAssociate%20a%20token%20to%20an%20account%20and%20freeze%20the%20unsigned%20transaction%20for%20signing%0A%20%20%20%20const%20txTokenAssociate%20%3D%20await%20new%20TokenAssociateTransaction()%0A%20%20%20%20%20%20.setAccountId(MY_ACCOUNT_ID)%0A%20%20%20%20%20%20.setTokenIds(%5BtokenId%5D)%20%2F%2FFill%20in%20the%20token%20ID%0A%20%20%20%20%20%20.freezeWith(client)%3B%0A%0A%20%20%20%20%2F%2FSign%20with%20the%20private%20key%20of%20the%20account%20that%20is%20being%20associated%20to%20a%20token%20%0A%20%20%20%20const%20signTxTokenAssociate%20%3D%20await%20txTokenAssociate.sign(MY_PRIVATE_KEY)%3B%0A%0A%20%20%20%20%2F%2FSubmit%20the%20transaction%20to%20a%20Hedera%20network%20%20%20%20%0A%20%20%20%20const%20txTokenAssociateResponse%20%3D%20await%20signTxTokenAssociate.execute(client)%3B%0A%0A%20%20%20%20%2F%2FRequest%20the%20receipt%20of%20the%20transaction%0A%20%20%20%20const%20receiptTokenAssociateTx%20%3D%20await%20txTokenAssociateResponse.getReceipt(client)%3B%0A%0A%20%20%20%20%2F%2FGet%20the%20transaction%20consensus%20status%0A%20%20%20%20const%20statusTokenAssociateTx%20%3D%20receiptTokenAssociateTx.status%3B%0A%0A%20%20%20%20%2F%2FGet%20the%20Transaction%20ID%0A%20%20%20%20const%20txTokenAssociateId%20%3D%20txTokenAssociateResponse.transactionId.toString()%3B%0A%0A%20%20%20%20console.log(%22---------------------------------%20Token%20Associate%20---------------------------------%22)%3B%0A%20%20%20%20console.log(%22Receipt%20status%20%20%20%20%20%20%20%20%20%20%20%3A%22%2C%20statusTokenAssociateTx.toString())%3B%0A%20%20%20%20console.log(%22Transaction%20ID%20%20%20%20%20%20%20%20%20%20%20%3A%22%2C%20txTokenAssociateId)%3B%0A%20%20%20%20console.log(%22Hashscan%20URL%20%20%20%20%20%20%20%20%20%20%20%20%20%3A%22%2C%20%22https%3A%2F%2Fhashscan.io%2Ftestnet%2Ftransaction%2F%22%20%2B%20txTokenAssociateId)%3B%0A%20%20%20%20%20%20%0A%20%20%7D%20catch%20(error)%20%7B%0A%20%20%20%20console.error(error)%3B%0A%20%20%7D%20finally%20%7B%0A%20%20%20%20if%20(client)%20client.close()%3B%0A%20%20%7D%0A%7D%0A%0Amain()%3B%0A&language=javascript>).
4. Visit the [Circle testnet faucet](https://faucet.circle.com), choose **Hedera Testnet**, enter your account ID, and request USDC. The facilitator will spend from this account when verifying payments.

Keep both the account ID (`0.0.x`) and the private key handy; you will need them in the next steps.

## Install project dependencies

The `setup.sh` script installs and builds the monorepo packages and the TypeScript examples.

```bash
chmod +x setup.sh
./setup.sh
```

If you prefer to do it manually:

```bash
cd typescript && pnpm install && pnpm build
cd ../examples/typescript && pnpm install && pnpm build
```

## Run the facilitator

Terminal 1:

```bash
cd examples/typescript/facilitator
cp .env-local .env
```

Update `.env` with your fee payer credentials:

- `HEDERA_ACCOUNT_ID` – account that signs and pays fees
- `HEDERA_PRIVATE_KEY` – private key for the account (ECDSA)
- Optional `PORT` (defaults to `3002`)
- 

OR 

Use our hosted testnet facilitator https://x402-hedera-production.up.railway.app/

You will need to update the .env in the next step

Start the facilitator:

```bash
pnpm dev
```

You should see `Server listening on http://localhost:3002`.

## Run the resource server

Terminal 2:

```bash
cd examples/typescript/servers/express
cp .env-local .env
```

Configure `.env`:

- `FACILITATOR_URL` – typically `http://localhost:3002`
- `NETWORK` – leave as `hedera-testnet`
- `ADDRESS` – Hedera account that will receive the payment (can match the facilitator account or be different)

Start the server:

```bash
pnpm dev
```

The server exposes:

- `GET /weather` – free endpoint
- `GET /hedera-usdc` – pay $0.001 USDC on Hedera
- `GET /hedera-native` – pay 0.5 HBAR natively

## Run the client

Terminal 3:

```bash
cd examples/typescript/clients/axios
cp .env-local .env
```

Set `RESOURCE_SERVER_URL` (default `http://localhost:4021`), `PRIVATE_KEY` for the paying account, and leave `ENDPOINT_PATH` as `/hedera-native` to exercise native HBAR payments. You can switch it to `/hedera-usdc` to test USDC payments instead.

Run the client:

```bash
pnpm dev
```

The script will:

1. Request the protected endpoint
2. Receive a `402 Payment Required`
3. Pay through the facilitator
4. Retry and receive the gated response

Expect to see logs showing the transaction hash and the JSON payload returned from the server.

## Verify everything is wired up

- The facilitator terminal prints `verify` and `settle` calls as they succeed.
- The resource server logs incoming payments and successful responses.
- The client prints the final response body, for example:

```json
{
  "message": "You paid 0.5 HBAR natively!",
  "data": {
    "premium_content": "Exclusive Hedera network data with native payment",
    "paid_with": "HBAR",
    "amount_hbar": "0.5"
  }
}
```

You can also replay the flow manually with `curl`:

```bash
curl -i http://localhost:4021/hedera-usdc
```

The first response will be `402 Payment Required`. Use the client to handle the payment, or craft your own request with the `X-PAYMENT` header if you are exploring deeper integrations.

## Troubleshooting

- `TOKEN_NOT_ASSOCIATED` – make sure the paying account associated USDC `0.0.429274`.
- `INVALID_SIGNATURE` – confirm you are using an ECDSA account and the private key matches the ID.
- `insufficient payer balance` – top up HBAR via the Hedera portal and USDC via the Circle faucet.
- `.env` not loading – double-check you renamed `.env-local` to `.env` in each directory.
- Ports busy – adjust `PORT` in the facilitator `.env` or the server script.

## Project layout essentials

- `setup.sh` – installs and builds the TypeScript packages and examples.
- `examples/typescript/facilitator` – Hedera facilitator reference implementation.
- `examples/typescript/servers/express` – paywalled Express server with Hedera endpoints.
- `examples/typescript/clients/axios` – sample client that pays via x402.
- `specs/` – protocol specs if you want to dig into the internals.

Run `pnpm test` from `typescript/` if you want to execute the library test suite.

## Learn more about x402

- [x402.org](https://x402.org) – protocol overview and ecosystem
- [Protocol specs](./specs) – full request/response formats
- [ROADMAP.md](./ROADMAP.md) – upcoming protocol milestones

Questions during the hackathon? Drop into the event Discord or open an issue, and share what you are building!
