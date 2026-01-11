"""Tests for the error recovery example."""

import pytest

import sys
import os
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from error_recovery import ErrorType, ErrorStatistics, classify_error


class TestClassifyError:
    """Test error classification logic."""

    def test_classify_network_error(self):
        """Verify network errors are correctly classified."""
        errors = [
            Exception("network timeout"),
            Exception("Connection refused"),
            Exception("Host unreachable"),
            Exception("timeout waiting for response"),
        ]

        for error in errors:
            assert classify_error(error) == ErrorType.NETWORK

    def test_classify_balance_error(self):
        """Verify balance errors are correctly classified."""
        errors = [
            Exception("Insufficient balance"),
            Exception("Not enough funds"),
            Exception("insufficient funds for transfer"),
        ]

        for error in errors:
            assert classify_error(error) == ErrorType.INSUFFICIENT_BALANCE

    def test_classify_signing_error(self):
        """Verify signing errors are correctly classified."""
        errors = [
            Exception("Failed to sign transaction"),
            Exception("Invalid signature"),
            Exception("private key error"),
        ]

        for error in errors:
            assert classify_error(error) == ErrorType.SIGNING_ERROR

    def test_classify_validation_error(self):
        """Verify validation errors are correctly classified."""
        errors = [
            Exception("Invalid payment requirements"),
            Exception("Malformed request"),
            Exception("validation failed"),
        ]

        for error in errors:
            assert classify_error(error) == ErrorType.VALIDATION_ERROR

    def test_classify_unknown_error(self):
        """Verify unknown errors are correctly classified."""
        errors = [
            Exception("Something went wrong"),
            Exception("Unexpected error"),
            Exception("foo bar baz"),
        ]

        for error in errors:
            assert classify_error(error) == ErrorType.UNKNOWN


class TestErrorStatistics:
    """Test error statistics tracking."""

    def test_initial_state(self):
        """Verify initial statistics state."""
        stats = ErrorStatistics()

        assert stats.recovery_attempts == 0
        assert stats.successful_recoveries == 0
        assert stats.errors_by_type == {}

    def test_record_error(self):
        """Verify error recording increments counts."""
        stats = ErrorStatistics()

        stats.record_error(ErrorType.NETWORK)
        assert stats.recovery_attempts == 1
        assert stats.errors_by_type[ErrorType.NETWORK] == 1

        stats.record_error(ErrorType.NETWORK)
        assert stats.recovery_attempts == 2
        assert stats.errors_by_type[ErrorType.NETWORK] == 2

    def test_record_multiple_error_types(self):
        """Verify multiple error types are tracked separately."""
        stats = ErrorStatistics()

        stats.record_error(ErrorType.NETWORK)
        stats.record_error(ErrorType.SIGNING_ERROR)
        stats.record_error(ErrorType.NETWORK)

        assert stats.recovery_attempts == 3
        assert stats.errors_by_type[ErrorType.NETWORK] == 2
        assert stats.errors_by_type[ErrorType.SIGNING_ERROR] == 1

    def test_record_recovery(self):
        """Verify recovery recording increments count."""
        stats = ErrorStatistics()

        stats.record_recovery()
        assert stats.successful_recoveries == 1

        stats.record_recovery()
        assert stats.successful_recoveries == 2

    def test_print_summary(self, capsys):
        """Verify summary prints correctly."""
        stats = ErrorStatistics()
        stats.record_error(ErrorType.NETWORK)
        stats.record_error(ErrorType.SIGNING_ERROR)
        stats.record_recovery()

        stats.print_summary()

        captured = capsys.readouterr()
        assert "Error Recovery Statistics" in captured.out
        assert "Total recovery attempts: 2" in captured.out
        assert "Successful recoveries: 1" in captured.out


class TestErrorRecoveryFlow:
    """Test error recovery flow with hooks."""

    def test_recovery_hook_receives_error(
        self,
        test_account,
        mock_payment_required,
    ):
        """Verify failure hook receives error context."""
        from x402 import x402Client
        from x402.mechanisms.evm import EthAccountSigner
        from x402.mechanisms.evm.exact import ExactEvmScheme
        from x402.schemas import PaymentCreationFailureContext
        from unittest.mock import MagicMock, patch

        received_errors = []

        def failure_hook(context: PaymentCreationFailureContext):
            received_errors.append(context.error)
            return None

        client = x402Client()
        # Register scheme but mock it to fail
        scheme = ExactEvmScheme(EthAccountSigner(test_account))
        client.register("eip155:84532", scheme)
        client.on_payment_creation_failure(failure_hook)

        # Patch the scheme to raise an error
        with patch.object(scheme, 'create_payment_payload', side_effect=Exception("Test error")):
            with pytest.raises(Exception, match="Test error"):
                client.create_payment_payload(mock_payment_required)

        # Verify hook was called with error
        assert len(received_errors) == 1
        assert "Test error" in str(received_errors[0])

    def test_statistics_integration(self):
        """Verify statistics track errors from hooks correctly."""
        stats = ErrorStatistics()

        # Simulate error recovery flow
        def handle_error(error: Exception) -> bool:
            error_type = classify_error(error)
            stats.record_error(error_type)

            if error_type == ErrorType.NETWORK:
                stats.record_recovery()
                return True  # Recovered
            return False  # Not recovered

        # Simulate various errors
        assert handle_error(Exception("network timeout")) is True
        assert handle_error(Exception("insufficient balance")) is False
        assert handle_error(Exception("connection refused")) is True

        # Verify statistics
        assert stats.recovery_attempts == 3
        assert stats.successful_recoveries == 2
        assert stats.errors_by_type[ErrorType.NETWORK] == 2
        assert stats.errors_by_type[ErrorType.INSUFFICIENT_BALANCE] == 1
