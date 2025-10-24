# x402 Python SDK - v2 Refactor TODO

## Overview

The Python SDK v2 refactor will modernize the x402 package to align with the TypeScript core implementation patterns while maintaining a Pythonic API. Unlike the TypeScript packages which are being split into multiple npm packages (@x402/core, @x402/express, etc.), the Python implementation will remain as a single monolithic package due to PyPI's flat namespace and Python's different approach to tree-shaking.

## Proposed Package Structure

The v2 refactor will reorganize the existing x402 package with the following structure:

```
/python/x402
  .core               # Core protocol implementation
  .types              # Type definitions and protocols
  .mechanisms         # Implementations
    .evm              # EVM blockchain implementation
    .svm              # Solana blockchain implementation
  .extensions         # Protocol extensions
    .bazaar           # Resource discovery extension
    .sign_in_with_x   # Authentication extension
  .client             # Client implementations
    .x402_client      # Base client class
    .xhttp            # HTTP-specific client utilities
    .requests         # Requests library interceptor
  .server             # Server implementations
    .x402_resource_server      # Core server logic
    .x402_http_resource_server # HTTP server implementation
    .paywall          # Paywall HTML generation
    .flask            # Flask framework integration
    .fast             # FastAPI framework integration
  .facilitator        # Facilitator components
    .x402_facilitator # Local facilitator implementation
  .a2a                # Agent-to-Agent protocol support
  .xmtp               # XMTP messaging protocol integration
  .mcp                # Model Context Protocol support
```
