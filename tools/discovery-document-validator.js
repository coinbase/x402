#!/usr/bin/env node

/**
 * x402 Discovery Document Validator
 * 
 * Validates x402 discovery documents against the v2 specification.
 * Supports validation from URL, file path, or stdin.
 * 
 * Usage:
 *   node discovery-document-validator.js https://api.example.com/.well-known/x402
 *   node discovery-document-validator.js ./discovery.json
 *   cat discovery.json | node discovery-document-validator.js
 * 
 * Exit codes:
 *   0: Valid document
 *   1: Invalid document or validation errors
 *   2: Network/file errors
 */

const https = require('https');
const http = require('http');
const fs = require('fs');
const path = require('path');

class DiscoveryValidator {
  constructor() {
    this.errors = [];
    this.warnings = [];
  }

  /**
   * Validates a discovery document
   * @param {object} doc - The discovery document to validate
   * @returns {boolean} - True if valid, false if invalid
   */
  validate(doc) {
    this.errors = [];
    this.warnings = [];

    if (!doc || typeof doc !== 'object') {
      this.errors.push('Document must be a valid JSON object');
      return false;
    }

    // Required fields
    this.validateRequired(doc, 'version', 'string');
    this.validateRequired(doc, 'metadata', 'object');
    this.validateRequired(doc, 'resources', 'array');

    if (this.errors.length > 0) {
      return false;
    }

    // Validate version
    this.validateVersion(doc.version);

    // Validate metadata
    this.validateMetadata(doc.metadata);

    // Validate resources
    this.validateResources(doc.resources);

    // Validate optional bazaar extensions
    if (doc.bazaar) {
      this.validateBazaarExtensions(doc.bazaar);
    }

    return this.errors.length === 0;
  }

  validateRequired(obj, field, type) {
    if (!(field in obj)) {
      this.errors.push(`Missing required field: ${field}`);
      return false;
    }

    const actualType = Array.isArray(obj[field]) ? 'array' : typeof obj[field];
    if (actualType !== type) {
      this.errors.push(`Field '${field}' must be of type ${type}, got ${actualType}`);
      return false;
    }

    return true;
  }

  validateVersion(version) {
    const supportedVersions = ['2.0.0', '2'];
    if (!supportedVersions.includes(version)) {
      this.errors.push(`Unsupported version: ${version}. Supported versions: ${supportedVersions.join(', ')}`);
    }
  }

  validateMetadata(metadata) {
    // Required metadata fields
    this.validateRequired(metadata, 'name', 'string');
    
    // Optional but recommended fields
    const recommendedFields = ['description', 'maintainer', 'homepage', 'documentation'];
    recommendedFields.forEach(field => {
      if (!(field in metadata)) {
        this.warnings.push(`Recommended metadata field missing: ${field}`);
      }
    });

    // Validate maintainer if present
    if (metadata.maintainer && typeof metadata.maintainer === 'object') {
      if (!metadata.maintainer.name) {
        this.warnings.push('Maintainer should include name');
      }
      if (metadata.maintainer.email && !this.isValidEmail(metadata.maintainer.email)) {
        this.errors.push('Invalid maintainer email format');
      }
    }

    // Validate URLs if present
    const urlFields = ['homepage', 'documentation'];
    urlFields.forEach(field => {
      if (metadata[field] && !this.isValidUrl(metadata[field])) {
        this.errors.push(`Invalid URL format for ${field}: ${metadata[field]}`);
      }
    });
  }

  validateResources(resources) {
    if (resources.length === 0) {
      this.warnings.push('No resources defined - discovery document should contain at least one resource');
      return;
    }

    resources.forEach((resource, index) => {
      this.validateResource(resource, `resources[${index}]`);
    });
  }

  validateResource(resource, path) {
    // Required resource fields
    this.validateRequired(resource, 'resource', 'string');
    this.validateRequired(resource, 'accepts', 'array');

    if (!('resource' in resource) || !('accepts' in resource)) {
      return; // Skip further validation if required fields missing
    }

    // Validate resource path
    if (!resource.resource.startsWith('/')) {
      this.errors.push(`${path}.resource must start with '/' (got: ${resource.resource})`);
    }

    // Validate accepts array
    if (resource.accepts.length === 0) {
      this.errors.push(`${path}.accepts must contain at least one payment method`);
      return;
    }

    resource.accepts.forEach((payment, paymentIndex) => {
      this.validatePaymentMethod(payment, `${path}.accepts[${paymentIndex}]`);
    });

    // Validate optional fields
    if (resource.description && typeof resource.description !== 'string') {
      this.errors.push(`${path}.description must be a string`);
    }

    if (resource.schema) {
      this.validateResourceSchema(resource.schema, `${path}.schema`);
    }
  }

  validatePaymentMethod(payment, path) {
    // Required payment fields
    this.validateRequired(payment, 'scheme', 'string');
    this.validateRequired(payment, 'network', 'string');
    this.validateRequired(payment, 'asset', 'string');
    this.validateRequired(payment, 'maxAmountRequired', 'string');

    // Validate scheme
    const supportedSchemes = ['exact', 'permit2', 'upto'];
    if (payment.scheme && !supportedSchemes.includes(payment.scheme)) {
      this.warnings.push(`${path}.scheme '${payment.scheme}' is not a standard scheme. Supported: ${supportedSchemes.join(', ')}`);
    }

    // Validate network format (CAIP-2)
    if (payment.network && !this.isValidCaip2Network(payment.network)) {
      this.errors.push(`${path}.network must be in CAIP-2 format (namespace:reference), got: ${payment.network}`);
    }

    // Validate asset address format
    if (payment.asset && payment.network) {
      this.validateAssetAddress(payment.asset, payment.network, path);
    }

    // Validate maxAmountRequired format
    if (payment.maxAmountRequired && !this.isValidAmountString(payment.maxAmountRequired)) {
      this.errors.push(`${path}.maxAmountRequired must be a valid decimal string, got: ${payment.maxAmountRequired}`);
    }

    // Validate optional fields
    if (payment.maxTimeoutSeconds !== undefined) {
      if (typeof payment.maxTimeoutSeconds !== 'number' || payment.maxTimeoutSeconds <= 0) {
        this.errors.push(`${path}.maxTimeoutSeconds must be a positive number`);
      }
    }
  }

  validateResourceSchema(schema, path) {
    if (typeof schema !== 'object') {
      this.errors.push(`${path} must be an object`);
      return;
    }

    // Validate input schema
    if (schema.input) {
      if (typeof schema.input !== 'object') {
        this.errors.push(`${path}.input must be an object`);
      } else {
        // Check for common input schema fields
        if (schema.input.type && typeof schema.input.type !== 'string') {
          this.errors.push(`${path}.input.type must be a string`);
        }
      }
    }

    // Validate output schema
    if (schema.output) {
      if (typeof schema.output !== 'object') {
        this.errors.push(`${path}.output must be an object`);
      }
    }
  }

  validateBazaarExtensions(bazaar, path = 'bazaar') {
    if (typeof bazaar !== 'object') {
      this.errors.push(`${path} must be an object`);
      return;
    }

    // Validate category
    if (bazaar.category) {
      const validCategories = [
        'ai-ml', 'analytics', 'communication', 'data', 'defi', 'developer-tools',
        'entertainment', 'finance', 'gaming', 'infrastructure', 'media', 'nft',
        'productivity', 'security', 'social', 'storage', 'trading', 'utilities'
      ];
      
      if (!validCategories.includes(bazaar.category)) {
        this.warnings.push(`${path}.category '${bazaar.category}' is not a standard category. Consider using one of: ${validCategories.join(', ')}`);
      }
    }

    // Validate tags
    if (bazaar.tags) {
      if (!Array.isArray(bazaar.tags)) {
        this.errors.push(`${path}.tags must be an array`);
      } else {
        bazaar.tags.forEach((tag, index) => {
          if (typeof tag !== 'string') {
            this.errors.push(`${path}.tags[${index}] must be a string`);
          }
        });
      }
    }

    // Validate pricing info
    if (bazaar.pricing) {
      this.validatePricingInfo(bazaar.pricing, `${path}.pricing`);
    }

    // Validate contact info
    if (bazaar.contact) {
      this.validateContactInfo(bazaar.contact, `${path}.contact`);
    }
  }

  validatePricingInfo(pricing, path) {
    if (typeof pricing !== 'object') {
      this.errors.push(`${path} must be an object`);
      return;
    }

    // Validate pricing model
    if (pricing.model) {
      const validModels = ['pay-per-request', 'subscription', 'freemium', 'free'];
      if (!validModels.includes(pricing.model)) {
        this.warnings.push(`${path}.model '${pricing.model}' is not standard. Consider: ${validModels.join(', ')}`);
      }
    }

    // Validate price range
    if (pricing.range) {
      if (typeof pricing.range !== 'object') {
        this.errors.push(`${path}.range must be an object`);
      } else {
        ['min', 'max'].forEach(field => {
          if (pricing.range[field] && !this.isValidAmountString(pricing.range[field])) {
            this.errors.push(`${path}.range.${field} must be a valid decimal string`);
          }
        });
      }
    }
  }

  validateContactInfo(contact, path) {
    if (typeof contact !== 'object') {
      this.errors.push(`${path} must be an object`);
      return;
    }

    if (contact.email && !this.isValidEmail(contact.email)) {
      this.errors.push(`${path}.email has invalid format`);
    }

    if (contact.url && !this.isValidUrl(contact.url)) {
      this.errors.push(`${path}.url has invalid format`);
    }
  }

  // Utility validation methods
  isValidEmail(email) {
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return emailRegex.test(email);
  }

  isValidUrl(url) {
    try {
      new URL(url);
      return true;
    } catch {
      return false;
    }
  }

  isValidCaip2Network(network) {
    const caip2Regex = /^[a-z0-9-]{1,32}:[a-zA-Z0-9-]{1,64}$/;
    return caip2Regex.test(network);
  }

  isValidAmountString(amount) {
    const amountRegex = /^\d+(\.\d+)?$/;
    return amountRegex.test(amount) && !isNaN(parseFloat(amount));
  }

  validateAssetAddress(asset, network, path) {
    const [namespace] = network.split(':');
    
    switch (namespace) {
      case 'eip155': // Ethereum-like chains
        if (!this.isValidEthereumAddress(asset)) {
          this.errors.push(`${path}.asset invalid Ethereum address format: ${asset}`);
        }
        break;
      case 'solana':
        if (!this.isValidSolanaAddress(asset)) {
          this.errors.push(`${path}.asset invalid Solana address format: ${asset}`);
        }
        break;
      case 'stellar':
        if (!this.isValidStellarAddress(asset)) {
          this.errors.push(`${path}.asset invalid Stellar address format: ${asset}`);
        }
        break;
      default:
        this.warnings.push(`${path}.asset format cannot be validated for network namespace: ${namespace}`);
    }
  }

  isValidEthereumAddress(address) {
    return /^0x[a-fA-F0-9]{40}$/.test(address);
  }

  isValidSolanaAddress(address) {
    // Solana addresses are base58 encoded, typically 32-44 characters
    return /^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(address);
  }

  isValidStellarAddress(address) {
    // Stellar addresses start with G and are 56 characters
    return /^G[A-Z0-9]{55}$/.test(address);
  }

  getResults() {
    return {
      valid: this.errors.length === 0,
      errors: this.errors,
      warnings: this.warnings
    };
  }
}

// CLI functionality
async function loadDocument(source) {
  if (!source || source === '-') {
    // Read from stdin
    return new Promise((resolve, reject) => {
      let data = '';
      process.stdin.setEncoding('utf8');
      process.stdin.on('readable', () => {
        const chunk = process.stdin.read();
        if (chunk !== null) data += chunk;
      });
      process.stdin.on('end', () => {
        try {
          resolve(JSON.parse(data));
        } catch (e) {
          reject(new Error(`Invalid JSON: ${e.message}`));
        }
      });
      process.stdin.on('error', reject);
    });
  } else if (source.startsWith('http://') || source.startsWith('https://')) {
    // Fetch from URL
    return new Promise((resolve, reject) => {
      const client = source.startsWith('https://') ? https : http;
      const request = client.get(source, (response) => {
        if (response.statusCode !== 200) {
          reject(new Error(`HTTP ${response.statusCode}: ${response.statusMessage}`));
          return;
        }

        let data = '';
        response.setEncoding('utf8');
        response.on('data', chunk => data += chunk);
        response.on('end', () => {
          try {
            resolve(JSON.parse(data));
          } catch (e) {
            reject(new Error(`Invalid JSON: ${e.message}`));
          }
        });
      });

      request.on('error', reject);
      request.setTimeout(10000, () => {
        request.destroy();
        reject(new Error('Request timeout'));
      });
    });
  } else {
    // Read from file
    return new Promise((resolve, reject) => {
      fs.readFile(source, 'utf8', (err, data) => {
        if (err) {
          reject(new Error(`File error: ${err.message}`));
          return;
        }
        try {
          resolve(JSON.parse(data));
        } catch (e) {
          reject(new Error(`Invalid JSON: ${e.message}`));
        }
      });
    });
  }
}

function printResults(results, source) {
  console.log(`\n=== x402 Discovery Document Validation Results ===`);
  if (source) {
    console.log(`Source: ${source}`);
  }
  console.log(`Status: ${results.valid ? '✅ VALID' : '❌ INVALID'}\n`);

  if (results.errors.length > 0) {
    console.log('🚨 ERRORS:');
    results.errors.forEach(error => console.log(`  • ${error}`));
    console.log();
  }

  if (results.warnings.length > 0) {
    console.log('⚠️  WARNINGS:');
    results.warnings.forEach(warning => console.log(`  • ${warning}`));
    console.log();
  }

  if (results.valid && results.warnings.length === 0) {
    console.log('🎉 Perfect! No issues found.');
  }
}

function showUsage() {
  console.log(`
x402 Discovery Document Validator

Usage:
  ${path.basename(__filename)} [source]
  
Source can be:
  - URL: https://api.example.com/.well-known/x402
  - File path: ./discovery.json
  - Stdin: (no argument or -)

Examples:
  ${path.basename(__filename)} https://api.example.com/.well-known/x402
  ${path.basename(__filename)} ./discovery.json
  cat discovery.json | ${path.basename(__filename)}

Exit codes:
  0: Valid document
  1: Invalid document or validation errors  
  2: Network/file errors
`);
}

async function main() {
  const args = process.argv.slice(2);
  
  if (args.includes('--help') || args.includes('-h')) {
    showUsage();
    process.exit(0);
  }

  const source = args[0];
  
  try {
    console.log('Loading discovery document...');
    const document = await loadDocument(source);
    
    console.log('Validating document...');
    const validator = new DiscoveryValidator();
    validator.validate(document);
    
    const results = validator.getResults();
    printResults(results, source);
    
    process.exit(results.valid ? 0 : 1);
  } catch (error) {
    console.error(`\n❌ Error: ${error.message}`);
    process.exit(2);
  }
}

// Export for testing
if (require.main === module) {
  main().catch(console.error);
} else {
  module.exports = { DiscoveryValidator };
}