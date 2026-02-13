"""Exact Hypercore payment scheme for x402."""

from .client import ExactHypercoreScheme as ExactHypercoreClientScheme
from .facilitator import ExactHypercoreScheme as ExactHypercoreFacilitatorScheme
from .register import (
    register_exact_hypercore_client,
    register_exact_hypercore_facilitator,
    register_exact_hypercore_server,
)
from .server import ExactHypercoreScheme as ExactHypercoreServerScheme

ExactHypercoreScheme = ExactHypercoreClientScheme

__all__ = [
    "ExactHypercoreScheme",
    "ExactHypercoreClientScheme",
    "ExactHypercoreServerScheme",
    "ExactHypercoreFacilitatorScheme",
    "register_exact_hypercore_client",
    "register_exact_hypercore_server",
    "register_exact_hypercore_facilitator",
]
