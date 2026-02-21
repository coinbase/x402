#!/usr/bin/env node
/**
 * x402 Discovery Document Validator
 * 
 * Validates x402 discovery documents for common issues and ensures compliance
 * with the x402 v2 specification.
 * 
 * Usage:
 *   node discovery-validator.js <url>
 *   node discovery-validator.js --file <path>
 *   echo '{"discoveryDocument": {...}}' | node discovery-validator.js --stdin
 */

const https = require('https');
const http = require('http');
const fs = require('fs');
const path = require('path');
const { URL } = require('url');

// Known asset addresses for validation
const KNOWN_ASSETS = {
  // Base mainnet (eip155:8453)
  '0x833589fcd6edb6e08f4c7c32d4f71b54bda02913': { name: 'USDC', decimals: 6, network: 'eip155:8453' },
  '0x4200000000000000000000000000000000000006': { name: 'WETH', decimals: 18, network: 'eip155:8453' },
  // Solana mainnet
  'epjfwdd5aufqssqem2qn1xzybapC8G4wEGGkZwyTDt1v': { name: 'USDC', decimals: 6, network: 'solana:5eykt4UsFv8P8NJdTREpY1vzqKqZKvdp' }
};

const VALID_NETWORKS = [
  'eip155:1',     // Ethereum mainnet
  'eip155:8453',  // Base mainnet
  'eip155:84532', // Base testnet
  'solana:5eykt4UsFv8P8NJdTREpY1vzqKqZKvdp', // Solana mainnet
  'solana:EtWTRABZaYq6iMfeYKouRu166VU2xqa1wcaWoxPkrZBG' // Solana devnet
];

const VALID_SCHEMES = ['exact', 'sepa', 'zk-relay'];

class ValidationError extends Error {
  constructor(path, message, severity = 'error') {
    super(`${path}: ${message}`);
    this.path = path;
    this.severity = severity;
  }
}

class DiscoveryValidator {
  constructor() {
    this.errors = [];
    this.warnings = [];
  }

  addError(path, message) {
    this.errors.push(new ValidationError(path, message, 'error'));
  }

  addWarning(path, message) {
    this.warnings.push(new ValidationError(path, message, 'warning'));
  }

  validate(document) {
    this.errors = [];
    this.warnings = [];

    try {
      this.validateRootStructure(document);
      this.validateDiscoveryDocument(document.discoveryDocument);
      return {
        valid: this.errors.length === 0,
        errors: this.errors.map(e => ({ path: e.path, message: e.message, severity: e.severity })),
        warnings: this.warnings.map(w => ({ path: w.path, message: w.message, severity: w.severity }))
      };
    } catch (error) {
      return {
        valid: false,
        errors: [{ path: 'root', message: `Validation failed: ${error.message}`, severity: 'error' }],
        warnings: []
      };
    }
  }

  validateRootStructure(doc) {
    if (typeof doc !== 'object' || doc === null) {
      this.addError('root', 'Document must be a JSON object');
      return;
    }

    // Required fields
    if (!doc.x402Version) {
      this.addError('x402Version', 'Missing required field');
    } else if (doc.x402Version !== '2' && doc.x402Version !== 2) {
      this.addWarning('x402Version', 'Should be "2" for current specification');
    }

    if (!doc.discoveryDocument) {
      this.addError('discoveryDocument', 'Missing required field');
      return;
    }

    if (typeof doc.discoveryDocument !== 'object') {
      this.addError('discoveryDocument', 'Must be an object');
    }
  }

  validateDiscoveryDocument(discoveryDoc) {
    if (!discoveryDoc) return;

    if (!discoveryDoc.resources) {
      this.addError('discoveryDocument.resources', 'Missing required field');
      return;
    }

    if (typeof discoveryDoc.resources !== 'object') {
      this.addError('discoveryDocument.resources', 'Must be an object');
      return;
    }

    // Validate each resource
    Object.entries(discoveryDoc.resources).forEach(([path, resource]) => {
      this.validateResource(path, resource, `discoveryDocument.resources["${path}"]`);
    });
  }

  validateResource(resourcePath, resource, validationPath) {
    if (typeof resource !== 'object' || resource === null) {
      this.addError(validationPath, 'Resource must be an object');
      return;
    }

    // Required fields
    if (!resource.accepts) {
      this.addError(`${validationPath}.accepts`, 'Missing required field');
      return;
    }

    if (!Array.isArray(resource.accepts)) {
      this.addError(`${validationPath}.accepts`, 'Must be an array');
      return;
    }

    if (resource.accepts.length === 0) {
      this.addWarning(`${validationPath}.accepts`, 'Empty accepts array - resource will not accept any payments');
    }

    // Validate each payment option
    resource.accepts.forEach((accept, index) => {
      this.validateAccept(accept, `${validationPath}.accepts[${index}]`);
    });

    // Optional description
    if (resource.description && typeof resource.description !== 'string') {
      this.addError(`${validationPath}.description`, 'Must be a string');
    }

    // Check for reasonable resource path
    if (!resourcePath.startsWith('/')) {
      this.addWarning(validationPath, 'Resource path should start with "/"');
    }
  }

  validateAccept(accept, validationPath) {
    if (typeof accept !== 'object' || accept === null) {
      this.addError(validationPath, 'Accept entry must be an object');
      return;
    }

    // Required fields
    const required = ['scheme', 'network', 'amount', 'asset', 'payTo'];
    required.forEach(field => {
      if (!accept[field]) {
        this.addError(`${validationPath}.${field}`, 'Missing required field');
      }
    });

    // Validate scheme
    if (accept.scheme && !VALID_SCHEMES.includes(accept.scheme)) {
      this.addWarning(`${validationPath}.scheme`, `Unknown scheme "${accept.scheme}". Known schemes: ${VALID_SCHEMES.join(', ')}`);
    }

    // Validate network format
    if (accept.network) {
      if (!VALID_NETWORKS.includes(accept.network)) {
        this.addWarning(`${validationPath}.network`, `Network "${accept.network}" not in known networks list`);
      }
      
      if (!accept.network.includes(':')) {
        this.addError(`${validationPath}.network`, 'Network must use CAIP-2 format (e.g., "eip155:8453")');
      }
    }

    // Validate amount format
    if (accept.amount) {
      if (typeof accept.amount !== 'string') {
        this.addError(`${validationPath}.amount`, 'Amount must be a string');
      } else if (!/^\d+$/.test(accept.amount)) {
        this.addError(`${validationPath}.amount`, 'Amount must be a decimal string (e.g., "1000000")');
      }
    }

    // Validate asset address format
    if (accept.asset) {
      const isEthAddress = /^0x[a-fA-F0-9]{40}$/i.test(accept.asset);
      const isSolanaAddress = /^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(accept.asset);
      
      if (!isEthAddress && !isSolanaAddress) {
        this.addError(`${validationPath}.asset`, 'Asset must be a valid Ethereum (0x...) or Solana address');
      }

      // Check against known assets
      const knownAsset = KNOWN_ASSETS[accept.asset?.toLowerCase()];
      if (knownAsset && accept.network && knownAsset.network !== accept.network) {
        this.addError(`${validationPath}`, `Asset ${accept.asset} is for network ${knownAsset.network}, but network is set to ${accept.network}`);
      }
    }

    // Validate payTo address
    if (accept.payTo) {
      const isEthAddress = /^0x[a-fA-F0-9]{40}$/i.test(accept.payTo);
      const isSolanaAddress = /^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(accept.payTo);
      
      if (!isEthAddress && !isSolanaAddress) {
        this.addError(`${validationPath}.payTo`, 'PayTo must be a valid Ethereum or Solana address');
      }
    }

    // Validate timeout
    if (accept.maxTimeoutSeconds !== undefined) {
      if (typeof accept.maxTimeoutSeconds !== 'number' || accept.maxTimeoutSeconds <= 0) {
        this.addError(`${validationPath}.maxTimeoutSeconds`, 'Must be a positive number');
      } else if (accept.maxTimeoutSeconds > 3600) {
        this.addWarning(`${validationPath}.maxTimeoutSeconds`, 'Timeout over 1 hour may cause poor user experience');
      }
    }

    // Validate extra field
    if (accept.extra && typeof accept.extra !== 'object') {
      this.addError(`${validationPath}.extra`, 'Extra field must be an object');
    }
  }
}

async function fetchUrl(url) {
  return new Promise((resolve, reject) => {
    const client = url.startsWith('https:') ? https : http;
    
    const req = client.get(url, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        if (res.statusCode >= 200 && res.statusCode < 300) {
          resolve(data);
        } else {
          reject(new Error(`HTTP ${res.statusCode}: ${res.statusMessage}`));
        }
      });
    });

    req.on('error', reject);
    req.setTimeout(10000, () => {
      req.destroy();
      reject(new Error('Request timeout'));
    });
  });
}

function readStdin() {
  return new Promise((resolve) => {
    let data = '';
    process.stdin.setEncoding('utf8');
    process.stdin.on('data', chunk => data += chunk);
    process.stdin.on('end', () => resolve(data));
  });
}

function printResults(results, url = null) {
  if (url) {
    console.log(`\n📍 Validating: ${url}\n`);
  }

  if (results.valid && results.warnings.length === 0) {
    console.log('✅ Discovery document is valid with no warnings');
    return;
  }

  if (results.valid) {
    console.log('✅ Discovery document is valid');
  } else {
    console.log('❌ Discovery document has errors');
  }

  if (results.errors.length > 0) {
    console.log(`\n🚨 Errors (${results.errors.length}):`);
    results.errors.forEach(error => {
      console.log(`  • ${error.path}: ${error.message}`);
    });
  }

  if (results.warnings.length > 0) {
    console.log(`\n⚠️  Warnings (${results.warnings.length}):`);
    results.warnings.forEach(warning => {
      console.log(`  • ${warning.path}: ${warning.message}`);
    });
  }

  console.log();
}

async function main() {
  const args = process.argv.slice(2);
  
  if (args.length === 0 || args.includes('--help') || args.includes('-h')) {
    console.log(`
x402 Discovery Document Validator

Usage:
  node discovery-validator.js <url>                    Validate from URL
  node discovery-validator.js --file <path>           Validate from file  
  node discovery-validator.js --stdin                 Validate from stdin
  node discovery-validator.js --help                  Show this help

Examples:
  node discovery-validator.js https://api.example.com/.well-known/x402
  node discovery-validator.js --file ./discovery.json
  echo '{"x402Version":"2",...}' | node discovery-validator.js --stdin
`);
    process.exit(0);
  }

  const validator = new DiscoveryValidator();
  let documentText = '';
  let source = '';

  try {
    if (args[0] === '--stdin') {
      documentText = await readStdin();
      source = 'stdin';
    } else if (args[0] === '--file') {
      if (!args[1]) {
        console.error('Error: --file requires a path argument');
        process.exit(1);
      }
      documentText = fs.readFileSync(args[1], 'utf8');
      source = args[1];
    } else {
      // Assume URL
      const url = args[0];
      try {
        new URL(url); // Validate URL format
      } catch {
        console.error(`Error: "${url}" is not a valid URL`);
        process.exit(1);
      }
      
      documentText = await fetchUrl(url);
      source = url;
    }

    // Parse JSON
    let document;
    try {
      document = JSON.parse(documentText);
    } catch (parseError) {
      console.error(`Error: Invalid JSON - ${parseError.message}`);
      process.exit(1);
    }

    // Validate
    const results = validator.validate(document);
    printResults(results, source !== 'stdin' ? source : null);

    // Exit with appropriate code
    process.exit(results.valid ? 0 : 1);

  } catch (error) {
    console.error(`Error: ${error.message}`);
    process.exit(1);
  }
}

if (require.main === module) {
  main();
}

module.exports = { DiscoveryValidator, ValidationError };