"""Tests for ERC-4337 error types."""

from x402.mechanisms.evm.exact.erc4337_errors import PaymentCreationError, parse_aa_error


class TestPaymentCreationError:
    def test_basic_creation(self):
        err = PaymentCreationError("test error")
        assert str(err) == "test error"
        assert err.phase == "validation"
        assert err.reason == ""
        assert err.network is None
        assert err.code is None

    def test_all_attributes(self):
        err = PaymentCreationError(
            "gas estimation failed",
            phase="preparation",
            reason="Insufficient funds for gas prefund",
            network="eip155:84532",
            code="AA21",
        )
        assert str(err) == "gas estimation failed"
        assert err.phase == "preparation"
        assert err.reason == "Insufficient funds for gas prefund"
        assert err.network == "eip155:84532"
        assert err.code == "AA21"

    def test_signing_phase(self):
        err = PaymentCreationError("sig failed", phase="signing")
        assert err.phase == "signing"

    def test_inherits_from_exception(self):
        err = PaymentCreationError("test")
        assert isinstance(err, Exception)

    def test_default_phase_is_validation(self):
        err = PaymentCreationError("msg")
        assert err.phase == "validation"

    def test_default_reason_is_empty_string(self):
        err = PaymentCreationError("msg")
        assert err.reason == ""

    def test_can_be_raised_and_caught(self):
        try:
            raise PaymentCreationError(
                "fail",
                phase="preparation",
                reason="AA24 Signature validation failed",
                code="AA24",
            )
        except PaymentCreationError as e:
            assert e.code == "AA24"
            assert e.phase == "preparation"


class TestParseAAError:
    def test_known_code_aa21(self):
        result = parse_aa_error("AA21 insufficient funds for gas prefund")
        assert result is not None
        assert result["code"] == "AA21"
        assert result["reason"] == "Insufficient funds for gas prefund"

    def test_known_code_aa24(self):
        result = parse_aa_error(Exception("AA24 signature error"))
        assert result is not None
        assert result["code"] == "AA24"
        assert result["reason"] == "Signature validation failed"

    def test_known_code_aa33(self):
        result = parse_aa_error("failed with AA33 paymaster reverted")
        assert result is not None
        assert result["code"] == "AA33"
        assert result["reason"] == "Paymaster reverted (or OOG)"

    def test_unknown_code_aa99(self):
        result = parse_aa_error("AA99 some unknown error")
        assert result is not None
        assert result["code"] == "AA99"
        assert result["reason"] == "Unknown AA error"

    def test_no_aa_code(self):
        result = parse_aa_error("some generic error without AA code")
        assert result is None

    def test_none_input(self):
        result = parse_aa_error(None)
        assert result is None

    def test_word_boundary_no_match_prefix(self):
        """'AA21' embedded in a longer word should not match thanks to word boundary."""
        result = parse_aa_error("errorAA21code")
        assert result is None

    def test_word_boundary_no_match_suffix(self):
        """'AA210' should not match AA21 since the regex uses word boundary."""
        result = parse_aa_error("error AA210 something")
        # AA21 has a word boundary at position 4 since '0' is a word char,
        # but AA210 does not match \bAA\d{2}\b because the '0' after is a word character
        # Actually, AA21 in AA210: \bAA21\b won't match because '0' follows.
        # But the regex is (AA[0-9]{2}), which matches AA21 in AA210.
        # Let's check: \b(AA[0-9]{2})\b on "AA210"
        # \b before A, AA21 matched, then \b after '1' checks if next char is non-word.
        # '0' is a word char, so \b fails. So AA21 should NOT match in AA210.
        assert result is None

    def test_word_boundary_match_with_spaces(self):
        """AA code surrounded by spaces matches."""
        result = parse_aa_error("error AA21 something")
        assert result is not None
        assert result["code"] == "AA21"

    def test_word_boundary_match_at_start(self):
        """AA code at start of string matches."""
        result = parse_aa_error("AA30 paymaster not deployed")
        assert result is not None
        assert result["code"] == "AA30"

    def test_word_boundary_match_at_end(self):
        """AA code at end of string matches."""
        result = parse_aa_error("error code AA51")
        assert result is not None
        assert result["code"] == "AA51"

    def test_exception_object(self):
        """parse_aa_error handles Exception objects."""
        result = parse_aa_error(Exception("AA25 nonce validation failed"))
        assert result is not None
        assert result["code"] == "AA25"

    def test_integer_input(self):
        """parse_aa_error handles non-string non-Exception inputs via str()."""
        result = parse_aa_error(12345)
        assert result is None

    def test_first_aa_code_wins(self):
        """When multiple AA codes present, the first one is returned."""
        result = parse_aa_error("AA21 then AA24 then AA33")
        assert result is not None
        assert result["code"] == "AA21"

    def test_empty_string_input(self):
        """parse_aa_error('') returns (None, None) -- i.e., None."""
        result = parse_aa_error("")
        assert result is None
