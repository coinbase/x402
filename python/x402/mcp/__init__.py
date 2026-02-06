"""MCP (Model Context Protocol) transport integration for the x402 payment protocol.

This package enables paid tool calls in MCP servers and automatic payment handling in MCP clients.

Convenience Re-exports:
    This package re-exports commonly used types from the x402 core package for convenience.
    You can import everything you need from this package:

    ```python
    from x402.mcp import (
        x402MCPClient,
        create_payment_wrapper,
        # Core types (re-exported)
        PaymentPayload,
        PaymentRequired,
        PaymentRequirements,
        SettleResponse,
        Network,
        # Client and server classes (re-exported)
        x402ClientSync,
        x402ResourceServerSync,
    )
    ```
"""

from .client import (
    create_x402_mcp_client,
    create_x402_mcp_client_from_config,
    wrap_mcp_client_with_payment,
    wrap_mcp_client_with_payment_from_config,
    x402MCPClient,
)
from .server import create_payment_wrapper
from .types import (
    AfterExecutionContext,
    AfterExecutionHook,
    AfterPaymentContext,
    AfterPaymentHook,
    AfterSettlementHook,
    BeforeExecutionHook,
    BeforePaymentHook,
    DynamicPayTo,
    DynamicPrice,
    MCP_PAYMENT_META_KEY,
    MCP_PAYMENT_REQUIRED_CODE,
    MCP_PAYMENT_RESPONSE_META_KEY,
    MCPMetaWithPayment,
    MCPMetaWithPaymentResponse,
    MCPPaymentError,
    MCPPaymentProcessResult,
    MCPRequestParamsWithMeta,
    MCPResultWithMeta,
    MCPToolCallResult,
    MCPToolContext,
    MCPToolPaymentConfig,
    MCPToolResult,
    MCPToolResultWithPayment,
    PaymentErrorResult,
    PaymentRequiredContext,
    PaymentRequiredError,
    PaymentRequiredHook,
    PaymentRequiredHookResult,
    PaymentVerifiedResult,
    PaymentWrapperConfig,
    PaymentWrapperHooks,
    ResourceInfo,
    ServerHookContext,
    SettlementContext,
    ToolContentItem,
)
from .utils import (
    attach_payment_response_to_meta,
    attach_payment_to_meta,
    create_payment_required_error,
    create_tool_resource_url,
    extract_payment_from_meta,
    extract_payment_required_from_error,
    extract_payment_required_from_result,
    extract_payment_response_from_meta,
    is_object,
    is_payment_required_error,
)

__all__ = [
    # Client
    "x402MCPClient",
    "create_x402_mcp_client",
    "create_x402_mcp_client_from_config",
    "wrap_mcp_client_with_payment",
    "wrap_mcp_client_with_payment_from_config",
    # Server
    "create_payment_wrapper",
    # Constants
    "MCP_PAYMENT_META_KEY",
    "MCP_PAYMENT_REQUIRED_CODE",
    "MCP_PAYMENT_RESPONSE_META_KEY",
    # Types
    "PaymentWrapperConfig",
    "ResourceInfo",
    "MCPToolContext",
    "MCPToolResult",
    "MCPToolCallResult",
    "PaymentRequiredContext",
    "PaymentRequiredHookResult",
    "PaymentRequiredError",
    "ServerHookContext",
    "AfterExecutionContext",
    "SettlementContext",
    "PaymentWrapperHooks",
    # Advanced types
    "DynamicPayTo",
    "DynamicPrice",
    "MCPToolPaymentConfig",
    "MCPPaymentProcessResult",
    "PaymentVerifiedResult",
    "PaymentErrorResult",
    "MCPPaymentError",
    "MCPToolResultWithPayment",
    "MCPRequestParamsWithMeta",
    "MCPResultWithMeta",
    "MCPMetaWithPayment",
    "MCPMetaWithPaymentResponse",
    "ToolContentItem",
    # Hook types (for type hints)
    "PaymentRequiredHook",
    "BeforePaymentHook",
    "AfterPaymentHook",
    "BeforeExecutionHook",
    "AfterExecutionHook",
    "AfterSettlementHook",
    "AfterPaymentContext",
    # Utilities
    "is_payment_required_error",
    "create_payment_required_error",
    "extract_payment_required_from_error",
    "extract_payment_from_meta",
    "attach_payment_to_meta",
    "extract_payment_response_from_meta",
    "attach_payment_response_to_meta",
    "extract_payment_required_from_result",
    "create_tool_resource_url",
    "is_object",
]

# ============================================================================
# Convenience Re-exports from x402 core
# ============================================================================
# These re-exports provide common types and classes that MCP users frequently need,
# reducing the number of separate package imports required.

# Re-export client classes
try:
    from .. import x402ClientSync, x402ClientAsync
    __all__.extend(["x402ClientSync", "x402ClientAsync"])
except ImportError:
    pass  # May not be available in all builds

# Re-export server classes
try:
    from ..server import x402ResourceServerSync, x402ResourceServerAsync
    __all__.extend(["x402ResourceServerSync", "x402ResourceServerAsync"])
except ImportError:
    pass  # May not be available in all builds

# Re-export core types from schemas
from ..schemas import (
    PaymentPayload,
    PaymentRequired,
    PaymentRequirements,
    SettleResponse,
    Network,
)

# Re-export interfaces (Protocol types for type hints)
try:
    from ..interfaces import SchemeNetworkClient, SchemeNetworkClientV1, SchemeNetworkServer, SchemeNetworkServerV1
    __all__.extend([
        "SchemeNetworkClient",
        "SchemeNetworkClientV1",
        "SchemeNetworkServer",
        "SchemeNetworkServerV1",
    ])
except ImportError:
    pass  # May not be available in all builds

__all__.extend([
    "PaymentPayload",
    "PaymentRequired",
    "PaymentRequirements",
    "SettleResponse",
    "Network",
    # Interfaces (if available)
    "SchemeNetworkClient",
    "SchemeNetworkClientV1",
    "SchemeNetworkServer",
    "SchemeNetworkServerV1",
])
