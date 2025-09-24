# x402 Rust Development Rules

## Import Guidelines

### 1. Strict Import Policy (Python-style)

**MANDATORY**: Follow strict import guidelines similar to Python's import standards:

- ❌ **NEVER** use wildcard imports: `use xxx::*;`
- ✅ **ALWAYS** use explicit imports: `use xxx::{Item1, Item2, Item3};`
- ✅ **ONE import per line** for better readability and maintenance

#### Examples:

```rust
// ❌ WRONG - Wildcard import
use std::collections::*;

// ❌ WRONG - Multiple items on one line
use std::collections::{HashMap, HashSet, VecDeque};

// ✅ CORRECT - Explicit imports, one per line
use std::collections::HashMap;
use std::collections::HashSet;
use std::collections::VecDeque;

// ✅ CORRECT - Multiple items from same module (acceptable for small lists)
use std::collections::{
    HashMap,
    HashSet,
    VecDeque,
};
```

### 2. Template System Rules

**STRICT REQUIREMENTS**: Template system must follow these guidelines:

#### Template Organization:
- ✅ **ALWAYS** keep HTML templates in separate `.html` files
- ✅ **ALWAYS** use `include_str!` macro to embed templates
- ✅ **ALWAYS** use type-safe configuration injection
- ✅ **ALWAYS** validate configuration data before injection

#### Configuration Management:
- ✅ **ALWAYS** use `PaywallConfig` struct for configuration
- ✅ **ALWAYS** provide sensible defaults for missing configuration
- ✅ **ALWAYS** use `window.x402` global variable for client-side config

### 3. Error Handling Standards

**COMPREHENSIVE ERROR HANDLING**: Use the custom error system:

#### Error Types:
- ✅ **ALWAYS** use `X402Error` enum for all errors
- ✅ **ALWAYS** use `thiserror` for error derivation
- ✅ **ALWAYS** provide meaningful error messages
- ✅ **ALWAYS** handle network errors gracefully

#### Examples:

```rust
// ✅ CORRECT - Using custom error types
use crate::error::{X402Error, Result};

fn process_payment(data: &str) -> Result<PaymentPayload> {
    let payload: PaymentPayload = serde_json::from_str(data)
        .map_err(|e| X402Error::InvalidPaymentPayload { 
            message: format!("Failed to parse payment data: {}", e) 
        })?;
    Ok(payload)
}
```

### 4. Template Configuration Rules

**TYPE-SAFE CONFIGURATION**: Template configuration must be type-safe:

#### Configuration Builder:
```rust
// ✅ CORRECT - Using configuration builder
let config = PaywallConfig::new()
    .with_app_name("My App")
    .with_app_logo("🚀")
    .with_cdp_client_key("key-here");

// ❌ WRONG - Direct struct construction
let config = PaywallConfig {
    app_name: Some("My App".to_string()),
    // ... other fields
};
```

### 5. Testing Standards

**COMPREHENSIVE TESTING**: All code must be thoroughly tested:

#### Test Requirements:
- ✅ **ALWAYS** write unit tests for all public functions
- ✅ **ALWAYS** test both success and error cases
- ✅ **ALWAYS** test template generation with various configurations
- ✅ **ALWAYS** run `cargo test --all-features` before committing

#### Test Examples:

```rust
#[cfg(test)]
mod tests {
    use super::*;
    use crate::template::{PaywallConfig, generate_paywall_html};
    use crate::types::PaymentRequirements;

    #[test]
    fn test_template_generation() {
        let requirements = PaymentRequirements {
            scheme: "exact".to_string(),
            network: "base-sepolia".to_string(),
            // ... other fields
        };
        
        let config = PaywallConfig::new()
            .with_app_name("Test App");
            
        let html = generate_paywall_html(
            "Test error",
            &[requirements],
            Some(&config),
        );
        
        assert!(html.contains("Test App"));
        assert!(html.contains("window.x402"));
    }
}
```

### 6. Module Organization

#### Library Structure:
- `src/lib.rs` - Main library entry point
- `src/template/` - HTML template system
- `src/client/` - HTTP client implementation
- `src/middleware/` - Web framework middleware
- `src/types/` - Core type definitions
- `src/error/` - Error handling
- `examples/` - Usage examples

#### Public API:
- ✅ **ALWAYS** re-export types through `pub use` in module `mod.rs`
- ✅ **ALWAYS** use explicit re-exports, never wildcard re-exports

### 7. Code Quality Standards

#### Compilation:
- ✅ **ALWAYS** ensure `cargo check` passes without errors
- ✅ **ALWAYS** fix all warnings before committing
- ✅ **ALWAYS** run `cargo fmt` and `cargo clippy` before committing
- ✅ **ALWAYS** run tests before committing

#### Documentation:
- ✅ **ALWAYS** document public APIs with `///` comments
- ✅ **ALWAYS** include examples in documentation when appropriate
- ✅ **ALWAYS** document template configuration options

## Enforcement

These rules are enforced through:
1. Code review process
2. Automated linting with `cargo clippy`
3. Code formatting with `cargo fmt`
4. Manual verification during development

## Violations

Violations of these rules will result in:
1. Immediate code review rejection
2. Required fixes before merge
3. Documentation of violations for team learning

---

**Remember**: These rules ensure code maintainability, type safety, and consistency across the x402 project.
