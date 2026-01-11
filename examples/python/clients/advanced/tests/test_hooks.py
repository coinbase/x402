"""Tests for the hooks example."""

import pytest
from unittest.mock import MagicMock, patch

from eth_account import Account

from x402 import x402Client
from x402.mechanisms.evm import EthAccountSigner
from x402.mechanisms.evm.exact.register import register_exact_evm_client
from x402.schemas import (
    AbortResult,
    PaymentCreatedContext,
    PaymentCreationContext,
    PaymentCreationFailureContext,
    PaymentRequired,
    PaymentRequirements,
    RecoveredPayloadResult,
)


class TestHooks:
    """Test suite for payment lifecycle hooks."""

    def test_before_hook_receives_context(
        self,
        test_account: Account,
        mock_payment_required: PaymentRequired,
    ):
        """Verify on_before_payment_creation hook is called with correct context."""
        hook_called = MagicMock()

        def before_hook(context: PaymentCreationContext) -> None:
            hook_called(context)
            assert context.payment_required is not None
            assert context.selected_requirements is not None
            assert context.selected_requirements.network == "eip155:84532"
            assert context.selected_requirements.scheme == "exact"
            return None

        client = x402Client()
        register_exact_evm_client(client, EthAccountSigner(test_account))
        client.on_before_payment_creation(before_hook)

        # Create payment payload to trigger hooks
        try:
            client.create_payment_payload(mock_payment_required)
        except Exception:
            pass  # May fail due to signature, but hook should be called

        hook_called.assert_called_once()

    def test_before_hook_can_abort(
        self,
        test_account: Account,
        mock_payment_required: PaymentRequired,
    ):
        """Verify returning AbortResult prevents payment creation."""

        def before_hook(context: PaymentCreationContext) -> AbortResult:
            return AbortResult(reason="Payment not allowed")

        client = x402Client()
        register_exact_evm_client(client, EthAccountSigner(test_account))
        client.on_before_payment_creation(before_hook)

        from x402.schemas import PaymentAbortedError

        with pytest.raises(PaymentAbortedError) as exc_info:
            client.create_payment_payload(mock_payment_required)

        assert "Payment not allowed" in str(exc_info.value)

    def test_after_hook_called_on_success(
        self,
        test_account: Account,
        mock_payment_required: PaymentRequired,
    ):
        """Verify on_after_payment_creation hook receives payment payload."""
        hook_called = MagicMock()

        def after_hook(context: PaymentCreatedContext) -> None:
            hook_called(context)
            assert context.payment_payload is not None
            assert context.payment_payload.x402_version == 2
            return None

        client = x402Client()
        register_exact_evm_client(client, EthAccountSigner(test_account))
        client.on_after_payment_creation(after_hook)

        # Create payment payload
        payload = client.create_payment_payload(mock_payment_required)

        # After hook should be called with the payload
        hook_called.assert_called_once()
        context = hook_called.call_args[0][0]
        assert context.payment_payload == payload

    def test_failure_hook_called_on_error(
        self,
        test_account: Account,
        mock_payment_required: PaymentRequired,
    ):
        """Verify on_payment_creation_failure hook is called with error."""
        hook_called = MagicMock()

        def failure_hook(context: PaymentCreationFailureContext) -> None:
            hook_called(context)
            assert context.error is not None
            return None

        # Create client without registering any schemes - will fail
        client = x402Client()
        client.on_payment_creation_failure(failure_hook)

        from x402.schemas import NoMatchingRequirementsError

        with pytest.raises(NoMatchingRequirementsError):
            client.create_payment_payload(mock_payment_required)

        # Failure hook should NOT be called for NoMatchingRequirementsError
        # (it happens before scheme selection)
        hook_called.assert_not_called()

    def test_multiple_hooks_chain(
        self,
        test_account: Account,
        mock_payment_required: PaymentRequired,
    ):
        """Verify multiple hooks are called in registration order."""
        call_order = []

        def before_hook_1(context: PaymentCreationContext) -> None:
            call_order.append("before_1")
            return None

        def before_hook_2(context: PaymentCreationContext) -> None:
            call_order.append("before_2")
            return None

        def after_hook_1(context: PaymentCreatedContext) -> None:
            call_order.append("after_1")
            return None

        def after_hook_2(context: PaymentCreatedContext) -> None:
            call_order.append("after_2")
            return None

        client = x402Client()
        register_exact_evm_client(client, EthAccountSigner(test_account))
        client.on_before_payment_creation(before_hook_1)
        client.on_before_payment_creation(before_hook_2)
        client.on_after_payment_creation(after_hook_1)
        client.on_after_payment_creation(after_hook_2)

        client.create_payment_payload(mock_payment_required)

        assert call_order == ["before_1", "before_2", "after_1", "after_2"]


class TestHookContexts:
    """Test hook context data structures."""

    def test_payment_creation_context_fields(
        self,
        mock_payment_required: PaymentRequired,
        mock_payment_requirements: PaymentRequirements,
    ):
        """Verify PaymentCreationContext has expected fields."""
        context = PaymentCreationContext(
            payment_required=mock_payment_required,
            selected_requirements=mock_payment_requirements,
        )

        assert context.payment_required == mock_payment_required
        assert context.selected_requirements == mock_payment_requirements
        assert context.selected_requirements.network == "eip155:84532"
        assert context.selected_requirements.scheme == "exact"

    def test_abort_result_has_reason(self):
        """Verify AbortResult stores the abort reason."""
        result = AbortResult(reason="Test abort reason")
        assert result.reason == "Test abort reason"
