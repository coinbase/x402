# Lightning regtest (Polar + LND)

Layer 3 tests run against real LND nodes on regtest.

## Prerequisites

- Polar installed and running
- A Polar network with:
  - 1 `bitcoind`
  - 2 LND nodes named `alice` (merchant) and `bob` (client)
  - A funded channel between `alice` and `bob` (recommended: 1,000,000 sats)
- `jq` installed

## Setup

From the `x402` repo root:

```bash
bash regtest/lightning/setup-polar.sh
```

This generates `regtest/lightning/.env.lightning` with the detected node paths and REST endpoints.

## Run Layer 3 tests

```bash
cd python/x402
uv run pytest tests/integrations/test_lightning.py -v
```

## Manual env setup (optional)

If auto-detection does not match your Polar layout, copy `regtest/lightning/.env.example` to `regtest/lightning/.env.lightning` and edit values.
