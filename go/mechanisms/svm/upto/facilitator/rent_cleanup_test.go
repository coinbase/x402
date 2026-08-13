package facilitator

import (
	"context"
	"sync"
	"testing"
	"time"

	solana "github.com/gagliardetto/solana-go"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"

	"github.com/x402-foundation/x402/go/v2/mechanisms/svm"
	"github.com/x402-foundation/x402/go/v2/mechanisms/svm/paymentchannels"
)

// cleanupHarness is a rent cleanup manager over the stub RPC with a live
// channel account per stored record.
type cleanupHarness struct {
	t       *testing.T
	signer  *mockSigner
	stub    *stubRPC
	storage *InMemoryChannelStorage
	manager *RentCleanupManager

	payer solana.PublicKey
	payTo solana.PublicKey

	// mu guards the recorders below: reclaim batches for independent rent
	// payers now run concurrently, so their callbacks can fire in parallel.
	mu              sync.Mutex
	closes          []CloseResult
	reclaims        []ReclaimResult
	errors          []error
	errorChannelIDs []string
}

func newCleanupHarness(t *testing.T) *cleanupHarness {
	t.Helper()

	signer := newMockSigner(t, 1)
	payer, err := solana.NewRandomPrivateKey()
	require.NoError(t, err)
	payTo, err := solana.NewRandomPrivateKey()
	require.NoError(t, err)

	harness := &cleanupHarness{
		t:       t,
		signer:  signer,
		stub:    newStubRPC(t),
		storage: NewInMemoryChannelStorage(),
		payer:   payer.PublicKey(),
		payTo:   payTo.PublicKey(),
	}
	harness.manager = NewRentCleanupManager(RentCleanupConfig{
		Signer:  signer,
		Storage: harness.storage,
		Network: testNetwork,
		RPCURL:  harness.stub.url,
	})
	return harness
}

// options wires the harness recorders into a bounded cleanup pass.
func (h *cleanupHarness) options(opts CleanupOptions) CleanupOptions {
	opts.OnClose = func(result CloseResult) {
		h.mu.Lock()
		defer h.mu.Unlock()
		h.closes = append(h.closes, result)
	}
	opts.OnReclaim = func(result ReclaimResult) {
		h.mu.Lock()
		defer h.mu.Unlock()
		h.reclaims = append(h.reclaims, result)
	}
	opts.OnError = func(err error, channelID string) {
		h.mu.Lock()
		defer h.mu.Unlock()
		h.errors = append(h.errors, err)
		h.errorChannelIDs = append(h.errorChannelIDs, channelID)
	}
	return opts
}

// seedRecord stores a channel record and publishes its live account.
func (h *cleanupHarness) seedRecord(record ChannelRecord, account channelAccount) ChannelRecord {
	h.t.Helper()

	if record.ChannelID == "" {
		key, err := solana.NewRandomPrivateKey()
		require.NoError(h.t, err)
		record.ChannelID = key.PublicKey().String()
	}
	if record.TokenProgram == "" {
		record.TokenProgram = solana.TokenProgramID.String()
	}
	if record.Network == "" {
		record.Network = testNetwork
	}
	if record.FirstSeenAt.IsZero() {
		record.FirstSeenAt = time.Now().Add(-2 * time.Hour)
	}
	require.NoError(h.t, h.storage.Upsert(context.Background(), record))
	h.stub.setAccount(record.ChannelID, account.encode(h.t))
	return record
}

// channel is the live account for a stored channel in the given status.
func (h *cleanupHarness) channel(status paymentchannels.ChannelStatus, openSlot uint64) channelAccount {
	return channelAccount{
		Status:      status,
		Deposit:     10_000,
		GracePeriod: 3600,
		Payer:       h.payer,
		Payee:       h.signer.feePayer(),
		RentPayer:   h.signer.feePayer(),
		Mint:        solana.MustPublicKeyFromBase58(svm.USDCDevnetAddress),
		OpenSlot:    openSlot,
		Splits: []paymentchannels.Split{
			{Recipient: h.payTo.String(), BPS: paymentchannels.BasisPointsDenominator},
		},
	}
}

func (h *cleanupHarness) exists(channelID string) bool {
	h.t.Helper()
	record, err := h.storage.Get(context.Background(), channelID)
	require.NoError(h.t, err)
	return record != nil
}

func (h *cleanupHarness) sentInstructionData(index int) [][]byte {
	h.t.Helper()
	sent := h.signer.sentTransactions()
	require.Greater(h.t, len(sent), index)

	data := make([][]byte, 0, len(sent[index].Message.Instructions))
	for _, instruction := range sent[index].Message.Instructions {
		data = append(data, instruction.Data)
	}
	return data
}

// closeAccountOnSend removes the channel account once the close lands, matching
// the program closing the PDA.
func (h *cleanupHarness) closeAccountOnSend(channelID string) {
	h.signer.onSend = func(*solana.Transaction) { h.stub.deleteAccount(channelID) }
}

func TestCleanupDefersOpenChannelsUntilExpiryPlusGrace(t *testing.T) {
	tests := []struct {
		name        string
		expiresIn   int64
		firstSeenAt time.Time
		wantClose   bool
	}{
		{
			name:      "before expiry",
			expiresIn: 300,
			wantClose: false,
		},
		{
			name:        "before expiry even when first seen long ago",
			expiresIn:   300,
			firstSeenAt: time.Now().Add(-2 * time.Hour),
			wantClose:   false,
		},
		{
			name:      "inside the grace period",
			expiresIn: -60,
			wantClose: false,
		},
		{
			name:      "after expiry plus grace",
			expiresIn: -200,
			wantClose: true,
		},
	}

	for _, test := range tests {
		t.Run(test.name, func(t *testing.T) {
			harness := newCleanupHarness(t)
			record := harness.seedRecord(
				ChannelRecord{
					PayTo:       harness.payTo.String(),
					ExpiresAt:   time.Now().Unix() + test.expiresIn,
					FirstSeenAt: test.firstSeenAt,
				},
				harness.channel(paymentchannels.StatusOpen, testSlot),
			)
			harness.closeAccountOnSend(record.ChannelID)

			require.NoError(t, harness.manager.Cleanup(
				context.Background(),
				harness.options(CleanupOptions{AbandonGraceSecs: 120}),
			))

			if !test.wantClose {
				assert.Empty(t, harness.closes)
				assert.Empty(t, harness.signer.sentTransactions())
				assert.True(t, harness.exists(record.ChannelID), "an unexpired channel stays tracked")
				return
			}

			require.Len(t, harness.closes, 1)
			assert.Equal(t, record.ChannelID, harness.closes[0].ChannelID)
			assert.Equal(t, CloseActionAbandonClose, harness.closes[0].Action)

			// Sealing at the current watermark refunds the remainder, so the
			// abandoned channel needs settle_and_seal before distribute.
			data := harness.sentInstructionData(0)
			require.Len(t, data, 2)
			assert.Equal(t, paymentchannels.SettleAndSealDiscriminator, data[0][0])
			assert.Equal(t, paymentchannels.DistributeDiscriminator, data[1][0])
			assert.False(t, harness.exists(record.ChannelID), "a closed channel is untracked")
		})
	}
}

func TestCleanupDistributesSealedChannels(t *testing.T) {
	harness := newCleanupHarness(t)
	record := harness.seedRecord(
		ChannelRecord{PayTo: harness.payTo.String(), ExpiresAt: time.Now().Unix() + 3600},
		harness.channel(paymentchannels.StatusSealed, testSlot),
	)
	harness.closeAccountOnSend(record.ChannelID)

	require.NoError(t, harness.manager.Cleanup(context.Background(), harness.options(CleanupOptions{})))

	require.Len(t, harness.closes, 1)
	assert.Equal(t, CloseActionDistribute, harness.closes[0].Action)

	// A sealed channel already has its watermark frozen.
	data := harness.sentInstructionData(0)
	require.Len(t, data, 1)
	assert.Equal(t, paymentchannels.DistributeDiscriminator, data[0][0])
	assert.False(t, harness.exists(record.ChannelID))
}

func TestCleanupDefersClosingChannels(t *testing.T) {
	harness := newCleanupHarness(t)
	record := harness.seedRecord(
		ChannelRecord{PayTo: harness.payTo.String(), ExpiresAt: time.Now().Unix() - 3600},
		harness.channel(paymentchannels.StatusClosing, testSlot),
	)

	require.NoError(t, harness.manager.Cleanup(context.Background(), harness.options(CleanupOptions{})))

	assert.Empty(t, harness.closes)
	assert.Empty(t, harness.reclaims)
	assert.Empty(t, harness.signer.sentTransactions())
	assert.True(t, harness.exists(record.ChannelID), "an in-flight close stays tracked")
}

func TestCleanupDropsRecordsWhoseChannelIsGone(t *testing.T) {
	harness := newCleanupHarness(t)
	record := harness.seedRecord(
		ChannelRecord{PayTo: harness.payTo.String(), ExpiresAt: time.Now().Unix() - 3600},
		harness.channel(paymentchannels.StatusOpen, testSlot),
	)
	harness.stub.deleteAccount(record.ChannelID)

	require.NoError(t, harness.manager.Cleanup(context.Background(), harness.options(CleanupOptions{})))

	assert.Empty(t, harness.signer.sentTransactions())
	assert.False(t, harness.exists(record.ChannelID))
}

func TestCleanupDefersReclaimUntilTheOpenSlotGate(t *testing.T) {
	harness := newCleanupHarness(t)
	// The reclaim gate needs currentSlot > openSlot + OpenSlotWindow.
	record := harness.seedRecord(
		ChannelRecord{PayTo: harness.payTo.String(), ExpiresAt: time.Now().Unix() - 3600},
		harness.channel(paymentchannels.StatusDistributed, testSlot-10),
	)

	require.NoError(t, harness.manager.Cleanup(context.Background(), harness.options(CleanupOptions{})))

	assert.Empty(t, harness.reclaims)
	assert.Empty(t, harness.signer.sentTransactions())
	assert.True(t, harness.exists(record.ChannelID))
}

func TestCleanupBatchReclaimsDistributedChannels(t *testing.T) {
	harness := newCleanupHarness(t)
	openSlot := testSlot - paymentchannels.OpenSlotWindow - 1
	first := harness.seedRecord(
		ChannelRecord{PayTo: harness.payTo.String()},
		harness.channel(paymentchannels.StatusDistributed, openSlot),
	)
	second := harness.seedRecord(
		ChannelRecord{PayTo: harness.payTo.String()},
		harness.channel(paymentchannels.StatusDistributed, openSlot),
	)

	require.NoError(t, harness.manager.Cleanup(context.Background(), harness.options(CleanupOptions{})))

	require.Len(t, harness.reclaims, 1)
	assert.ElementsMatch(t, []string{first.ChannelID, second.ChannelID}, harness.reclaims[0].ChannelIDs)

	data := harness.sentInstructionData(0)
	require.Len(t, data, 2)
	for _, instruction := range data {
		assert.Equal(t, paymentchannels.ReclaimDiscriminator, instruction[0])
	}
	assert.False(t, harness.exists(first.ChannelID))
	assert.False(t, harness.exists(second.ChannelID))
}

func TestCleanupRespectsReclaimBatchCaps(t *testing.T) {
	harness := newCleanupHarness(t)
	openSlot := testSlot - paymentchannels.OpenSlotWindow - 1
	for i := 0; i < 3; i++ {
		harness.seedRecord(
			ChannelRecord{PayTo: harness.payTo.String()},
			harness.channel(paymentchannels.StatusDistributed, openSlot),
		)
	}

	require.NoError(t, harness.manager.Cleanup(context.Background(), harness.options(CleanupOptions{
		MaxReclaimsPerTx: 2,
		MaxTxsPerRun:     1,
	})))

	require.Len(t, harness.reclaims, 1)
	assert.Len(t, harness.reclaims[0].ChannelIDs, 2)
	assert.Len(t, harness.signer.sentTransactions(), 1)
}

// rotateFromCursor resumes a stable-ordered backlog (e.g. Mongo-backed
// storage) from where the previous pass's budget ran out, so a backlog
// bigger than MaxTxsPerRun eventually reaches every record instead of only
// ever reprocessing the same earliest ones.
func TestRotateFromCursor(t *testing.T) {
	records := []ChannelRecord{{ChannelID: "a"}, {ChannelID: "b"}, {ChannelID: "c"}}

	assert.Equal(t, records, rotateFromCursor(records, ""), "no cursor scans from the start")
	assert.Equal(t,
		[]ChannelRecord{{ChannelID: "b"}, {ChannelID: "c"}, {ChannelID: "a"}},
		rotateFromCursor(records, "b"),
	)
	assert.Equal(t,
		[]ChannelRecord{{ChannelID: "c"}, {ChannelID: "a"}, {ChannelID: "b"}},
		rotateFromCursor(records, "c"),
	)
	assert.Equal(t, records, rotateFromCursor(records, "gone"), "a cursor no longer present scans from the start")
}

// TestCleanupResumesScanningFromTheCursorAfterTheBudgetRunsOut proves the
// manager records where a budget-limited pass stopped and clears it once a
// pass scans everything, rather than always restarting from the beginning.
func TestCleanupResumesScanningFromTheCursorAfterTheBudgetRunsOut(t *testing.T) {
	harness := newCleanupHarness(t)
	first := harness.seedRecord(
		ChannelRecord{PayTo: harness.payTo.String(), ExpiresAt: time.Now().Unix() - 3600},
		harness.channel(paymentchannels.StatusSealed, testSlot),
	)
	second := harness.seedRecord(
		ChannelRecord{PayTo: harness.payTo.String(), ExpiresAt: time.Now().Unix() - 3600},
		harness.channel(paymentchannels.StatusSealed, testSlot),
	)

	require.NoError(t, harness.manager.Cleanup(context.Background(), harness.options(CleanupOptions{
		MaxTxsPerRun: 1,
	})))
	require.Len(t, harness.closes, 1)
	assert.Contains(t, []string{first.ChannelID, second.ChannelID}, harness.manager.scanCursor)
	assert.NotEqual(t, harness.closes[0].ChannelID, harness.manager.scanCursor,
		"the cursor points at the unprocessed record, not the one just closed")
	cursorAfterFirstPass := harness.manager.scanCursor

	require.NoError(t, harness.manager.Cleanup(context.Background(), harness.options(CleanupOptions{})))
	require.True(t, len(harness.closes) >= 2)
	assert.Equal(t, cursorAfterFirstPass, harness.closes[1].ChannelID,
		"the second pass acts on the record the cursor pointed at first")
	assert.Empty(t, harness.manager.scanCursor, "a pass that scans every remaining record clears the cursor")
}

func TestCleanupCapsClosesPerRun(t *testing.T) {
	harness := newCleanupHarness(t)
	for i := 0; i < 3; i++ {
		harness.seedRecord(
			ChannelRecord{PayTo: harness.payTo.String(), ExpiresAt: time.Now().Unix() - 3600},
			harness.channel(paymentchannels.StatusSealed, testSlot),
		)
	}

	require.NoError(t, harness.manager.Cleanup(context.Background(), harness.options(CleanupOptions{
		MaxClosesPerRun: 2,
	})))

	assert.Len(t, harness.closes, 2)
	assert.Len(t, harness.signer.sentTransactions(), 2)
}

func TestCleanupSkipsChannelsThatChangedSinceTheListingPass(t *testing.T) {
	harness := newCleanupHarness(t)
	openSlot := testSlot - paymentchannels.OpenSlotWindow - 1
	record := harness.seedRecord(
		ChannelRecord{PayTo: harness.payTo.String()},
		harness.channel(paymentchannels.StatusDistributed, openSlot),
	)
	// A concurrent settle closed the account between listing and reclaim.
	harness.stub.deleteAccountAfter(record.ChannelID, 1)

	require.NoError(t, harness.manager.Cleanup(context.Background(), harness.options(CleanupOptions{})))

	assert.Empty(t, harness.reclaims)
	assert.Empty(t, harness.signer.sentTransactions())
	assert.False(t, harness.exists(record.ChannelID))
}

func TestCleanupSurfacesUnusableRecords(t *testing.T) {
	otherKey, err := solana.NewRandomPrivateKey()
	require.NoError(t, err)

	tests := []struct {
		name        string
		omitPayTo   bool
		record      ChannelRecord
		mutate      func(account *channelAccount)
		wantMessage string
	}{
		{
			name:        "missing payTo",
			omitPayTo:   true,
			wantMessage: "no stored payTo",
		},
		{
			name:        "invalid stored token program",
			record:      ChannelRecord{TokenProgram: "not-base58"},
			wantMessage: "invalid stored tokenProgram",
		},
		{
			name: "channel key outside the signer set",
			mutate: func(account *channelAccount) {
				account.Payee = otherKey.PublicKey()
				account.RentPayer = otherKey.PublicKey()
			},
			wantMessage: "not in the facilitator signer set",
		},
	}

	for _, test := range tests {
		t.Run(test.name, func(t *testing.T) {
			harness := newCleanupHarness(t)
			record := test.record
			if !test.omitPayTo {
				record.PayTo = harness.payTo.String()
			}
			record.ExpiresAt = time.Now().Unix() - 3600

			account := harness.channel(paymentchannels.StatusOpen, testSlot)
			if test.mutate != nil {
				test.mutate(&account)
			}
			stored := harness.seedRecord(record, account)

			require.NoError(t, harness.manager.Cleanup(context.Background(), harness.options(CleanupOptions{})))

			assert.Empty(t, harness.closes)
			assert.Empty(t, harness.signer.sentTransactions())
			require.Len(t, harness.errors, 1)
			assert.ErrorContains(t, harness.errors[0], test.wantMessage)
			assert.True(t, harness.exists(stored.ChannelID), "an unusable record is left for an operator")
		})
	}
}

func TestCleanupIgnoresRecordsFromOtherNetworks(t *testing.T) {
	harness := newCleanupHarness(t)
	record := harness.seedRecord(
		ChannelRecord{
			PayTo:     harness.payTo.String(),
			ExpiresAt: time.Now().Unix() - 3600,
			Network:   "solana",
		},
		harness.channel(paymentchannels.StatusSealed, testSlot),
	)

	require.NoError(t, harness.manager.Cleanup(context.Background(), harness.options(CleanupOptions{})))

	assert.Empty(t, harness.closes)
	assert.Empty(t, harness.signer.sentTransactions())
	assert.True(t, harness.exists(record.ChannelID))
}

func TestCleanupReportsBroadcastFailures(t *testing.T) {
	harness := newCleanupHarness(t)
	harness.signer.sendErr = assert.AnError
	record := harness.seedRecord(
		ChannelRecord{PayTo: harness.payTo.String(), ExpiresAt: time.Now().Unix() - 3600},
		harness.channel(paymentchannels.StatusSealed, testSlot),
	)

	require.NoError(t, harness.manager.Cleanup(context.Background(), harness.options(CleanupOptions{})))

	assert.Empty(t, harness.closes)
	require.Len(t, harness.errors, 1)
	assert.True(t, harness.exists(record.ChannelID), "a failed close is retried on the next pass")
}

// Abandon-closing one second early would seal a channel the client can still
// spend against, so the grace boundary is exact.
func TestCleanupAbandonCloseBoundaryIsExact(t *testing.T) {
	const grace = int64(120)

	tests := []struct {
		name      string
		offset    int64
		wantClose bool
	}{
		{name: "one second before the grace period elapses", offset: 1, wantClose: false},
		{name: "exactly at the grace period", offset: 0, wantClose: true},
		{name: "one second after the grace period", offset: -1, wantClose: true},
	}

	for _, test := range tests {
		t.Run(test.name, func(t *testing.T) {
			harness := newCleanupHarness(t)
			record := harness.seedRecord(
				ChannelRecord{
					PayTo:     harness.payTo.String(),
					ExpiresAt: time.Now().Unix() - grace + test.offset,
				},
				harness.channel(paymentchannels.StatusOpen, testSlot),
			)
			harness.closeAccountOnSend(record.ChannelID)

			require.NoError(t, harness.manager.Cleanup(
				context.Background(), harness.options(CleanupOptions{AbandonGraceSecs: grace}),
			))

			assert.Len(t, harness.closes, map[bool]int{true: 1, false: 0}[test.wantClose])
		})
	}
}

// The program rejects a reclaim inside the open-slot window, so submitting one
// slot early only burns fees.
func TestCleanupReclaimGateBoundaryIsExact(t *testing.T) {
	tests := []struct {
		name        string
		openSlot    uint64
		wantReclaim bool
	}{
		{name: "exactly at the gate", openSlot: testSlot - paymentchannels.OpenSlotWindow, wantReclaim: false},
		{name: "one slot past the gate", openSlot: testSlot - paymentchannels.OpenSlotWindow - 1, wantReclaim: true},
	}

	for _, test := range tests {
		t.Run(test.name, func(t *testing.T) {
			harness := newCleanupHarness(t)
			record := harness.seedRecord(
				ChannelRecord{PayTo: harness.payTo.String()},
				harness.channel(paymentchannels.StatusDistributed, test.openSlot),
			)

			require.NoError(t, harness.manager.Cleanup(context.Background(), harness.options(CleanupOptions{})))

			assert.Len(t, harness.reclaims, map[bool]int{true: 1, false: 0}[test.wantReclaim])
			assert.Equal(t, !test.wantReclaim, harness.exists(record.ChannelID))
		})
	}
}

func TestCleanupSplitsReclaimsAcrossTransactions(t *testing.T) {
	harness := newCleanupHarness(t)
	openSlot := testSlot - paymentchannels.OpenSlotWindow - 1
	for i := 0; i < 5; i++ {
		harness.seedRecord(
			ChannelRecord{PayTo: harness.payTo.String()},
			harness.channel(paymentchannels.StatusDistributed, openSlot),
		)
	}

	require.NoError(t, harness.manager.Cleanup(context.Background(), harness.options(CleanupOptions{
		MaxReclaimsPerTx: 2,
		MaxTxsPerRun:     3,
	})))

	require.Len(t, harness.reclaims, 3)
	reclaimed := 0
	for _, result := range harness.reclaims {
		assert.LessOrEqual(t, len(result.ChannelIDs), 2)
		reclaimed += len(result.ChannelIDs)
	}
	assert.Equal(t, 5, reclaimed, "every ready channel is reclaimed across the batches")
	assert.Len(t, harness.signer.sentTransactions(), 3)
}

// Reclaims are budgeted separately from closes, so a spent close budget must not
// strand rent that is already reclaimable.
func TestCleanupStillReclaimsWhenTheCloseBudgetIsSpent(t *testing.T) {
	harness := newCleanupHarness(t)
	for i := 0; i < 2; i++ {
		harness.seedRecord(
			ChannelRecord{PayTo: harness.payTo.String(), ExpiresAt: time.Now().Unix() - 3600},
			harness.channel(paymentchannels.StatusSealed, testSlot),
		)
	}
	distributed := harness.seedRecord(
		ChannelRecord{PayTo: harness.payTo.String()},
		harness.channel(paymentchannels.StatusDistributed, testSlot-paymentchannels.OpenSlotWindow-1),
	)

	require.NoError(t, harness.manager.Cleanup(context.Background(), harness.options(CleanupOptions{
		MaxClosesPerRun: 1,
	})))

	assert.Len(t, harness.closes, 1)
	require.Len(t, harness.reclaims, 1)
	assert.Equal(t, []string{distributed.ChannelID}, harness.reclaims[0].ChannelIDs)
}

func TestCleanupContinuesAfterAFailedClose(t *testing.T) {
	harness := newCleanupHarness(t)
	harness.signer.failNextSends = 1
	for i := 0; i < 2; i++ {
		harness.seedRecord(
			ChannelRecord{PayTo: harness.payTo.String(), ExpiresAt: time.Now().Unix() - 3600},
			harness.channel(paymentchannels.StatusSealed, testSlot),
		)
	}

	require.NoError(t, harness.manager.Cleanup(context.Background(), harness.options(CleanupOptions{})))

	assert.Len(t, harness.errors, 1)
	assert.Len(t, harness.closes, 1, "one channel failing does not abort the pass")
}

func TestCleanupRetriesAReclaimThatFailedToBroadcast(t *testing.T) {
	harness := newCleanupHarness(t)
	harness.signer.sendErr = assert.AnError
	record := harness.seedRecord(
		ChannelRecord{PayTo: harness.payTo.String()},
		harness.channel(paymentchannels.StatusDistributed, testSlot-paymentchannels.OpenSlotWindow-1),
	)

	require.NoError(t, harness.manager.Cleanup(context.Background(), harness.options(CleanupOptions{})))
	assert.Empty(t, harness.reclaims)
	assert.Len(t, harness.errors, 1)
	require.True(t, harness.exists(record.ChannelID), "the record survives so the rent is not abandoned")

	harness.signer.sendErr = nil
	require.NoError(t, harness.manager.Cleanup(context.Background(), harness.options(CleanupOptions{})))

	require.Len(t, harness.reclaims, 1)
	assert.Equal(t, []string{record.ChannelID}, harness.reclaims[0].ChannelIDs)
	assert.False(t, harness.exists(record.ChannelID))
}

// A failed batch strands every channel in it, so reporting only the first would
// hide the rest from the operator watching OnError.
func TestCleanupReportsEveryChannelInAFailedReclaimBatch(t *testing.T) {
	harness := newCleanupHarness(t)
	harness.signer.sendErr = assert.AnError
	openSlot := testSlot - paymentchannels.OpenSlotWindow - 1
	var seeded []string
	for i := 0; i < 3; i++ {
		record := harness.seedRecord(
			ChannelRecord{PayTo: harness.payTo.String()},
			harness.channel(paymentchannels.StatusDistributed, openSlot),
		)
		seeded = append(seeded, record.ChannelID)
	}

	require.NoError(t, harness.manager.Cleanup(context.Background(), harness.options(CleanupOptions{})))

	assert.Empty(t, harness.reclaims)
	assert.ElementsMatch(t, seeded, harness.errorChannelIDs)
}

// Stop cancels the pass context, and a pass that ignored it would keep fetching
// every remaining record over a dead connection before shutdown completes.
func TestCleanupStopsOnACanceledContext(t *testing.T) {
	harness := newCleanupHarness(t)
	for i := 0; i < 3; i++ {
		harness.seedRecord(
			ChannelRecord{PayTo: harness.payTo.String(), ExpiresAt: time.Now().Unix() - 3600},
			harness.channel(paymentchannels.StatusSealed, testSlot),
		)
	}
	ctx, cancel := context.WithCancel(context.Background())
	cancel()

	err := harness.manager.Cleanup(ctx, harness.options(CleanupOptions{}))

	require.ErrorIs(t, err, context.Canceled)
	assert.Empty(t, harness.signer.sentTransactions())
	assert.Empty(t, harness.errors, "a canceled pass is not an operator-visible failure")
}

// An unrecognized status has no cleanup path, so the operator has to hear about
// it rather than the record sitting in storage forever.
func TestCleanupReportsAnUnrecognizedChannelStatus(t *testing.T) {
	harness := newCleanupHarness(t)
	account := harness.channel(paymentchannels.StatusOpen, testSlot)
	account.Status = paymentchannels.ChannelStatus(99)
	record := harness.seedRecord(
		ChannelRecord{PayTo: harness.payTo.String(), ExpiresAt: time.Now().Unix() - 3600},
		account,
	)

	require.NoError(t, harness.manager.Cleanup(context.Background(), harness.options(CleanupOptions{})))

	require.Len(t, harness.errors, 1)
	assert.ErrorContains(t, harness.errors[0], "unrecognized status")
	assert.Empty(t, harness.signer.sentTransactions())
	assert.True(t, harness.exists(record.ChannelID))
}

func TestCleanupContinuesPastAnUnparseableRecord(t *testing.T) {
	harness := newCleanupHarness(t)
	require.NoError(t, harness.storage.Upsert(context.Background(), ChannelRecord{
		ChannelID: "not-a-channel-id",
		PayTo:     harness.payTo.String(),
		Network:   testNetwork,
	}))
	harness.seedRecord(
		ChannelRecord{PayTo: harness.payTo.String(), ExpiresAt: time.Now().Unix() - 3600},
		harness.channel(paymentchannels.StatusSealed, testSlot),
	)

	require.NoError(t, harness.manager.Cleanup(context.Background(), harness.options(CleanupOptions{})))

	assert.Len(t, harness.errors, 1)
	assert.Len(t, harness.closes, 1)
}

func TestCleanupPropagatesAStorageListFailure(t *testing.T) {
	harness := newCleanupHarness(t)
	manager := NewRentCleanupManager(RentCleanupConfig{
		Signer:  harness.signer,
		Storage: failingStorage{},
		Network: testNetwork,
		RPCURL:  harness.stub.url,
	})

	err := manager.Cleanup(context.Background(), harness.options(CleanupOptions{}))

	require.ErrorContains(t, err, "failed to list stored channels")
	assert.Empty(t, harness.signer.sentTransactions())
}

// A manual pass must not race the interval loop into closing a channel twice.
func TestCleanupRunsPassesSerially(t *testing.T) {
	harness := newCleanupHarness(t)
	record := harness.seedRecord(
		ChannelRecord{PayTo: harness.payTo.String(), ExpiresAt: time.Now().Unix() - 3600},
		harness.channel(paymentchannels.StatusSealed, testSlot),
	)
	harness.closeAccountOnSend(record.ChannelID)

	var wait sync.WaitGroup
	for i := 0; i < 4; i++ {
		wait.Add(1)
		go func() {
			defer wait.Done()
			assert.NoError(t, harness.manager.Cleanup(context.Background(), CleanupOptions{}))
		}()
	}
	wait.Wait()

	assert.Len(t, harness.signer.sentTransactions(), 1, "the channel is closed exactly once")
	assert.False(t, harness.exists(record.ChannelID))
}

func TestStartRunsCleanupOnAnIntervalUntilStopped(t *testing.T) {
	harness := newCleanupHarness(t)
	record := harness.seedRecord(
		ChannelRecord{PayTo: harness.payTo.String(), ExpiresAt: time.Now().Unix() - 3600},
		harness.channel(paymentchannels.StatusSealed, testSlot),
	)
	harness.closeAccountOnSend(record.ChannelID)

	closed := make(chan CloseResult, 1)
	harness.manager.Start(context.Background(), StartConfig{
		Interval: time.Millisecond,
		CleanupOptions: CleanupOptions{
			OnClose: func(result CloseResult) {
				select {
				case closed <- result:
				default:
				}
			},
		},
	})
	t.Cleanup(harness.manager.Stop)

	select {
	case result := <-closed:
		assert.Equal(t, record.ChannelID, result.ChannelID)
	case <-time.After(5 * time.Second):
		t.Fatal("cleanup did not run on the configured interval")
	}

	harness.manager.Stop()
	settled := len(harness.signer.sentTransactions())
	time.Sleep(20 * time.Millisecond)
	assert.Equal(t, settled, len(harness.signer.sentTransactions()), "Stop halts the interval loop")
}

func TestStartIgnoresANonPositiveInterval(t *testing.T) {
	harness := newCleanupHarness(t)
	harness.manager.Start(context.Background(), StartConfig{})
	harness.manager.Stop()

	assert.Empty(t, harness.signer.sentTransactions())
}

// channelFor builds a live account owned by an arbitrary fee payer, so tests
// can seed channels across more than one managed signer key.
func (h *cleanupHarness) channelFor(
	status paymentchannels.ChannelStatus, openSlot uint64, feePayer solana.PublicKey,
) channelAccount {
	return channelAccount{
		Status:      status,
		Deposit:     10_000,
		GracePeriod: 3600,
		Payer:       h.payer,
		Payee:       feePayer,
		RentPayer:   feePayer,
		Mint:        solana.MustPublicKeyFromBase58(svm.USDCDevnetAddress),
		OpenSlot:    openSlot,
		Splits: []paymentchannels.Split{
			{Recipient: h.payTo.String(), BPS: paymentchannels.BasisPointsDenominator},
		},
	}
}

// discoveredChannel publishes a live, PDA-valid channel account directly on
// the stub without a stored record: the shape discovery must find on its own.
func (h *cleanupHarness) discoveredChannel(
	status paymentchannels.ChannelStatus, openSlot uint64, rentPayer solana.PublicKey,
) solana.PublicKey {
	h.t.Helper()

	mint := solana.MustPublicKeyFromBase58(svm.USDCDevnetAddress)
	authorizedSigner, err := solana.NewRandomPrivateKey()
	require.NoError(h.t, err)
	salt := uint64(time.Now().UnixNano())

	pda, err := paymentchannels.FindChannelPDA(h.payer, rentPayer, mint, authorizedSigner.PublicKey(), salt, openSlot)
	require.NoError(h.t, err)

	account := channelAccount{
		Status:           status,
		Salt:             salt,
		Deposit:          10_000,
		GracePeriod:      3600,
		Payer:            h.payer,
		Payee:            rentPayer,
		AuthorizedSigner: authorizedSigner.PublicKey(),
		Mint:             mint,
		RentPayer:        rentPayer,
		OpenSlot:         openSlot,
		Splits: []paymentchannels.Split{
			{Recipient: h.payTo.String(), BPS: paymentchannels.BasisPointsDenominator},
		},
	}
	h.stub.setAccount(pda.String(), account.encode(h.t))
	return pda
}

// newDiscoveryCleanupHarness reuses a plain harness's signer/storage/stub but
// enables the onchain discovery sweep on the manager under test.
func newDiscoveryCleanupHarness(t *testing.T) *cleanupHarness {
	t.Helper()
	harness := newCleanupHarness(t)
	harness.manager = NewRentCleanupManager(RentCleanupConfig{
		Signer:          harness.signer,
		Storage:         harness.storage,
		Network:         testNetwork,
		RPCURL:          harness.stub.url,
		EnableDiscovery: true,
	})
	return harness
}

func TestCleanupDiscoversAndReclaimsUntrackedDistributedChannels(t *testing.T) {
	harness := newDiscoveryCleanupHarness(t)
	openSlot := testSlot - paymentchannels.OpenSlotWindow - 1
	pda := harness.discoveredChannel(paymentchannels.StatusDistributed, openSlot, harness.signer.feePayer())

	require.NoError(t, harness.manager.Cleanup(context.Background(), harness.options(CleanupOptions{})))

	require.Len(t, harness.reclaims, 1)
	assert.Equal(t, []string{pda.String()}, harness.reclaims[0].ChannelIDs)
}

func TestCleanupDiscoveryIgnoresNonDistributedChannels(t *testing.T) {
	harness := newDiscoveryCleanupHarness(t)
	// An Open or Sealed channel discovered onchain carries no stored payTo,
	// so discovery must never propose closing or distributing it.
	harness.discoveredChannel(paymentchannels.StatusOpen, testSlot, harness.signer.feePayer())
	harness.discoveredChannel(paymentchannels.StatusSealed, testSlot, harness.signer.feePayer())

	require.NoError(t, harness.manager.Cleanup(context.Background(), harness.options(CleanupOptions{})))

	assert.Empty(t, harness.reclaims)
	assert.Empty(t, harness.closes)
	assert.Empty(t, harness.signer.sentTransactions())
}

func TestCleanupDiscoveryDoesNotDuplicateStoredChannels(t *testing.T) {
	harness := newDiscoveryCleanupHarness(t)
	openSlot := testSlot - paymentchannels.OpenSlotWindow - 1
	record := harness.seedRecord(
		ChannelRecord{PayTo: harness.payTo.String()},
		harness.channel(paymentchannels.StatusDistributed, openSlot),
	)

	require.NoError(t, harness.manager.Cleanup(context.Background(), harness.options(CleanupOptions{})))

	require.Len(t, harness.reclaims, 1, "the stored record must not also be reclaimed via discovery")
	assert.Equal(t, []string{record.ChannelID}, harness.reclaims[0].ChannelIDs)
}

// TestSubmitReclaimBatchesRunsRentPayerGroupsConcurrently proves that adding a
// second managed signer key adds parallel reclaim capacity instead of only
// extending one sequential queue: both groups must be in flight at once.
func TestSubmitReclaimBatchesRunsRentPayerGroupsConcurrently(t *testing.T) {
	harness := newCleanupHarness(t)
	signer := newMockSigner(t, 2)
	harness.signer = signer
	harness.manager = NewRentCleanupManager(RentCleanupConfig{
		Signer:  signer,
		Storage: harness.storage,
		Network: testNetwork,
		RPCURL:  harness.stub.url,
	})

	openSlot := testSlot - paymentchannels.OpenSlotWindow - 1
	first := harness.seedRecord(
		ChannelRecord{PayTo: harness.payTo.String()},
		harness.channelFor(paymentchannels.StatusDistributed, openSlot, signer.keys[0].PublicKey()),
	)
	second := harness.seedRecord(
		ChannelRecord{PayTo: harness.payTo.String()},
		harness.channelFor(paymentchannels.StatusDistributed, openSlot, signer.keys[1].PublicKey()),
	)

	entered := make(chan struct{}, 2)
	release := make(chan struct{})
	signer.onSend = func(*solana.Transaction) {
		entered <- struct{}{}
		<-release
	}

	done := make(chan error, 1)
	go func() {
		done <- harness.manager.Cleanup(context.Background(), harness.options(CleanupOptions{}))
	}()

	for i := 0; i < 2; i++ {
		select {
		case <-entered:
		case <-time.After(5 * time.Second):
			t.Fatal("both rent-payer groups did not submit concurrently")
		}
	}
	close(release)

	select {
	case err := <-done:
		require.NoError(t, err)
	case <-time.After(5 * time.Second):
		t.Fatal("cleanup pass did not finish after release")
	}

	require.Len(t, harness.reclaims, 2)
	var reclaimedIDs []string
	for _, result := range harness.reclaims {
		reclaimedIDs = append(reclaimedIDs, result.ChannelIDs...)
	}
	assert.ElementsMatch(t, []string{first.ChannelID, second.ChannelID}, reclaimedIDs)
}

// TestSubmitReclaimBatchesBudgetsEachRentPayerGroupIndependently confirms
// MaxTxsPerRun applies per rent-payer group rather than as a shared pool:
// adding a managed signer key adds reclaim throughput instead of splitting a
// fixed budget with the other keys.
func TestSubmitReclaimBatchesBudgetsEachRentPayerGroupIndependently(t *testing.T) {
	harness := newCleanupHarness(t)
	signer := newMockSigner(t, 2)
	harness.signer = signer
	harness.manager = NewRentCleanupManager(RentCleanupConfig{
		Signer:  signer,
		Storage: harness.storage,
		Network: testNetwork,
		RPCURL:  harness.stub.url,
	})

	openSlot := testSlot - paymentchannels.OpenSlotWindow - 1
	for _, key := range signer.keys {
		for i := 0; i < 3; i++ {
			harness.seedRecord(
				ChannelRecord{PayTo: harness.payTo.String()},
				harness.channelFor(paymentchannels.StatusDistributed, openSlot, key.PublicKey()),
			)
		}
	}

	require.NoError(t, harness.manager.Cleanup(context.Background(), harness.options(CleanupOptions{
		MaxReclaimsPerTx: 1,
		MaxTxsPerRun:     2,
	})))

	assert.Len(t, harness.reclaims, 4, "each of the two rent-payer groups gets its own budget of 2")
}
