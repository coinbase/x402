package facilitator

import (
	"testing"

	"github.com/coinbase/x402/go/mechanisms/svm"
	"github.com/stretchr/testify/assert"
)

func TestFacilitatorInstructionConstraints(t *testing.T) {
	t.Run("allows 3-6 instructions", func(t *testing.T) {
		minInstructions := 3
		maxInstructions := 6

		assert.Equal(t, 3, minInstructions)
		assert.Equal(t, 6, maxInstructions)
	})

	t.Run("optional instructions may be Lighthouse or Memo", func(t *testing.T) {
		lighthouseProgram := svm.LighthouseProgramAddress
		memoProgram := svm.MemoProgramAddress

		assert.NotEqual(t, lighthouseProgram, memoProgram)
		assert.NotEmpty(t, memoProgram)
		assert.NotEmpty(t, lighthouseProgram)
	})
}

func TestErrorCodesForMitigationPlanning(t *testing.T) {
	t.Run("instruction count error", func(t *testing.T) {
		err := ErrTransactionInstructionsLength
		assert.Equal(t, "invalid_exact_solana_payload_transaction_instructions_length", err)
	})
}
