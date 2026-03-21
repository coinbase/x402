# Lightning regtest (Docker Compose + LND)

Layer 3 tests run against real LND nodes on regtest.

## Prerequisites

- Docker (with `docker compose`)
- Python environment for `x402/python/x402` tests (`uv` recommended)

## One-command setup

From the `x402` repo root:

```bash
bash regtest/lightning/setup.sh
```

This command:

- starts `bitcoind`, `alice`, and `bob` via `docker-compose`
- funds `alice`
- opens and confirms an `alice -> bob` channel
- writes `regtest/lightning/.env.lightning` with REST hosts + TLS cert/macaroon paths

## Run Layer 3 tests (includes setup)

```bash
bash regtest/lightning/run-tests.sh
```

## Run Layer 3 tests (reuse existing stack)

```bash
bash regtest/lightning/run-tests.sh --skip-setup
```

## Teardown

```bash
bash regtest/lightning/teardown.sh
```

Remove all persisted data/volumes:

```bash
bash regtest/lightning/teardown.sh --purge
```
