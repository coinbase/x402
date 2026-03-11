# x402 Tools

Collection of utilities for working with the x402 protocol.

## Discovery Document Validator

Validates x402 discovery documents against the v2 specification with comprehensive error checking and helpful warnings.

### Usage

```bash
# Validate from URL
node discovery-document-validator.js https://api.example.com/.well-known/x402

# Validate from file
node discovery-document-validator.js ./discovery.json

# Validate from stdin
cat discovery.json | node discovery-document-validator.js
```

### Features

- **Comprehensive Validation**: Checks all required and optional fields per x402 v2 spec
- **Network-Specific Asset Validation**: Validates asset addresses for Ethereum, Solana, and Stellar networks
- **CAIP-2 Network Format**: Ensures network identifiers follow the correct format
- **Bazaar Extension Support**: Validates bazaar discovery extensions for ecosystem compatibility
- **Developer-Friendly Output**: Clear error messages with field paths and suggested fixes
- **Multiple Input Sources**: Supports URL, file, and stdin input
- **CI/CD Ready**: Exit codes for automated validation workflows

### Validation Scope

#### Core Discovery Document
- ✅ Version compatibility (v2.0.0 support)
- ✅ Required metadata fields
- ✅ Resource configuration validation
- ✅ Payment method validation
- ✅ Schema structure validation

#### Network & Asset Validation
- ✅ CAIP-2 network identifier format
- ✅ Ethereum address validation (0x format)
- ✅ Solana address validation (base58 format)  
- ✅ Stellar address validation (G prefix format)
- ✅ Amount string format validation

#### Bazaar Extensions
- ✅ Category validation against standard categories
- ✅ Tag structure validation
- ✅ Pricing information validation
- ✅ Contact information validation
- ✅ Schema compliance checking

### Exit Codes

- `0`: Valid document with no errors
- `1`: Invalid document with validation errors
- `2`: Network, file, or parsing errors

### Example Output

```
=== x402 Discovery Document Validation Results ===
Source: https://api.example.com/.well-known/x402
Status: ✅ VALID

⚠️  WARNINGS:
  • Recommended metadata field missing: description
  • bazaar.category 'custom-ai' is not a standard category. Consider using one of: ai-ml, analytics, communication, data, defi, developer-tools, entertainment, finance, gaming, infrastructure, media, nft, productivity, security, social, storage, trading, utilities
```

### Testing

Test the validator with the included example:

```bash
node discovery-document-validator.js test-discovery.json
```

This should show a valid result with comprehensive validation coverage.

## Adding More Tools

When adding new tools to this directory:

1. **Create executable scripts** with proper shebang lines
2. **Add comprehensive documentation** in this README
3. **Include example usage** and test files where applicable
4. **Follow consistent CLI patterns** with help flags and exit codes
5. **Export functions** for testing when the script can be required as a module

### Tool Development Guidelines

- **Error Handling**: Provide clear, actionable error messages
- **Input Flexibility**: Support multiple input methods (file, URL, stdin) where appropriate
- **Output Consistency**: Use consistent formatting and colors for status indicators
- **Testing**: Include test files and validate against real-world examples
- **Documentation**: Document all CLI options, exit codes, and usage patterns