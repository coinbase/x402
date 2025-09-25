//! Example demonstrating facilitator discovery API usage
//!
//! This example shows how to use the FacilitatorClient to discover x402 resources,
//! similar to TypeScript's `useFacilitator().list()` and Python's `FacilitatorClient.list()`

use x402::{
    client::DiscoveryFilters, facilitator::FacilitatorClient, types::FacilitatorConfig, Result,
};

#[tokio::main]
async fn main() -> Result<()> {
    println!("🔍 x402 Facilitator Discovery API Example");
    println!("==========================================\n");

    // Create a facilitator client
    let config = FacilitatorConfig::new("https://x402.org/facilitator");
    let client = FacilitatorClient::new(config)?;

    // Example 1: List all discovery resources
    println!("📋 Listing all discovery resources...");
    match client.list_all().await {
        Ok(response) => {
            println!("✅ Found {} resources", response.items.len());
            for (i, resource) in response.items.iter().enumerate() {
                println!("  {}. {} ({})", i + 1, resource.resource, resource.r#type);
            }
            println!(
                "📊 Pagination: {} total, limit: {}, offset: {}",
                response.pagination.total, response.pagination.limit, response.pagination.offset
            );
        }
        Err(e) => {
            println!("❌ Failed to list resources: {}", e);
        }
    }

    println!();

    // Example 2: List resources with filters
    println!("🔍 Listing HTTP resources with pagination...");
    let filters = DiscoveryFilters::new()
        .with_resource_type("http")
        .with_limit(5)
        .with_offset(0);

    match client.list(Some(filters)).await {
        Ok(response) => {
            println!("✅ Found {} HTTP resources", response.items.len());
            for resource in &response.items {
                println!("  • {} - {}", resource.resource, resource.r#type);
                if let Some(metadata) = &resource.metadata {
                    println!("    Metadata: {:?}", metadata);
                }
            }
        }
        Err(e) => {
            println!("❌ Failed to list HTTP resources: {}", e);
        }
    }

    println!();

    // Example 3: List resources by specific type
    println!("🔍 Listing API resources...");
    match client.list_by_type("api").await {
        Ok(response) => {
            println!("✅ Found {} API resources", response.items.len());
            for resource in &response.items {
                println!("  • {} (v{})", resource.resource, resource.x402_version);
                println!("    Last updated: {}", resource.last_updated);
                if !resource.accepts.is_empty() {
                    let schemes: Vec<&str> = resource
                        .accepts
                        .iter()
                        .map(|req| req.scheme.as_str())
                        .collect();
                    println!("    Payment schemes: {}", schemes.join(", "));
                }
            }
        }
        Err(e) => {
            println!("❌ Failed to list API resources: {}", e);
        }
    }

    println!("\n🎉 Discovery API example completed!");

    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[tokio::test]
    async fn test_facilitator_discovery_example() {
        // This test would normally use a mock server
        // For now, we just test that the client can be created
        let config = FacilitatorConfig::new("https://example.com/facilitator");
        let client = FacilitatorClient::new(config);
        assert!(client.is_ok());
    }
}
