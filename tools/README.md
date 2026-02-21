# x402 Tools

Utility tools for x402 development and ecosystem management.

## Discovery Validator

The discovery validator helps developers ensure their x402 discovery documents are properly formatted and compliant with the x402 v2 specification.

### Usage

```bash
# Validate from URL
node discovery-validator.js https://api.example.com/.well-known/x402

# Validate from file
node discovery-validator.js --file ./discovery.json

# Validate from stdin
echo '{"x402Version":"2","discoveryDocument":{"resources":{}}}' | node discovery-validator.js --stdin

# Show help
node discovery-validator.js --help
```

### What it validates

**Required Structure**:
- ✅ Root `x402Version` field
- ✅ `discoveryDocument.resources` object
- ✅ Required fields in each payment acceptance (`scheme`, `network`, `amount`, `asset`, `payTo`)

**Format Validation**:
- ✅ Network format (CAIP-2: `eip155:8453`, `solana:5eykt4UsFv8P8NJdTREpY1vzqKqZKvdp`)
- ✅ Asset addresses (Ethereum `0x...` or Solana Base58)
- ✅ Amount format (decimal string: `"1000000"`)
- ✅ Timeout values (positive numbers, warns if > 1 hour)

**Known Assets & Networks**:
- ✅ Validates against known asset addresses
- ✅ Checks network/asset compatibility
- ✅ Warns about unknown schemes or networks

### Example Output

```
📍 Validating: https://api.example.com/.well-known/x402

❌ Discovery document has errors

🚨 Errors (2):
  • discoveryDocument.resources["/weather"].accepts[0].network: Network must use CAIP-2 format (e.g., "eip155:8453")
  • discoveryDocument.resources["/weather"].accepts[0].asset: Asset must be a valid Ethereum (0x...) or Solana address

⚠️  Warnings (1):
  • discoveryDocument.resources["/weather"].accepts[0].maxTimeoutSeconds: Timeout over 1 hour may cause poor user experience
```

### Integration with CI/CD

The validator returns appropriate exit codes:
- Exit code `0`: Valid document (warnings are OK)
- Exit code `1`: Invalid document or errors

```bash
# In your CI pipeline
if node tools/discovery-validator.js https://your-api.com/.well-known/x402; then
  echo "✅ Discovery document is valid"
else
  echo "❌ Discovery document validation failed"
  exit 1
fi
```

### Common Issues Fixed

1. **Network Format**: Ensures CAIP-2 format (`eip155:8453` not `8453`)
2. **Asset Compatibility**: Catches wrong asset addresses for networks
3. **Amount Format**: Ensures amounts are decimal strings, not numbers
4. **Address Validation**: Validates Ethereum and Solana address formats
5. **Missing Fields**: Identifies required fields missing from accepts array
6. **Type Errors**: Catches when fields have wrong types (string vs object)

This tool addresses common configuration issues seen in GitHub issues and ecosystem submissions.