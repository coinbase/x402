Add 67 unit tests for `x402.mcp.utils` — previously the only file in the MCP
package with zero dedicated unit test coverage.

Tests cover all 14 public and private helpers: `extract_payment_from_meta`,
`attach_payment_to_meta`, `extract_payment_response_from_meta`,
`attach_payment_response_to_meta`, `extract_payment_required_from_result`,
`_extract_payment_required_from_object`, `create_tool_resource_url`,
`is_object`, `create_payment_required_error`,
`extract_payment_required_from_error`, `convert_mcp_result`,
`register_schemes`, and `is_payment_required_error`.
