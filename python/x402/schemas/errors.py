"""Error types for the x402 Python SDK."""


class PaymentError(Exception):
    """Base class for x402 payment errors."""

    pass


class VerifyError(PaymentError):
    """Error during payment verification.

    Attributes:
        reason: Human-readable reason for the error.
        payer: The payer's address (if known).
    """

    def __init__(self, reason: str, payer: str | None = None):
        self.reason = reason
        self.payer = payer
        super().__init__(f"Verification failed: {reason}")


class SettleError(PaymentError):
    """Error during payment settlement.

    Attributes:
        reason: Human-readable reason for the error.
        transaction: Transaction hash/identifier (if available).
        payer: The payer's address (if known).
    """

    def __init__(
        self,
        reason: str,
        transaction: str | None = None,
        payer: str | None = None,
    ):
        self.reason = reason
        self.transaction = transaction
        self.payer = payer
        super().__init__(f"Settlement failed: {reason}")


class SchemeNotFoundError(PaymentError):
    """No registered scheme found for scheme/network combination.

    Attributes:
        scheme: The requested scheme.
        network: The requested network.
    """

    def __init__(self, scheme: str, network: str):
        self.scheme = scheme
        self.network = network
        super().__init__(f"No scheme '{scheme}' registered for network '{network}'")


class NoMatchingRequirementsError(PaymentError):
    """No payment requirements match registered schemes."""

    pass


class PaymentAbortedError(PaymentError):
    """Payment was aborted by a before hook.

    Attributes:
        reason: The reason for aborting.
    """

    def __init__(self, reason: str):
        self.reason = reason
        super().__init__(f"Payment aborted: {reason}")

