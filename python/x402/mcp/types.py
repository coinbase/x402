"""Type definitions for MCP transport integration."""

from typing import Any, Callable, Optional, TYPE_CHECKING

from ..schemas import PaymentPayload, PaymentRequirements, SettleResponse

if TYPE_CHECKING:
    from ..schemas import PaymentRequired

# Constants matching TypeScript implementation
MCP_PAYMENT_REQUIRED_CODE = 402
MCP_PAYMENT_META_KEY = "x402/payment"
MCP_PAYMENT_RESPONSE_META_KEY = "x402/payment-response"


class ResourceInfo:
    """Resource metadata for payment required responses."""

    def __init__(
        self,
        url: str,
        description: Optional[str] = None,
        mime_type: Optional[str] = None,
    ):
        """Initialize resource info.

        Args:
            url: Resource URL
            description: Optional description
            mime_type: Optional MIME type
        """
        self.url = url
        self.description = description
        self.mime_type = mime_type


class PaymentRequiredContext:
    """Context provided to payment required hooks."""

    def __init__(
        self,
        tool_name: str,
        arguments: dict[str, Any],
        payment_required: Any,  # PaymentRequired
    ):
        """Initialize payment required context.

        Args:
            tool_name: Name of the tool
            arguments: Tool arguments
            payment_required: Payment required response
        """
        self.tool_name = tool_name
        self.arguments = arguments
        self.payment_required = payment_required


class PaymentRequiredHookResult:
    """Result from payment required hook."""

    def __init__(
        self,
        payment: Optional[PaymentPayload] = None,
        abort: bool = False,
    ):
        """Initialize hook result.

        Args:
            payment: Optional payment payload to use
            abort: Whether to abort the payment flow
        """
        self.payment = payment
        self.abort = abort


# Type aliases for hooks (defined after classes)
PaymentRequiredHook = Callable[[PaymentRequiredContext], PaymentRequiredHookResult]
BeforePaymentHook = Callable[[PaymentRequiredContext], None]
AfterPaymentHook = Callable[["AfterPaymentContext"], None]  # type: ignore


class AfterPaymentContext:
    """Context provided to after payment hooks."""

    def __init__(
        self,
        tool_name: str,
        payment_payload: PaymentPayload,
        result: "MCPToolResult",  # type: ignore
        settle_response: Optional[SettleResponse] = None,
    ):
        """Initialize after payment context.

        Args:
            tool_name: Name of the tool
            payment_payload: Payment payload that was used
            result: Tool result
            settle_response: Optional settlement response
        """
        self.tool_name = tool_name
        self.payment_payload = payment_payload
        self.result = result
        self.settle_response = settle_response


class MCPToolContext:
    """Context provided to tool handlers."""

    def __init__(
        self,
        tool_name: str,
        arguments: dict[str, Any],
        meta: Optional[dict[str, Any]] = None,
    ):
        """Initialize tool context.

        Args:
            tool_name: Name of the tool
            arguments: Tool arguments
            meta: Optional metadata
        """
        self.tool_name = tool_name
        self.arguments = arguments
        self.meta = meta or {}


class MCPToolResult:
    """Result from an MCP tool call."""

    def __init__(
        self,
        content: list[dict[str, Any]],
        is_error: bool = False,
        meta: Optional[dict[str, Any]] = None,
        structured_content: Optional[dict[str, Any]] = None,
    ):
        """Initialize tool result.

        Args:
            content: Content items
            is_error: Whether this is an error result
            meta: Optional metadata
            structured_content: Optional structured content
        """
        self.content = content
        self.is_error = is_error
        self.meta = meta or {}
        self.structured_content = structured_content


class MCPToolCallResult:
    """Result from a tool call with payment metadata."""

    def __init__(
        self,
        content: list[dict[str, Any]],
        is_error: bool = False,
        payment_response: Optional[SettleResponse] = None,
        payment_made: bool = False,
    ):
        """Initialize tool call result.

        Args:
            content: Content items
            is_error: Whether this is an error result
            payment_response: Optional settlement response
            payment_made: Whether payment was made
        """
        self.content = content
        self.is_error = is_error
        self.payment_response = payment_response
        self.payment_made = payment_made


class PaymentWrapperConfig:
    """Configuration for payment wrapper."""

    def __init__(
        self,
        accepts: list[PaymentRequirements],
        resource: Optional[ResourceInfo] = None,
        hooks: Optional["PaymentWrapperHooks"] = None,  # type: ignore
    ):
        """Initialize payment wrapper config.

        Args:
            accepts: List of payment requirements
            resource: Optional resource info
            hooks: Optional server-side hooks
        """
        if not accepts:
            raise ValueError("accepts must have at least one payment requirement")
        self.accepts = accepts
        self.resource = resource
        self.hooks = hooks


class ServerHookContext:
    """Context provided to server-side hooks."""

    def __init__(
        self,
        tool_name: str,
        arguments: dict[str, Any],
        payment_requirements: PaymentRequirements,
        payment_payload: PaymentPayload,
    ):
        """Initialize server hook context.

        Args:
            tool_name: Name of the tool
            arguments: Tool arguments
            payment_requirements: Payment requirements
            payment_payload: Payment payload
        """
        self.tool_name = tool_name
        self.arguments = arguments
        self.payment_requirements = payment_requirements
        self.payment_payload = payment_payload


class AfterExecutionContext(ServerHookContext):
    """Context provided to after execution hooks."""

    def __init__(
        self,
        tool_name: str,
        arguments: dict[str, Any],
        payment_requirements: PaymentRequirements,
        payment_payload: PaymentPayload,
        result: MCPToolResult,
    ):
        """Initialize after execution context.

        Args:
            tool_name: Name of the tool
            arguments: Tool arguments
            payment_requirements: Payment requirements
            payment_payload: Payment payload
            result: Tool result
        """
        super().__init__(tool_name, arguments, payment_requirements, payment_payload)
        self.result = result


class SettlementContext(ServerHookContext):
    """Context provided to after settlement hooks."""

    def __init__(
        self,
        tool_name: str,
        arguments: dict[str, Any],
        payment_requirements: PaymentRequirements,
        payment_payload: PaymentPayload,
        settlement: SettleResponse,
    ):
        """Initialize settlement context.

        Args:
            tool_name: Name of the tool
            arguments: Tool arguments
            payment_requirements: Payment requirements
            payment_payload: Payment payload
            settlement: Settlement response
        """
        super().__init__(tool_name, arguments, payment_requirements, payment_payload)
        self.settlement = settlement


class PaymentWrapperHooks:
    """Server-side hooks for payment wrapper."""

    def __init__(
        self,
        on_before_execution: Optional[Callable[[ServerHookContext], bool]] = None,
        on_after_execution: Optional[Callable[[AfterExecutionContext], None]] = None,
        on_after_settlement: Optional[Callable[[SettlementContext], None]] = None,
    ):
        """Initialize payment wrapper hooks.

        Args:
            on_before_execution: Hook called before execution (can abort)
            on_after_execution: Hook called after execution
            on_after_settlement: Hook called after settlement
        """
        self.on_before_execution = on_before_execution
        self.on_after_execution = on_after_execution
        self.on_after_settlement = on_after_settlement


# Server hook type aliases (defined after classes)
BeforeExecutionHook = Callable[[ServerHookContext], bool]
AfterExecutionHook = Callable[[AfterExecutionContext], None]
AfterSettlementHook = Callable[[SettlementContext], None]


# ============================================================================
# Advanced Types (for future dynamic pricing features)
# ============================================================================

from ..schemas.base import Network, Price

# Dynamic function types
DynamicPayTo = Callable[[MCPToolContext], str]
"""Function type that resolves payTo address based on tool call context."""

DynamicPrice = Callable[[MCPToolContext], Price]
"""Function type that resolves price based on tool call context."""


class MCPToolPaymentConfig:
    """Payment configuration for a paid MCP tool."""

    def __init__(
        self,
        scheme: str,
        network: Network,
        price: Price | DynamicPrice,
        pay_to: str | DynamicPayTo,
        max_timeout_seconds: Optional[int] = None,
        extra: Optional[dict[str, Any]] = None,
        resource: Optional[ResourceInfo] = None,
    ):
        """Initialize payment config.

        Args:
            scheme: Payment scheme identifier (e.g., "exact")
            network: Blockchain network identifier in CAIP-2 format
            price: Price for the tool call or dynamic resolver
            pay_to: Recipient wallet address or dynamic resolver
            max_timeout_seconds: Maximum time for payment completion
            extra: Scheme-specific additional information
            resource: Resource metadata for the tool
        """
        self.scheme = scheme
        self.network = network
        self.price = price
        self.pay_to = pay_to
        self.max_timeout_seconds = max_timeout_seconds
        self.extra = extra or {}
        self.resource = resource


# Advanced types (matching TypeScript exports)
# These are type hints for future dynamic pricing features

class MCPPaymentError:
    """MCP payment error structure for JSON-RPC error responses."""

    def __init__(self, code: int, message: str, data: Optional[Any] = None):
        self.code = code
        self.message = message
        self.data = data


class MCPToolResultWithPayment:
    """Result of a tool call that includes payment response metadata."""

    def __init__(
        self,
        content: list[dict[str, Any]],
        is_error: bool = False,
        payment_response: Optional[SettleResponse] = None,
    ):
        self.content = content
        self.is_error = is_error
        self.payment_response = payment_response


class ToolContentItem:
    """Tool content item type."""

    def __init__(self, type: str, text: Optional[str] = None, **kwargs: Any):
        self.type = type
        self.text = text
        self.data = kwargs


class MCPRequestParamsWithMeta:
    """MCP request params with optional _meta field for payment."""

    def __init__(
        self,
        name: str,
        arguments: Optional[dict[str, Any]] = None,
        meta: Optional["MCPMetaWithPayment"] = None,
    ):
        self.name = name
        self.arguments = arguments or {}
        self.meta = meta


class MCPMetaWithPayment:
    """MCP metadata with payment."""

    def __init__(self, payment_payload: Optional[PaymentPayload] = None, **kwargs: Any):
        self.payment_payload = payment_payload
        self.other = kwargs


class MCPResultWithMeta:
    """MCP result with optional _meta field for payment response."""

    def __init__(
        self,
        content: Optional[list[dict[str, Any]]] = None,
        is_error: bool = False,
        meta: Optional["MCPMetaWithPaymentResponse"] = None,
    ):
        self.content = content or []
        self.is_error = is_error
        self.meta = meta


class MCPMetaWithPaymentResponse:
    """MCP metadata with payment response."""

    def __init__(self, payment_response: Optional[SettleResponse] = None, **kwargs: Any):
        self.payment_response = payment_response
        self.other = kwargs


# Additional advanced types for type hints
class MCPPaymentProcessResult:
    """Result of processing an MCP tool request for payment."""
    pass


class NoPaymentRequiredResult:
    """Indicates no payment is required."""
    type: str = "no-payment-required"


class PaymentVerifiedResult:
    """Indicates payment was verified."""

    def __init__(self, payment_payload: PaymentPayload, payment_requirements: PaymentRequirements):
        self.type = "payment-verified"
        self.payment_payload = payment_payload
        self.payment_requirements = payment_requirements


class PaymentErrorResult:
    """Indicates a payment error occurred."""

    def __init__(self, error: MCPPaymentError):
        self.type = "payment-error"
        self.error = error


class PaymentRequiredError(Exception):
    """Error indicating payment is required."""

    def __init__(
        self,
        message: str,
        payment_required: Optional[Any] = None,  # PaymentRequired
    ):
        """Initialize payment required error.

        Args:
            message: Error message
            payment_required: Optional payment required response
        """
        super().__init__(message)
        self.code = MCP_PAYMENT_REQUIRED_CODE
        self.payment_required = payment_required
