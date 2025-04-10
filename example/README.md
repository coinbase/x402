# x409 Example

## Setup
Build in the root and install required packages in the `example/` directory.
```
npm run build
cd example/
npm install
```

Make a copy of the example `.env` file.
```
cp ../packages/typescript/x402/.env.example .env
```

Edit `.env` adding the private key and public address of three acounts.

You can run `keygen` to generate new random accounts.
```
npm run keygen
```

## Fund the wallets
The client requires USDC and the facilitator requires ETH, both on the Base Sepolia network.

If you don't already have some, you can get each of these with a free developer account from the [Coinbase Developer Platform Faucet](https://portal.cdp.coinbase.com/products/faucet). (requires a free account)

The Base Sepolia explorer can be found at https://sepolia.basescan.org - check to make sure your accounts have the necessary funds.

## Run
* In two other terminal windows, run
  ```
  npm run facilitator
  ```
  and
  ```
  npm run resource
  ```
* Run the client
  ```
  npm run client
  ```
If all goes well, your client will make a request to `/joke`, get a 402 response and then pay $0.01 USDC to get a random joke returned.

You will notice the USDC balance going down by $0.01 each request you make.
