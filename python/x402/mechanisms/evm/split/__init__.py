"""EVM split payment scheme.

The `split` scheme extends x402 to support multi-recipient payments.
A single payment authorization is signed by the client, the facilitator
settles on-chain, then distributes to N recipients via internal ledger
credits, on-chain transfers, or batch multicall.

Usage (client):
    from x402.mechanisms.evm.split.register import register_split_evm_client
    register_split_evm_client(client, signer)

Usage (server):
    from x402.mechanisms.evm.split.register import register_split_evm_server
    register_split_evm_server(server)

Usage (facilitator):
    from x402.mechanisms.evm.split.register import register_split_evm_facilitator
    register_split_evm_facilitator(facilitator, signer, networks="eip155:84532")
"""

from .client import SplitEvmScheme as SplitEvmClientScheme
from .constants import SCHEME_SPLIT
from .facilitator import SplitEvmScheme as SplitEvmFacilitatorScheme
from .register import (
    register_split_evm_client,
    register_split_evm_facilitator,
    register_split_evm_server,
)
from .server import SplitEvmScheme as SplitEvmServerScheme
from .types import SplitConfig, SplitRecipient

__all__ = [
    "SCHEME_SPLIT",
    "SplitConfig",
    "SplitEvmClientScheme",
    "SplitEvmFacilitatorScheme",
    "SplitEvmServerScheme",
    "SplitRecipient",
    "register_split_evm_client",
    "register_split_evm_facilitator",
    "register_split_evm_server",
]
