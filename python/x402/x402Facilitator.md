# x402Facilitator - Implementation Plan

Payment verification and settlement component. Runs as a service, manages scheme mechanisms, handles V1/V2 routing.

## Interfaces

```python
class SchemeNetworkFacilitator(Protocol):
    """V2 facilitator-side payment mechanism.
    
    Note: Sync-first (matching legacy SDK pattern).
    Note: Returns VerifyResponse/SettleResponse objects with is_valid/success=False on failure.
    """
    
    @property
    def scheme(self) -> str: ...
    
    @property
    def caip_family(self) -> str:
        """E.g., 'eip155:*' for EVM, 'solana:*' for SVM."""
        ...
    
    def get_extra(self, network: Network) -> dict | None:
        """Extra data for supported kinds. EVM: None, SVM: {"feePayer": addr}"""
        ...
    
    def get_signers(self, network: Network) -> list[str]: ...
    
    def verify(self, payload: PaymentPayload, requirements: PaymentRequirements) -> VerifyResponse:
        """Verify payment. Returns VerifyResponse with is_valid=False on failure."""
        ...
    
    def settle(self, payload: PaymentPayload, requirements: PaymentRequirements) -> SettleResponse:
        """Settle payment. Returns SettleResponse with success=False on failure."""
        ...

class SchemeNetworkFacilitatorV1(Protocol):
    """V1 (legacy) facilitator mechanism - same shape, V1 types."""
    ...
```

## Hooks

Shared hook types from `types/hooks.py` (same as x402ResourceServer):

```python
# Import from types/hooks.py:
# - AbortResult, RecoveredVerifyResult, RecoveredSettleResult
# - VerifyContext, VerifyResultContext, VerifyFailureContext
# - SettleContext, SettleResultContext, SettleFailureContext

# Sync-first hook signatures
BeforeVerifyHook = Callable[[VerifyContext], None | AbortResult]
AfterVerifyHook = Callable[[VerifyResultContext], None]
OnVerifyFailureHook = Callable[[VerifyFailureContext], None | RecoveredVerifyResult]

BeforeSettleHook = Callable[[SettleContext], None | AbortResult]
AfterSettleHook = Callable[[SettleResultContext], None]
OnSettleFailureHook = Callable[[SettleFailureContext], None | RecoveredSettleResult]
```

## Internal Types

```python
@dataclass
class _SchemeData(Generic[T]):
    facilitator: T
    networks: set[Network]
    pattern: Network  # Wildcard like "eip155:*"
```

## Class

```python
class x402Facilitator:
    def __init__(self):
        self._schemes_v1: list[_SchemeData[SchemeNetworkFacilitatorV1]] = []
        self._schemes: list[_SchemeData[SchemeNetworkFacilitator]] = []
        self._extensions: list[str] = []
        # Hooks: before/after/failure for verify and settle
```

## Methods

| Method | Description |
|--------|-------------|
| `register(networks, facilitator) -> Self` | Register V2 facilitator for network(s) |
| `register_v1(networks, facilitator) -> Self` | Register V1 facilitator |
| `register_extension(extension) -> Self` | Register extension name |
| `verify(payload, requirements) -> VerifyResponse` | Verify payment (routes by version) |
| `settle(payload, requirements) -> SettleResponse` | Settle payment (routes by version) |
| `get_supported() -> SupportedResponse` | Get supported kinds/extensions/signers |
| `get_extensions() -> list[str]` | Get extension names |
| `on_before_verify/after/failure(hook) -> Self` | Hook registration |
| `on_before_settle/after/failure(hook) -> Self` | Hook registration |

## Flow

```
verify(payload, requirements)
├── 1. Build VerifyContext (with bytes escape hatch)
├── 2. Execute before_verify_hooks (abort if AbortResult)
├── 3. Detect version from payload.x402_version
├── 4. Route to _verify_v1() or _verify_v2()
│   └── Find facilitator by scheme + network (with pattern matching)
├── 5. If isValid: false → execute failure_hooks
├── 6. If isValid: true → execute after_hooks
└── 7. On exception → execute failure_hooks

get_supported()
├── Iterate V1 and V2 schemes
├── For each network in scheme_data.networks:
│   └── Build SupportedKind with version, scheme, network, extra
├── Collect signers by CAIP family
└── Return SupportedResponse(kinds, extensions, signers)
```

## Network Pattern Matching

Uses shared utilities from `x402.types.helpers`:

```python
from x402.types import derive_network_pattern, matches_network_pattern

# Internal _derive_pattern calls derive_network_pattern
# Internal _matches_pattern calls matches_network_pattern
#
# derive_network_pattern(["eip155:8453", "eip155:84532"]) → "eip155:*"
# matches_network_pattern("eip155:8453", "eip155:*") → True
```

## Example

```python
facilitator = x402Facilitator()

facilitator.register(
    ["eip155:8453", "eip155:84532"],
    EVMExactFacilitatorScheme(wallet=facilitator_wallet),
)
facilitator.register_extension("bazaar")

# Verify payment
result = await facilitator.verify(payload, requirements)

# Get supported kinds for /supported endpoint
supported = facilitator.get_supported()
```

## Tests

- [ ] Register multiple networks per scheme
- [ ] Wildcard patterns work (eip155:*)
- [ ] get_supported returns all kinds with correct versions
- [ ] Verify routes to correct mechanism based on version
- [ ] Verify handles isValid: false (triggers failure hooks)
- [ ] Settle routes correctly
- [ ] Hooks execute at correct lifecycle points
- [ ] Extensions list maintained correctly

