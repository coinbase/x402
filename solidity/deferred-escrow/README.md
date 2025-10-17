## DeferredPaymentEscrow

Smart contracts implementing escrowing and vouchers mechanisms needed for the `deferred` x402 payment scheme. The main contract is `DeferredPaymentEscrow.sol`.

## Usage

### Build

```shell
$ forge build
```

### Test

```shell
$ forge test
```

### Format

```shell
$ forge fmt
```

### Gas Snapshots

```shell
$ forge snapshot
```

### Anvil

```shell
$ anvil
```

### Deploy

Deploy the DeferredPaymentEscrow contract with UUPS proxy:

```shell
$ forge script script/DeployDeferredPaymentEscrow.s.sol --rpc-url <your_rpc_url> --private-key <your_private_key> --broadcast
```

For testnet/mainnet deployment with verification:

```shell
$ forge script script/DeployDeferredPaymentEscrow.s.sol \
    --rpc-url <your_rpc_url> \
    --private-key <your_private_key> \
    --broadcast \
    --verify \
    --etherscan-api-key <your_etherscan_api_key>
```

### Cast

```shell
$ cast <subcommand>
```

### Help

```shell
$ forge --help
$ anvil --help
$ cast --help
```
