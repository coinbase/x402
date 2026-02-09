# Changelog

All notable changes to the `github.com/coinbase/x402/go/mcp` package will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added
- Initial implementation of MCP transport integration for x402 payment protocol
- `X402MCPClient` - Client wrapper with automatic payment handling
- `CreatePaymentWrapper` - Server-side payment wrapper for tool handlers
- Factory functions: `WrapMCPClientWithPayment`, `WrapMCPClientWithPaymentFromConfig`, `CreateX402MCPClient`
- Utility functions: `ExtractPaymentFromMeta`, `AttachPaymentToMeta`, `ExtractPaymentResponseFromMeta`, `AttachPaymentResponseToMeta`, `ExtractPaymentRequiredFromResult`, `CreateToolResourceUrl`
- Error utilities: `CreatePaymentRequiredError`, `IsPaymentRequiredError`, `ExtractPaymentRequiredFromError`
- Type guards: `IsObject`
- Advanced types: `DynamicPayTo`, `DynamicPrice`, `MCPToolPaymentConfig`, `MCPPaymentProcessResult`, `MCPPaymentError`, `MCPToolResultWithPayment`, `MCPRequestParamsWithMeta`, `MCPResultWithMeta`, `MCPMetaWithPayment`, `MCPMetaWithPaymentResponse`, `ToolContentItem`
- Comprehensive hook system: `PaymentRequiredHook`, `BeforePaymentHook`, `AfterPaymentHook`, `BeforeExecutionHook`, `AfterExecutionHook`, `AfterSettlementHook`
- All 19 MCP passthrough methods for full protocol compatibility
- Unit tests for client, server, and utilities
- README.md with examples and API documentation

### Features
- Automatic payment detection and retry on 402 errors
- Dual format payment extraction (structuredContent and content[0].text)
- Payment verification and settlement integration
- Hook system for custom payment handling, logging, and rate limiting
- Factory functions for easy client creation
- Complete MCP protocol passthrough (all 19 methods)

## [0.1.0] - 2025-02-05

### Added
- Initial alpha release
