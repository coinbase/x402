# x402Client - Implementation Plan

Client-side component for creating payment payloads. Manages scheme registration, policy-based filtering, and payload creation.

## Interface

```python
class SchemeNetworkClient(Protocol):
    """V2 client-side payment mechanism.
    
    Returns the inner payload dict, which x402Client wraps into a full PaymentPayload
    by adding accepted, resource, extensions, and x402_version fields.
    
    Note: Sync-first (matching legacy SDK pattern).
    """
    
    @property
    def scheme(self) -> str: ...
    
    def create_payment_payload(
        self, requirements: PaymentRequirements
    ) -> dict[str, Any]:
        """Create the scheme-specific inner payload dict."""
        ...

class SchemeNetworkClientV1(Protocol):
    """V1 (legacy) client-side payment mechanism.
    
    Returns the inner payload dict for V1 format.
    """
    
    @property
    def scheme(self) -> str: ...
    
    def create_payment_payload(
        self, requirements: PaymentRequirementsV1
    ) -> dict[str, Any]:
        """Create the scheme-specific inner payload dict."""
        ...
```

## Hooks

```python
# Hook result types (defined in types/hooks.py)
@dataclass
class AbortResult:
    """Return from before hook to abort the operation."""
    reason: str

@dataclass
class RecoveredPayloadResult:
    """Return from failure hook to recover with a payload."""
    payload: PaymentPayload | PaymentPayloadV1

# Hook contexts
@dataclass
class PaymentCreationContext:
    payment_required: PaymentRequired | PaymentRequiredV1
    selected_requirements: PaymentRequirements | PaymentRequirementsV1

@dataclass
class PaymentCreatedContext(PaymentCreationContext):
    payment_payload: PaymentPayload | PaymentPayloadV1

@dataclass
class PaymentCreationFailureContext(PaymentCreationContext):
    error: Exception

# Hook signatures (sync-first)
BeforePaymentCreationHook = Callable[[PaymentCreationContext], None | AbortResult]
AfterPaymentCreationHook = Callable[[PaymentCreatedContext], None]
OnPaymentCreationFailureHook = Callable[[PaymentCreationFailureContext], None | RecoveredPayloadResult]
```

## Class

```python
class x402Client:
    def __init__(self, payment_requirements_selector: PaymentRequirementsSelector | None = None):
        self._selector = payment_requirements_selector or default_payment_selector
        self._schemes_v1: dict[Network, dict[str, SchemeNetworkClientV1]] = {}
        self._schemes: dict[Network, dict[str, SchemeNetworkClient]] = {}
        self._policies: list[PaymentPolicy] = []
        self._before_payment_creation_hooks: list[BeforePaymentCreationHook] = []
        self._after_payment_creation_hooks: list[AfterPaymentCreationHook] = []
        self._on_payment_creation_failure_hooks: list[OnPaymentCreationFailureHook] = []
```

## Methods

| Method | Description |
|--------|-------------|
| `register(network, client) -> Self` | Register V2 scheme client |
| `register_v1(network, client) -> Self` | Register V1 scheme client |
| `register_policy(policy) -> Self` | Add requirement filter policy |
| `on_before_payment_creation(hook) -> Self` | Hook before creation (can abort) |
| `on_after_payment_creation(hook) -> Self` | Hook after success |
| `on_payment_creation_failure(hook) -> Self` | Hook on failure (can recover) |
| `create_payment_payload(payment_required) -> PaymentPayload` | Main API |
| `from_config(config) -> Self` | Factory from config dict |
| `get_registered_schemes() -> dict` | Debug introspection |

## Flow

```
create_payment_payload(payment_required)
├── 1. Detect version from payment_required.x402_version
├── 2. Select requirements (filter by registered schemes → apply policies → selector)
├── 3. Execute before_hooks (abort if AbortResult)
├── 4. Call scheme_client.create_payment_payload() → returns inner payload dict
├── 5. Wrap into full PaymentPayload:
│   ├── V2: PaymentPayload(x402_version=2, payload=inner, accepted=reqs, resource=..., extensions=...)
│   └── V1: PaymentPayloadV1(x402_version=1, scheme=..., network=..., payload=inner)
├── 6. Execute after_hooks
└── 7. On error → execute failure_hooks (recover if RecoveredPayloadResult)
```

## Policies

```python
PaymentPolicy = Callable[[int, list[Requirements]], list[Requirements]]
PaymentRequirementsSelector = Callable[[int, list[Requirements]], Requirements]

def default_payment_selector(version, reqs): return reqs[0]
def prefer_network(network: Network) -> PaymentPolicy: ...
def prefer_scheme(scheme: str) -> PaymentPolicy: ...
def max_amount(max_value: int) -> PaymentPolicy: ...
```

## Example

```python
client = x402Client()
client.register("eip155:8453", EVMExactClientScheme(wallet=my_wallet))
client.register_policy(prefer_network("eip155:8453"))

async def log_payment(ctx: PaymentCreatedContext) -> None:
    logger.info(f"Created: {ctx.payment_payload}")

client.on_after_payment_creation(log_payment)

payload = await client.create_payment_payload(payment_required)
```

## Tests

- [ ] Register V1/V2 schemes
- [ ] Wildcard network matching
- [ ] Policy filtering in order
- [ ] Before hooks abort
- [ ] Failure hooks recover
- [ ] After hooks receive context
- [ ] from_config works

