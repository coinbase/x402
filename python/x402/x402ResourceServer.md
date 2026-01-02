# x402ResourceServer - Implementation Plan

Server-side component for protecting resources. Builds payment requirements, verifies payments, and settles transactions via facilitator clients.

## Interfaces

```python
# Note: FacilitatorClient protocol is defined in http/ module
# Import: from x402.http import FacilitatorClient

class SchemeNetworkServer(Protocol):
    """V2 server-side payment mechanism.
    
    Responsible for price parsing and requirement enhancement.
    Does NOT verify/settle - that's delegated to FacilitatorClient.
    
    Note: Sync-first (matching legacy SDK pattern).
    Note: parse_price handles USD→atomic conversion. Logic lives here, not standalone.
    """
    
    @property
    def scheme(self) -> str: ...
    
    def parse_price(self, price: Price, network: Network) -> AssetAmount:
        """Convert Money or AssetAmount to normalized AssetAmount.
        
        USD→atomic conversion logic lives in the scheme implementation (e.g., EVM).
        """
        ...
    
    def enhance_payment_requirements(
        self, requirements: PaymentRequirements, supported_kind: SupportedKind, extensions: list[str]
    ) -> PaymentRequirements:
        """Add scheme-specific fields (e.g., EIP-712 domain params for EVM)."""
        ...

class ResourceServerExtension(Protocol):
    """Extension that enriches payment declarations (e.g., Bazaar)."""
    
    @property
    def key(self) -> str: ...
    
    def enrich_declaration(self, declaration: dict, transport_context: Any) -> dict: ...
```

## Hooks

```python
# Hook result types (defined in types/hooks.py, shared with x402Client and x402Facilitator)
@dataclass
class AbortResult:
    """Return from before hook to abort the operation."""
    reason: str

@dataclass
class RecoveredVerifyResult:
    """Return from verify failure hook to recover with a result."""
    result: VerifyResponse

@dataclass
class RecoveredSettleResult:
    """Return from settle failure hook to recover with a result."""
    result: SettleResponse

# Verify hook contexts
@dataclass
class VerifyContext:
    payment_payload: PaymentPayload | PaymentPayloadV1
    requirements: PaymentRequirements | PaymentRequirementsV1
    payload_bytes: bytes | None = None  # Escape hatch for extensions
    requirements_bytes: bytes | None = None

@dataclass
class VerifyResultContext(VerifyContext):
    result: VerifyResponse

@dataclass
class VerifyFailureContext(VerifyContext):
    error: Exception

# Settle hook contexts
@dataclass
class SettleContext:
    payment_payload: PaymentPayload | PaymentPayloadV1
    requirements: PaymentRequirements | PaymentRequirementsV1
    payload_bytes: bytes | None = None
    requirements_bytes: bytes | None = None

@dataclass
class SettleResultContext(SettleContext):
    result: SettleResponse

@dataclass
class SettleFailureContext(SettleContext):
    error: Exception

# Hook signatures (sync-first)
BeforeVerifyHook = Callable[[VerifyContext], None | AbortResult]
AfterVerifyHook = Callable[[VerifyResultContext], None]
OnVerifyFailureHook = Callable[[VerifyFailureContext], None | RecoveredVerifyResult]

BeforeSettleHook = Callable[[SettleContext], None | AbortResult]
AfterSettleHook = Callable[[SettleResultContext], None]
OnSettleFailureHook = Callable[[SettleFailureContext], None | RecoveredSettleResult]
```

## Config

```python
@dataclass
class ResourceConfig:
    scheme: str
    network: Network
    pay_to: str
    price: Price
    max_timeout_seconds: int = 300
```

## Class

```python
class x402ResourceServer:
    def __init__(self, facilitator_clients: FacilitatorClient | list[FacilitatorClient] | None = None):
        self._facilitator_clients: list[FacilitatorClient] = [...]  # Normalized list
        self._schemes: dict[Network, dict[str, SchemeNetworkServer]] = {}
        self._facilitator_clients_map: dict[int, dict[Network, dict[str, FacilitatorClient]]] = {}
        self._supported_responses_map: dict[int, dict[Network, dict[str, SupportedResponse]]] = {}
        self._extensions: dict[str, ResourceServerExtension] = {}
        # Hooks: before/after/failure for verify and settle
```

## Methods

| Method | Description |
|--------|-------------|
| `register(network, server) -> Self` | Register V2 scheme server |
| `register_extension(extension) -> Self` | Register extension |
| `initialize()` | Fetch supported from facilitators (required before use) |
| `build_payment_requirements(config) -> list[PaymentRequirements]` | Build requirements |
| `create_payment_required_response(...)` | Create 402 response |
| `verify_payment(payload, requirements) -> VerifyResponse` | Verify via facilitator |
| `settle_payment(payload, requirements) -> SettleResponse` | Settle via facilitator |
| `find_matching_requirements(available, payload)` | Match payload to requirements |
| `enrich_extensions(declared, transport_ctx)` | Enrich extensions |
| `on_before_verify/after/failure(hook) -> Self` | Hook registration |
| `on_before_settle/after/failure(hook) -> Self` | Hook registration |

## Flow

```
initialize() - MUST call first
├── For each facilitator_client:
│   ├── Call get_supported()
│   └── Populate facilitator_clients_map and supported_responses_map
└── Earlier facilitators get precedence

verify_payment(payload, requirements)
├── 1. Build VerifyContext (with bytes escape hatch)
├── 2. Execute before_verify_hooks (abort if AbortResult)
├── 3. Find facilitator client for scheme/network
├── 4. Call facilitator.verify()
├── 5. If isValid: false → execute failure_hooks (recover if possible)
├── 6. If isValid: true → execute after_hooks
└── 7. On exception → execute failure_hooks
```

## Example

```python
server = x402ResourceServer()
server.register("eip155:8453", EVMExactServerScheme())

async def log_verify(ctx: VerifyResultContext) -> None:
    logger.info(f"Verified: {ctx.result.is_valid}")

server.on_after_verify(log_verify)

await server.initialize()

# In request handler:
config = ResourceConfig(scheme="exact", network="eip155:8453", pay_to="0x...", price="$1.00")
requirements = await server.build_payment_requirements(config)
result = await server.verify_payment(payload, requirements[0])
```

## Tests

- [ ] initialize() fetches from multiple facilitators
- [ ] Earlier facilitators get precedence
- [ ] build_payment_requirements uses scheme server
- [ ] verify routes to correct facilitator
- [ ] Verify handles isValid: false (triggers failure hooks)
- [ ] settle routes correctly
- [ ] Hooks execute at correct points
- [ ] Extensions enriched correctly
- [ ] find_matching_requirements for V1/V2

