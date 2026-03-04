"""Transaction normalization for different wallet types (regular, Swig, etc.)."""

from dataclasses import dataclass

try:
    from solders.transaction import VersionedTransaction
except ImportError as e:
    raise ImportError(
        "SVM mechanism requires solana packages. Install with: pip install x402[svm]"
    ) from e

from .swig import NormalizedInstruction, is_swig_transaction, parse_swig_transaction
from .utils import get_token_payer_from_transaction


@dataclass
class NormalizedTransaction:
    """A flat instruction list and the address of the entity paying the token transfer."""

    instructions: list[NormalizedInstruction]
    payer: str


class SwigNormalizer:
    """Detects and flattens Swig smart-wallet transactions."""

    def can_handle(self, tx: VersionedTransaction) -> bool:
        return is_swig_transaction(tx)

    def normalize(self, tx: VersionedTransaction) -> NormalizedTransaction:
        result = parse_swig_transaction(tx)
        return NormalizedTransaction(
            instructions=result.instructions,
            payer=result.swig_pda,
        )


class RegularNormalizer:
    """Fallback normalizer for standard (non-smart-wallet) transactions."""

    def can_handle(self, tx: VersionedTransaction) -> bool:
        return True

    def normalize(self, tx: VersionedTransaction) -> NormalizedTransaction:
        payer = get_token_payer_from_transaction(tx)
        if not payer:
            raise ValueError("invalid_exact_svm_payload_no_transfer_instruction")
        instructions = [
            NormalizedInstruction(
                program_id_index=ix.program_id_index,
                accounts=list(ix.accounts),
                data=bytes(ix.data),
            )
            for ix in tx.message.instructions
        ]
        return NormalizedTransaction(instructions=instructions, payer=payer)


_DEFAULT_NORMALIZERS = [SwigNormalizer(), RegularNormalizer()]


def normalize_transaction(tx: VersionedTransaction) -> NormalizedTransaction:
    """Run the default normalizer chain and return the first successful result."""
    for normalizer in _DEFAULT_NORMALIZERS:
        if normalizer.can_handle(tx):
            return normalizer.normalize(tx)
    raise ValueError("no normalizer found for transaction")
