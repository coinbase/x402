from x402.server import (
    AbortResult,
    RecoveredSettleResult,
    RecoveredVerifyResult,
    SettleContext,
    SettleFailureContext,
    SettleResponse,
    SettleResultContext,
    VerifyContext,
    VerifyFailureContext,
    VerifyResponse,
    VerifyResultContext,
)


def before_verify_hook(context: VerifyContext) -> None | AbortResult:
    """
    Before verify hook is called before verification
    return an AbortResult to abort the verification

    Args:
        context: VerifyContext

    Returns:
        None | AbortResult
    """
    print(f"Before verify hook: {context}")

    if False:
        return AbortResult(reason="Verification aborted")

def after_verify_hook(context: VerifyResultContext) -> None:
    """
    After verify hook is called after successful verification

    Args:
        context: VerifyResultContext

    Returns:
        None
    """
    print(f"After verify hook: {context}")

def on_verify_failure_hook(context: VerifyFailureContext) -> None | RecoveredVerifyResult:
    """
    On verify failure hook is called when verification fails

    Args:
        context: VerifyFailureContext

    Returns:
        None | RecoveredVerifyResult
    """
    print(f"On verify failure hook: {context}")

    if False:
        return RecoveredVerifyResult(result=VerifyResponse(is_valid=True, invalid_reason="Recovered from failure"))

def before_settle_hook(context: SettleContext) -> None:
    """
    Before settle hook is called before settlement
    return an AbortResult to abort the settlement

    Args:
        context: SettleContext

    Returns:
        None | AbortResult
    """
    print(f"Before settle hook: {context}")

    if False:
        return AbortResult(reason="Settlement aborted")


def after_settle_hook(context: SettleResultContext) -> None:
    """
    After settle hook is called after successful settlement

    Args:
        context: SettleResultContext

    Returns:
        None
    """
    print(f"After settle hook: {context}")

def on_settle_failure_hook(context: SettleFailureContext) -> None | RecoveredSettleResult:
    """
    On settle failure hook is called when settlement fails
    return a result with Recovered=true to recover from the failure

    Args:
        context: SettleFailureContext

    Returns:
        None | RecoveredSettleResult
    """
    print(f"On settle failure hook: {context}")

    if False:
        return RecoveredSettleResult(result=SettleResponse(success=True, transaction="0x123..."))
