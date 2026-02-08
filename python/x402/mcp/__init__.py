"""MCP (Model Context Protocol) transport integration for the x402 payment protocol.

This package enables paid tool calls in MCP servers and automatic payment handling in MCP clients.

Python is async-first -- the default classes are async:
    - ``x402MCPClient`` / ``create_payment_wrapper`` for asyncio usage (default)
    - ``x402MCPClientSync`` / ``create_payment_wrapper_sync`` for synchronous usage

Convenience Re-exports:
    This package re-exports commonly used types from the x402 core package for convenience.

    ```python
    from x402.mcp import (
        # Async client / server (default)
        x402MCPClient,
        create_payment_wrapper,
        # Sync client / server
        x402MCPClientSync,
        create_payment_wrapper_sync,
        # Core types (re-exported)
        PaymentPayload,
        PaymentRequired,
        PaymentRequirements,
        SettleResponse,
        Network,
    )
    ```
"""

# Async client (default)
from .client_async import (
    create_x402_mcp_client,
    create_x402_mcp_client_from_config,
    wrap_mcp_client_with_payment,
    wrap_mcp_client_with_payment_from_config,
    x402MCPClient,
    # Async hook types (accept both sync and async callables)
    PaymentRequiredHook,
    BeforePaymentHook,
    AfterPaymentHook,
)

# Sync client
from .client import (
    create_x402_mcp_client_sync,
    create_x402_mcp_client_from_config_sync,
    wrap_mcp_client_with_payment_sync,
    wrap_mcp_client_with_payment_from_config_sync,
    x402MCPClientSync,
)

# Async server (default)
from .server_async import (
    create_payment_wrapper,
    wrap_fastmcp_tool,
    PaymentWrapperConfig,
    PaymentWrapperHooks,
    # Async server hook types (accept both sync and async callables)
    BeforeExecutionHook,
    AfterExecutionHook,
    AfterSettlementHook,
)

# Sync server
from .server import create_payment_wrapper_sync, wrap_fastmcp_tool_sync

# Types
from .types import (
    AfterExecutionContext,
    AfterPaymentContext,
    ResourceInfo,
    DynamicPayTo,
    DynamicPrice,
    MCP_PAYMENT_META_KEY,
    MCP_PAYMENT_REQUIRED_CODE,
    MCP_PAYMENT_RESPONSE_META_KEY,
    MCPToolCallResult,
    MCPToolContext,
    MCPToolResult,
    PaymentRequiredContext,
    PaymentRequiredError,
    PaymentRequiredHookResult,
    ServerHookContext,
    SettlementContext,
    # Sync hook types
    SyncPaymentWrapperConfig,
    SyncPaymentWrapperHooks,
    SyncPaymentRequiredHook,
    SyncBeforePaymentHook,
    SyncAfterPaymentHook,
    SyncBeforeExecutionHook,
    SyncAfterExecutionHook,
    SyncAfterSettlementHook,
)

# Utilities
from .utils import (
    attach_payment_response_to_meta,
    attach_payment_to_meta,
    convert_mcp_result,
    create_payment_required_error,
    create_tool_resource_url,
    extract_payment_from_meta,
    extract_payment_required_from_error,
    extract_payment_required_from_result,
    extract_payment_response_from_meta,
    is_object,
    is_payment_required_error,
    register_schemes,
)

__all__ = [
    # Client (async, default)
    "x402MCPClient",
    "create_x402_mcp_client",
    "create_x402_mcp_client_from_config",
    "wrap_mcp_client_with_payment",
    "wrap_mcp_client_with_payment_from_config",
    "PaymentRequiredHook",
    "BeforePaymentHook",
    "AfterPaymentHook",
    # Client (sync)
    "x402MCPClientSync",
    "create_x402_mcp_client_sync",
    "create_x402_mcp_client_from_config_sync",
    "wrap_mcp_client_with_payment_sync",
    "wrap_mcp_client_with_payment_from_config_sync",
    "SyncPaymentRequiredHook",
    "SyncBeforePaymentHook",
    "SyncAfterPaymentHook",
    # Server (async, default)
    "create_payment_wrapper",
    "wrap_fastmcp_tool",
    "PaymentWrapperConfig",
    "PaymentWrapperHooks",
    "BeforeExecutionHook",
    "AfterExecutionHook",
    "AfterSettlementHook",
    # Server (sync)
    "create_payment_wrapper_sync",
    "wrap_fastmcp_tool_sync",
    "SyncPaymentWrapperConfig",
    "SyncPaymentWrapperHooks",
    "SyncBeforeExecutionHook",
    "SyncAfterExecutionHook",
    "SyncAfterSettlementHook",
    # Constants
    "MCP_PAYMENT_META_KEY",
    "MCP_PAYMENT_REQUIRED_CODE",
    "MCP_PAYMENT_RESPONSE_META_KEY",
    # Types
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
    "AfterPaymentContext",
    # Dynamic pricing types
    "DynamicPayTo",
    "DynamicPrice",
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
    "convert_mcp_result",
    "register_schemes",
    "is_object",
]

# ============================================================================
# Convenience Re-exports from x402 core
# ============================================================================

# Re-export client classes
try:
    from .. import x402ClientSync
    from .. import x402Client as x402ClientAsync  # async is the default
    __all__.extend(["x402ClientSync", "x402ClientAsync"])
except ImportError:
    pass

# Re-export server classes
try:
    from ..server import x402ResourceServerSync
    from ..server import x402ResourceServer as x402ResourceServerAsync  # async is the default
    __all__.extend(["x402ResourceServerSync", "x402ResourceServerAsync"])
except ImportError:
    pass

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
    pass

__all__.extend([
    "PaymentPayload",
    "PaymentRequired",
    "PaymentRequirements",
    "SettleResponse",
    "Network",
])
