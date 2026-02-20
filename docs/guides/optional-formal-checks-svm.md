---
title: "Optional Formal Checks for SVM Settlements"
description: "A minimal Rust + Kani example for proving SVM payment invariants used in x402 settlement paths."
---

This guide is optional. x402 does not require formal methods, but teams with Rust settlement logic can add verifier checks in CI.

## What this proves

The mini harness below proves three high-value invariants for a Solana/SVM payment flow:

- replay/idempotency on request IDs
- allowlisted CPI target enforcement
- lamport conservation between payer and merchant

## 1) Add `kamiyo-kani`

```toml
[dev-dependencies]
kamiyo-kani = { version = "0.1.1", features = ["solana-agent"] }
```

## 2) Mini proof harness

```rust
#![cfg(kani)]

use kamiyo_kani::agent::{
    any_agent_account, assert_cpi_authorized, assert_lamport_conservation, AgentConfig, CpiLog,
};
use kamiyo_kani::cpi_contract;

const PAYMENT_PROGRAM: [u8; 32] = [0xA4; 32];

fn apply_request(request_id: u64, payload_hash: u64, seen: &mut Option<(u64, u64)>) -> bool {
    match seen {
        None => {
            *seen = Some((request_id, payload_hash));
            true
        }
        Some((seen_id, seen_hash)) => {
            if *seen_id != request_id {
                *seen = Some((request_id, payload_hash));
                return true;
            }
            *seen_hash == payload_hash
        }
    }
}

cpi_contract! {
    name: settle_payment,
    program: PAYMENT_PROGRAM,
    args: |
        payer: &mut kamiyo_kani::agent::AgentAccount,
        merchant: &mut kamiyo_kani::agent::AgentAccount,
        amount: u64
    | {},
    requires: {
        kani::assume(amount > 0);
        kani::assume(amount <= payer.lamports);
        kani::assume(merchant.lamports.checked_add(amount).is_some());
    },
    body: {
        payer.lamports -= amount;
        merchant.lamports += amount;
    },
    ensures: {},
    record: {
        lamports_transferred: amount,
        accounts_touched: 2,
    },
}

#[kani::proof]
fn proof_svm_payment_invariants() {
    let mut payer = any_agent_account(AgentConfig::new().payer());
    let mut merchant = any_agent_account(AgentConfig::new().writable());
    let amount: u64 = kani::any::<u16>() as u64;

    kani::assume(amount > 0);
    kani::assume(amount <= payer.lamports);
    kani::assume(merchant.lamports.checked_add(amount).is_some());

    let request_id: u64 = kani::any::<u16>() as u64;
    let payload_hash: u64 = kani::any::<u16>() as u64;
    let mut seen: Option<(u64, u64)> = None;

    kani::assert(apply_request(request_id, payload_hash, &mut seen), "first request accepted");
    kani::assert(apply_request(request_id, payload_hash, &mut seen), "same duplicate accepted");
    kani::assert(!apply_request(request_id, payload_hash + 1, &mut seen), "conflicting duplicate rejected");

    let mut cpi_log = CpiLog::new();
    settle_payment(&mut payer, &mut merchant, amount, &mut cpi_log);

    assert_cpi_authorized(&cpi_log, &[PAYMENT_PROGRAM]);
    assert_lamport_conservation(&[payer, merchant]);
}
```

## 3) Run locally or in CI

```bash
cargo install --locked kani-verifier
cargo kani setup
cargo kani --harness proof_svm_payment_invariants
```

For a complete x402-style harness, see the external example:

- https://github.com/kamiyo-ai/kamiyo-kani/tree/main/examples/x402-svm-agent-payments-fixed

