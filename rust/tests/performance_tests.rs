//! Performance tests for x402

use std::time::Instant;
use x402::{
    types::*,
    client::X402Client,
    facilitator::FacilitatorClient,
};

#[tokio::test]
async fn test_payment_payload_creation_performance() {
    let iterations = 1000;
    let start = Instant::now();
    
    for _ in 0..iterations {
        let authorization = ExactEvmPayloadAuthorization::new(
            "0x857b06519E91e3A54538791bDbb0E22373e36b66",
            "0x209693Bc6afc0C5328bA36FaF03C514EF312287C",
            "1000000",
            "1745323800",
            "1745323985",
            "0xf3746613c2d920b5fdabc0856f2aeb2d4f88ee6037b8cc5d04a71a4462f13480",
        );
        
        let _payload = ExactEvmPayload {
            signature: "0x2d6a7588d6acca505cbf0d9a4a227e0c52c6c34008c8e8986a1283259764173608a2ce6496642e377d6da8dbbf5836e9bd15092f9ecab05ded3d6293af148b571c".to_string(),
            authorization,
        };
    }
    
    let duration = start.elapsed();
    let avg_time = duration.as_nanos() / iterations as u128;
    
    println!("Payment payload creation: {}ns per operation", avg_time);
    assert!(avg_time < 10000); // Should be under 10μs per operation
}

#[tokio::test]
async fn test_payment_requirements_creation_performance() {
    let iterations = 1000;
    let start = Instant::now();
    
    for _ in 0..iterations {
        let _requirements = PaymentRequirements::new(
            "exact",
            "base-sepolia",
            "1000000",
            "0x036CbD53842c5426634e7929541eC2318f3dCF7e",
            "0x209693Bc6afc0C5328bA36FaF03C514EF312287C",
            "https://example.com/test",
            "Test payment",
        );
    }
    
    let duration = start.elapsed();
    let avg_time = duration.as_nanos() / iterations as u128;
    
    println!("Payment requirements creation: {}ns per operation", avg_time);
    assert!(avg_time < 10000); // Should be under 10μs per operation
}

#[tokio::test]
async fn test_base64_encoding_performance() {
    let iterations = 1000;
    let payload = create_test_payment_payload();
    let start = Instant::now();
    
    for _ in 0..iterations {
        let _encoded = payload.to_base64().unwrap();
    }
    
    let duration = start.elapsed();
    let avg_time = duration.as_nanos() / iterations as u128;
    
    println!("Base64 encoding: {}ns per operation", avg_time);
    assert!(avg_time < 1000000); // Should be under 1ms per operation
}

#[tokio::test]
async fn test_base64_decoding_performance() {
    let iterations = 1000;
    let payload = create_test_payment_payload();
    let encoded = payload.to_base64().unwrap();
    let start = Instant::now();
    
    for _ in 0..iterations {
        let _decoded = PaymentPayload::from_base64(&encoded).unwrap();
    }
    
    let duration = start.elapsed();
    let avg_time = duration.as_nanos() / iterations as u128;
    
    println!("Base64 decoding: {}ns per operation", avg_time);
    assert!(avg_time < 1000000); // Should be under 1ms per operation
}

#[tokio::test]
async fn test_client_creation_performance() {
    let iterations = 100;
    let start = Instant::now();
    
    for _ in 0..iterations {
        let _client = X402Client::new().unwrap();
    }
    
    let duration = start.elapsed();
    let avg_time = duration.as_nanos() / iterations as u128;
    
    println!("Client creation: {}ns per operation", avg_time);
    assert!(avg_time < 10000000); // Should be under 10ms per operation
}

#[tokio::test]
async fn test_facilitator_client_creation_performance() {
    let iterations = 100;
    let start = Instant::now();
    
    for _ in 0..iterations {
        let config = x402::types::FacilitatorConfig::new("https://api.example.com");
        let _facilitator = FacilitatorClient::new(config).unwrap();
    }
    
    let duration = start.elapsed();
    let avg_time = duration.as_nanos() / iterations as u128;
    
    println!("Facilitator client creation: {}ns per operation", avg_time);
    assert!(avg_time < 10000000); // Should be under 10ms per operation
}

#[tokio::test]
async fn test_serialization_performance() {
    let iterations = 1000;
    let payload = create_test_payment_payload();
    let start = Instant::now();
    
    for _ in 0..iterations {
        let _json = serde_json::to_string(&payload).unwrap();
    }
    
    let duration = start.elapsed();
    let avg_time = duration.as_nanos() / iterations as u128;
    
    println!("JSON serialization: {}ns per operation", avg_time);
    assert!(avg_time < 100000); // Should be under 100μs per operation
}

#[tokio::test]
async fn test_deserialization_performance() {
    let iterations = 1000;
    let payload = create_test_payment_payload();
    let json = serde_json::to_string(&payload).unwrap();
    let start = Instant::now();
    
    for _ in 0..iterations {
        let _decoded: PaymentPayload = serde_json::from_str(&json).unwrap();
    }
    
    let duration = start.elapsed();
    let avg_time = duration.as_nanos() / iterations as u128;
    
    println!("JSON deserialization: {}ns per operation", avg_time);
    assert!(avg_time < 100000); // Should be under 100μs per operation
}

#[tokio::test]
async fn test_concurrent_operations() {
    use tokio::task;
    
    let iterations = 100;
    let concurrency = 10;
    
    let start = Instant::now();
    
    let handles: Vec<_> = (0..concurrency)
        .map(|_| {
            task::spawn(async move {
                for _ in 0..iterations {
                    let payload = create_test_payment_payload();
                    let _encoded = payload.to_base64().unwrap();
                    let _decoded = PaymentPayload::from_base64(&_encoded).unwrap();
                }
            })
        })
        .collect();
    
    for handle in handles {
        handle.await.unwrap();
    }
    
    let duration = start.elapsed();
    let total_operations = iterations * concurrency;
    let avg_time = duration.as_nanos() / total_operations as u128;
    
    println!("Concurrent operations: {}ns per operation", avg_time);
    assert!(avg_time < 1000000); // Should be under 1ms per operation
}

fn create_test_payment_payload() -> PaymentPayload {
    let authorization = ExactEvmPayloadAuthorization::new(
        "0x857b06519E91e3A54538791bDbb0E22373e36b66",
        "0x209693Bc6afc0C5328bA36FaF03C514EF312287C",
        "1000000",
        "1745323800",
        "1745323985",
        "0xf3746613c2d920b5fdabc0856f2aeb2d4f88ee6037b8cc5d04a71a4462f13480",
    );

    let payload = ExactEvmPayload {
        signature: "0x2d6a7588d6acca505cbf0d9a4a227e0c52c6c34008c8e8986a1283259764173608a2ce6496642e377d6da8dbbf5836e9bd15092f9ecab05ded3d6293af148b571c".to_string(),
        authorization,
    };

    PaymentPayload::new("exact", "base-sepolia", payload)
}
