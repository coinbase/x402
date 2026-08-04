use cathedral_inference_runtime::{CathedralRuntime, GenerateRequest, VerificationLevel};
use cathedral_identity::SignatureGuard;

#[tokio::test]
async fn test_e2e_l0() {
    let runtime = CathedralRuntime::new().await;
    let guard = SignatureGuard::new();
    let did = "did:cathedral:agent:test-l0";
    let prompt = "O que é 2+2?";

    let signature = guard.sign(prompt.as_bytes());
    let req = GenerateRequest {
        prompt: prompt.to_string(),
        did: did.to_string(),
        signature,
        level: VerificationLevel::L0,
        context: None,
    };

    let resp = runtime.generate(req).await.unwrap();
    assert!(!resp.text.is_empty());
    assert!(resp.thinking.is_none());
    assert!(resp.zk_proof.is_none());
    assert!(!resp.signature.is_empty());
    assert!(!resp.attestation.is_empty());
    assert!(resp.latency_ms > 0);
    assert!(resp.reputation > 0.0);
    assert!(!resp.tier.is_empty());
    println!("L0 passou");
}

#[tokio::test]
async fn test_e2e_l1() {
    let runtime = CathedralRuntime::new().await;
    let did = "did:cathedral:agent:test-l1";
    let prompt = "Explique o teorema de Pitágoras.";

    let req = GenerateRequest {
        prompt: prompt.to_string(),
        did: did.to_string(),
        signature: vec![0u8; 64],
        level: VerificationLevel::L1,
        context: None,
    };

    let resp = runtime.generate(req).await.unwrap();
    assert!(resp.thinking.is_some());
    assert!(resp.zk_proof.is_some());
    let proof = resp.zk_proof.unwrap();
    assert_eq!(proof.proof_type, "NANOZK-sim");
    assert!(resp.latency_ms < 600);
    println!("L1 passou (latência {}ms)", resp.latency_ms);
}

#[tokio::test]
async fn test_e2e_l2() {
    let runtime = CathedralRuntime::new().await;
    let did = "did:cathedral:agent:test-l2";
    let prompt = "Prove que existem infinitos primos.";

    let req = GenerateRequest {
        prompt: prompt.to_string(),
        did: did.to_string(),
        signature: vec![0u8; 64],
        level: VerificationLevel::L2,
        context: None,
    };

    let resp = runtime.generate(req).await.unwrap();
    assert!(resp.thinking.is_some());
    assert!(resp.zk_proof.is_some());
    let proof = resp.zk_proof.unwrap();
    assert_eq!(proof.proof_type, "DeepProve-sim");
    assert!(resp.latency_ms > 500 && resp.latency_ms < 750);
    println!("L2 passou (latência {}ms)", resp.latency_ms);
}

#[tokio::test]
async fn test_memory_persistence() {
    let runtime = CathedralRuntime::new().await;
    let did = "did:cathedral:agent:test-mem";
    let prompt1 = "Meu nome é João.";

    let req1 = GenerateRequest {
        prompt: prompt1.to_string(),
        did: did.to_string(),
        signature: vec![0u8; 64],
        level: VerificationLevel::L0,
        context: None,
    };
    let _ = runtime.generate(req1).await.unwrap();

    let req2 = GenerateRequest {
        prompt: "Qual é o meu nome?".to_string(),
        did: did.to_string(),
        signature: vec![0u8; 64],
        level: VerificationLevel::L0,
        context: None,
    };
    let resp2 = runtime.generate(req2).await.unwrap();
    assert!(resp2.text.contains("João") || resp2.thinking.as_ref().map_or(false, |t| t.contains("João")));
    println!("Memória persistente passou");
}

#[tokio::test]
async fn test_search_similar() {
    let runtime = CathedralRuntime::new().await;
    let did = "did:cathedral:agent:test-search";

    for content in &["gosto de café", "prefiro chá", "não gosto de leite"] {
        let req = GenerateRequest {
            prompt: content.to_string(),
            did: did.to_string(),
            signature: vec![0u8; 64],
            level: VerificationLevel::L0,
            context: None,
        };
        let _ = runtime.generate(req).await.unwrap();
    }

    let results = runtime.wormgraph.search_similar(did, "café", 3).await.unwrap();
    assert!(!results.is_empty());
    assert!(results.iter().any(|e| e.content.contains("café")));
    println!("Busca por similaridade passou");
}

#[tokio::test]
async fn test_delegation_router() {
    let runtime = CathedralRuntime::new().await;
    let did_high = "did:cathedral:agent:alpha";
    let did_low = "did:cathedral:agent:delta";

    let req_high = GenerateRequest {
        prompt: "Teste".to_string(),
        did: did_high.to_string(),
        signature: vec![0u8; 64],
        level: VerificationLevel::L0,
        context: None,
    };
    let resp_high = runtime.generate(req_high).await.unwrap();
    assert_eq!(resp_high.tier, "Pro");

    let req_low = GenerateRequest {
        prompt: "Teste".to_string(),
        did: did_low.to_string(),
        signature: vec![0u8; 64],
        level: VerificationLevel::L0,
        context: None,
    };
    let resp_low = runtime.generate(req_low).await.unwrap();
    assert_eq!(resp_low.tier, "Lite");
    println!("DelegationRouter passou");
}
