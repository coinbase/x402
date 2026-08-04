//! tests/b20_integration_tests.rs

#[tokio::test]
async fn test_b20_compliance_full_flow() {
    let engine = setup_compliance_engine().await;

    let action = Action {
        id: "b20-payment-1".to_string(),
        action_type: "payment_b20".to_string(),
        payload: serde_json::json!({
            "token": "0xB200...",
            "from": "0x...",
            "to": "0x...",
            "amount": "1000000000000000000",
        }),
        metadata: {
            let mut m = HashMap::new();
            m.insert("affects_human_dignity".to_string(), "false".to_string());
            m.insert("auditable".to_string(), "true".to_string());
            m
        },
    };

    let verdict = engine.evaluate_compliance(&action).await.unwrap();
    assert!(verdict.overall);
    assert!(matches!(verdict.ethical, EthicalCompliance::Passed));
    assert!(matches!(verdict.policy, PolicyCompliance::Passed));
}

#[tokio::test]
async fn test_b20_freeze_and_seize() {
    let engine = setup_compliance_engine().await;

    let action = Action {
        id: "freeze-1".to_string(),
        action_type: "freeze_and_seize".to_string(),
        payload: serde_json::json!({
            "token": "0xB200...",
            "target": "0x...",
            "amount": "1000000",
        }),
        metadata: {
            let mut m = HashMap::new();
            m.insert("has_kill_switch".to_string(), "true".to_string());
            m.insert("respects_constitution".to_string(), "true".to_string());
            m
        },
    };

    let verdict = engine.evaluate_compliance(&action).await.unwrap();
    assert!(verdict.overall);
}

#[tokio::test]
async fn test_b20_xrpl_bridge() {
    let bridge = setup_b20_xrpl_bridge().await;

    let payment = B20Payment {
        token: Address::from_str("0xB200...").unwrap(),
        from: Address::from_str("0x...").unwrap(),
        to: Address::from_str("0x...").unwrap(),
        amount: U256::from(1000000000000000000u64),
        memo: None,
    };

    let escrow_id = bridge.b20_to_xrpl_escrow(&payment).await.unwrap();
    assert!(!escrow_id.is_empty());

    // Simula liberação do escrow XRPL
    let release_tx = bridge
        .xrpl_to_b20_release(&escrow_id, payment.to)
        .await
        .unwrap();
    assert!(!release_tx.is_empty());
}
