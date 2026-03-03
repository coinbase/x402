"""ERC-4337 error types for x402 EVM mechanism."""

import re
from typing import Any

from ..erc4337_constants import AA_ERROR_MESSAGES

_AA_ERROR_REGEX = re.compile(r"\b(AA[0-9]{2})\b")


class PaymentCreationError(Exception):
    """Error during ERC-4337 payment creation."""

    def __init__(
        self,
        message: str,
        phase: str = "validation",
        reason: str = "",
        network: str | None = None,
        code: str | None = None,
    ):
        super().__init__(message)
        self.phase = phase
        self.reason = reason
        self.network = network
        self.code = code


def parse_aa_error(error: Any) -> dict[str, str] | None:
    """Extract an AA error code from an error and return a human-readable reason.

    Args:
        error: The error to parse (Exception or string).

    Returns:
        Dict with 'code' and 'reason' keys, or None if no AA code found.
    """
    if error is None:
        return None

    message = str(error)
    match = _AA_ERROR_REGEX.search(message)
    if not match:
        return None

    code = match.group(1)
    reason = AA_ERROR_MESSAGES.get(code, "Unknown AA error")
    return {"code": code, "reason": reason}
