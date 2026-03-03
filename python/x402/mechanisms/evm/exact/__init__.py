"""Exact EVM payment scheme for x402."""

from .client import ExactEvmScheme as ExactEvmClientScheme

# ERC-4337 exports
from .erc4337_client import ExactEvmSchemeERC4337 as ExactEvmSchemeERC4337Client
from .erc4337_errors import PaymentCreationError, parse_aa_error
from .erc4337_facilitator import ExactEvmSchemeERC4337 as ExactEvmSchemeERC4337Facilitator
from .erc4337_facilitator import ExactEvmSchemeERC4337Config
from .erc4337_server import ExactEvmSchemeERC4337 as ExactEvmSchemeERC4337Server
from .facilitator import ExactEvmScheme as ExactEvmFacilitatorScheme
from .facilitator import ExactEvmSchemeConfig
from .register import (
    register_exact_evm_client,
    register_exact_evm_facilitator,
    register_exact_evm_server,
)
from .server import ExactEvmScheme as ExactEvmServerScheme

# Unified export (context determines which is used)
ExactEvmScheme = ExactEvmClientScheme  # Most common use case

__all__ = [
    "ExactEvmScheme",
    "ExactEvmClientScheme",
    "ExactEvmServerScheme",
    "ExactEvmFacilitatorScheme",
    "ExactEvmSchemeConfig",
    "register_exact_evm_client",
    "register_exact_evm_server",
    "register_exact_evm_facilitator",
    # ERC-4337
    "ExactEvmSchemeERC4337Client",
    "ExactEvmSchemeERC4337Facilitator",
    "ExactEvmSchemeERC4337Config",
    "ExactEvmSchemeERC4337Server",
    "PaymentCreationError",
    "parse_aa_error",
]
