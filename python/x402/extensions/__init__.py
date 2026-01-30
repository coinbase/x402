"""x402 Extensions - Optional extensions for the x402 payment protocol.

This module provides optional extensions that enhance the x402 payment protocol
with additional functionality like resource discovery and cataloging.
"""

from .bazaar import (
    BAZAAR,
    BodyDiscoveryExtension,
    BodyDiscoveryInfo,
    BodyInput,
    BodyMethods,
    BodyType,
    DeclareBodyDiscoveryConfig,
    DeclareQueryDiscoveryConfig,
    DiscoveredResource,
    DiscoveryExtension,
    DiscoveryInfo,
    OutputConfig,
    OutputInfo,
    QueryDiscoveryExtension,
    QueryDiscoveryInfo,
    QueryInput,
    QueryParamMethods,
    ValidationResult,
    bazaar_resource_server_extension,
    declare_discovery_extension,
    extract_discovery_info,
    extract_discovery_info_from_extension,
    validate_and_extract,
    validate_discovery_extension,
)

__all__ = [
    # Constants
    "BAZAAR",
    # Method types
    "QueryParamMethods",
    "BodyMethods",
    "BodyType",
    # Input types
    "QueryInput",
    "BodyInput",
    "OutputInfo",
    # Discovery info types
    "QueryDiscoveryInfo",
    "BodyDiscoveryInfo",
    "DiscoveryInfo",
    # Extension types
    "QueryDiscoveryExtension",
    "BodyDiscoveryExtension",
    "DiscoveryExtension",
    # Config types
    "DeclareQueryDiscoveryConfig",
    "DeclareBodyDiscoveryConfig",
    "OutputConfig",
    # Result types
    "ValidationResult",
    "DiscoveredResource",
    # Server extension
    "bazaar_resource_server_extension",
    # Functions
    "declare_discovery_extension",
    "validate_discovery_extension",
    "extract_discovery_info",
    "extract_discovery_info_from_extension",
    "validate_and_extract",
]
