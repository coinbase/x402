package facilitator

import (
	"context"
	"fmt"
	"sync"
	"time"

	solana "github.com/gagliardetto/solana-go"
	"github.com/gagliardetto/solana-go/rpc"

	"github.com/x402-foundation/x402/go/v2/mechanisms/svm"
	"github.com/x402-foundation/x402/go/v2/mechanisms/svm/paymentchannels"
	"github.com/x402-foundation/x402/go/v2/mechanisms/svm/upto"
)

const (
	// DefaultAbandonGraceSecs is how long after voucher expiry an Open channel
	// is left alone before the facilitator seals it to recover its rent.
	DefaultAbandonGraceSecs = 120

	// DefaultMaxReclaimsPerTx is how many reclaim instructions are packed into
	// one cleanup transaction.
	DefaultMaxReclaimsPerTx = 8

	// DefaultMaxTxsPerRun caps the cleanup transactions submitted per run.
	DefaultMaxTxsPerRun = 20

	// DefaultMaxClosesPerRun caps the seal/distribute transactions per run.
	DefaultMaxClosesPerRun = 10
)

// CloseAction describes which cleanup path closed a channel.
type CloseAction string

// Cleanup close actions.
const (
	// CloseActionAbandonClose seals and distributes an abandoned Open channel.
	CloseActionAbandonClose CloseAction = "abandon_close"
	// CloseActionDistribute distributes an already-Sealed channel.
	CloseActionDistribute CloseAction = "distribute"
)

// CloseResult reports a successful abandon-close or Sealed distribute.
type CloseResult struct {
	ChannelID   string
	Transaction string
	Action      CloseAction
}

// ReclaimResult reports a successful batched reclaim transaction.
type ReclaimResult struct {
	ChannelIDs  []string
	Transaction string
}

// CleanupOptions bound the work of one cleanup pass and receive its results.
type CleanupOptions struct {
	// AbandonGraceSecs is the delay after ExpiresAt before abandon-closing an
	// Open channel. Defaults to DefaultAbandonGraceSecs.
	AbandonGraceSecs int64
	MaxReclaimsPerTx int
	MaxTxsPerRun     int
	MaxClosesPerRun  int

	OnClose   func(result CloseResult)
	OnReclaim func(result ReclaimResult)
	OnError   func(err error, channelID string)
}

func (o CleanupOptions) withDefaults() CleanupOptions {
	if o.AbandonGraceSecs <= 0 {
		o.AbandonGraceSecs = DefaultAbandonGraceSecs
	}
	if o.MaxReclaimsPerTx <= 0 {
		o.MaxReclaimsPerTx = DefaultMaxReclaimsPerTx
	}
	if o.MaxTxsPerRun <= 0 {
		o.MaxTxsPerRun = DefaultMaxTxsPerRun
	}
	if o.MaxClosesPerRun <= 0 {
		o.MaxClosesPerRun = DefaultMaxClosesPerRun
	}
	return o
}

func (o CleanupOptions) reportError(err error, channelID string) {
	if o.OnError != nil {
		o.OnError(err, channelID)
	}
}

// StartConfig configures the interval runner.
type StartConfig struct {
	CleanupOptions
	// Interval is the delay between cleanup passes and is required.
	Interval time.Duration
}

// RentCleanupConfig configures a rent cleanup manager for one network.
type RentCleanupConfig struct {
	Signer  svm.FacilitatorSvmSigner
	Storage ChannelStorage
	Network string
	RPCURL  string
}

// RentCleanupManager recovers the rent a facilitator fronts for payment
// channels on one network. Passes are driven by settle-time ChannelStorage
// rather than RPC discovery.
//
// Sealing an abandoned Open channel freezes the settlement watermark and
// refunds the unsettled remainder to the client, so cleanup only kicks in
// after the voucher deadline plus a grace period.
type RentCleanupManager struct {
	signer  svm.FacilitatorSvmSigner
	storage ChannelStorage
	network string
	rpcURL  string

	mu     sync.Mutex
	cancel context.CancelFunc
	done   chan struct{}

	// passMu serializes passes so a manual Cleanup cannot race the interval
	// loop into submitting the same close or reclaim twice.
	passMu sync.Mutex
}

// NewRentCleanupManager creates a rent cleanup manager. It does not start
// automatically; the facilitator scheme never runs cleanup on its own.
func NewRentCleanupManager(config RentCleanupConfig) *RentCleanupManager {
	return &RentCleanupManager{
		signer:  config.Signer,
		storage: config.Storage,
		network: config.Network,
		rpcURL:  config.RPCURL,
	}
}

// Start runs Cleanup on an interval until Stop is called or the context is
// canceled. Calling Start on a running manager is a no-op.
func (m *RentCleanupManager) Start(ctx context.Context, config StartConfig) {
	if config.Interval <= 0 {
		return
	}

	m.mu.Lock()
	defer m.mu.Unlock()
	if m.cancel != nil {
		return
	}

	runCtx, cancel := context.WithCancel(ctx)
	m.cancel = cancel
	m.done = make(chan struct{})

	go func(done chan struct{}) {
		defer close(done)
		ticker := time.NewTicker(config.Interval)
		defer ticker.Stop()
		for {
			select {
			case <-runCtx.Done():
				return
			case <-ticker.C:
				// Passes run serially, so a slow pass delays the next tick
				// rather than racing it.
				if err := m.Cleanup(runCtx, config.CleanupOptions); err != nil {
					config.reportError(err, "")
				}
			}
		}
	}(m.done)
}

// Stop halts the interval loop and waits for an in-flight pass to finish.
func (m *RentCleanupManager) Stop() {
	m.mu.Lock()
	cancel, done := m.cancel, m.done
	m.cancel, m.done = nil, nil
	m.mu.Unlock()

	if cancel == nil {
		return
	}
	cancel()
	<-done
}

// Cleanup runs one pass: abandon-close timed-out Open channels, distribute
// Sealed ones, and batch-reclaim Distributed ones past the open-slot gate.
// Closing channels and channels that are not yet ready are skipped.
func (m *RentCleanupManager) Cleanup(ctx context.Context, opts CleanupOptions) error {
	m.passMu.Lock()
	defer m.passMu.Unlock()

	opts = opts.withDefaults()

	rpcClient, err := upto.NewRPCClient(m.network, m.rpcURL)
	if err != nil {
		return err
	}
	records, err := m.storage.List(ctx)
	if err != nil {
		return fmt.Errorf("failed to list stored channels: %w", err)
	}

	now := time.Now().Unix()
	var currentSlot *uint64
	txsUsed, closesUsed := 0, 0
	var reclaimCandidates []reclaimCandidate

	for _, record := range records {
		if txsUsed >= opts.MaxTxsPerRun {
			break
		}
		if record.Network != m.network {
			continue
		}

		channelID, err := solana.PublicKeyFromBase58(record.ChannelID)
		if err != nil {
			opts.reportError(err, record.ChannelID)
			continue
		}
		channel, exists, err := fetchChannelAccount(ctx, rpcClient, channelID)
		if err != nil {
			opts.reportError(err, record.ChannelID)
			continue
		}
		if !exists {
			if err := m.storage.Delete(ctx, record.ChannelID); err != nil {
				opts.reportError(err, record.ChannelID)
			}
			continue
		}

		switch channel.Status {
		case paymentchannels.StatusClosing:
			continue

		case paymentchannels.StatusOpen, paymentchannels.StatusSealed:
			if channel.Status == paymentchannels.StatusOpen && now < record.ExpiresAt+opts.AbandonGraceSecs {
				continue
			}
			// Skip, not stop: later records may be reclaimable, and reclaims
			// are budgeted separately from closes.
			if closesUsed >= opts.MaxClosesPerRun {
				continue
			}
			if record.PayTo == "" {
				opts.reportError(
					fmt.Errorf("channel %s has no stored payTo; cannot rebuild its distribution", record.ChannelID),
					record.ChannelID,
				)
				continue
			}
			signature, err := m.submitCloseOrDistribute(ctx, rpcClient, record, channel, channelID)
			if err != nil {
				opts.reportError(err, record.ChannelID)
				continue
			}
			closesUsed++
			txsUsed++
			if opts.OnClose != nil {
				action := CloseActionDistribute
				if channel.Status == paymentchannels.StatusOpen {
					action = CloseActionAbandonClose
				}
				opts.OnClose(CloseResult{
					ChannelID:   record.ChannelID,
					Transaction: signature,
					Action:      action,
				})
			}
			m.deleteIfGone(ctx, rpcClient, channelID, record.ChannelID, opts)

		case paymentchannels.StatusDistributed:
			if currentSlot == nil {
				slot, err := rpcClient.GetSlot(ctx, upto.SlotCommitment)
				if err != nil {
					opts.reportError(fmt.Errorf("failed to fetch the current slot: %w", err), record.ChannelID)
					continue
				}
				currentSlot = &slot
			}
			if *currentSlot > channel.OpenSlot+paymentchannels.OpenSlotWindow {
				reclaimCandidates = append(reclaimCandidates, reclaimCandidate{
					channelID: channelID,
					rentPayer: channel.RentPayer,
				})
			}

		default:
			// An unrecognized status has no cleanup path, and the record would
			// otherwise sit in storage forever without the operator knowing.
			opts.reportError(
				fmt.Errorf("channel %s has unrecognized status %s", record.ChannelID, channel.Status),
				record.ChannelID,
			)
		}
	}

	if txsUsed < opts.MaxTxsPerRun {
		m.submitReclaimBatches(ctx, rpcClient, reclaimCandidates, opts, opts.MaxTxsPerRun-txsUsed)
	}
	return nil
}

// reclaimCandidate is a Distributed channel ready to have its rent reclaimed.
type reclaimCandidate struct {
	channelID solana.PublicKey
	rentPayer solana.PublicKey
}

// submitCloseOrDistribute seals and distributes an abandoned Open channel, or
// distributes an already-Sealed one.
func (m *RentCleanupManager) submitCloseOrDistribute(
	ctx context.Context,
	rpcClient *rpc.Client,
	record ChannelRecord,
	channel *paymentchannels.Channel,
	channelID solana.PublicKey,
) (string, error) {
	// The channel payee and rent payer are the same facilitator key in this
	// scheme, and both come from the live account rather than storage.
	feePayer, err := m.resolveFeePayer(ctx, channel.Payee)
	if err != nil {
		return "", err
	}
	tokenProgram, err := solana.PublicKeyFromBase58(record.TokenProgram)
	if err != nil {
		return "", fmt.Errorf("channel %s has an invalid stored tokenProgram: %w", record.ChannelID, err)
	}

	distribute, err := paymentchannels.BuildDistributeInstruction(paymentchannels.DistributeInstructionArgs{
		Channel:      channelID,
		Payer:        channel.Payer,
		Payee:        channel.Payee,
		RentPayer:    channel.RentPayer,
		Mint:         channel.Mint,
		TokenProgram: tokenProgram,
		Splits:       []paymentchannels.Split{{Recipient: record.PayTo, BPS: paymentchannels.BasisPointsDenominator}},
		Network:      m.network,
	})
	if err != nil {
		return "", err
	}

	instructions := []solana.Instruction{distribute}
	if channel.Status == paymentchannels.StatusOpen {
		// Seal at the current watermark with no voucher: the unsettled
		// remainder refunds to the payer in the same transaction.
		instructions = []solana.Instruction{
			paymentchannels.BuildSettleAndSealInstruction(channelID, channel.Payee, false),
			distribute,
		}
	}

	return submitInstructions(ctx, rpcClient, m.signer, feePayer, m.network, instructions)
}

// submitReclaimBatches groups candidates by rent payer and submits batched
// reclaim transactions within the remaining transaction budget.
func (m *RentCleanupManager) submitReclaimBatches(
	ctx context.Context,
	rpcClient *rpc.Client,
	candidates []reclaimCandidate,
	opts CleanupOptions,
	maxTxs int,
) {
	if maxTxs <= 0 || len(candidates) == 0 {
		return
	}

	byRentPayer := make(map[solana.PublicKey][]reclaimCandidate)
	order := make([]solana.PublicKey, 0, len(candidates))
	for _, candidate := range candidates {
		if _, seen := byRentPayer[candidate.rentPayer]; !seen {
			order = append(order, candidate.rentPayer)
		}
		byRentPayer[candidate.rentPayer] = append(byRentPayer[candidate.rentPayer], candidate)
	}

	txsUsed := 0
	for _, rentPayer := range order {
		if txsUsed >= maxTxs {
			return
		}
		group := byRentPayer[rentPayer]

		feePayer, err := m.resolveFeePayer(ctx, rentPayer)
		if err != nil {
			for _, candidate := range group {
				opts.reportError(err, candidate.channelID.String())
			}
			continue
		}

		for start := 0; start < len(group) && txsUsed < maxTxs; start += opts.MaxReclaimsPerTx {
			end := start + opts.MaxReclaimsPerTx
			if end > len(group) {
				end = len(group)
			}
			batch := m.refreshReclaimBatch(ctx, rpcClient, group[start:end], opts)
			if len(batch) == 0 {
				continue
			}

			instructions := make([]solana.Instruction, 0, len(batch))
			channelIDs := make([]string, 0, len(batch))
			for _, candidate := range batch {
				instructions = append(instructions,
					paymentchannels.BuildReclaimInstruction(candidate.channelID, candidate.rentPayer))
				channelIDs = append(channelIDs, candidate.channelID.String())
			}

			signature, err := submitInstructions(ctx, rpcClient, m.signer, feePayer, m.network, instructions)
			if err != nil {
				opts.reportError(err, channelIDs[0])
				continue
			}
			txsUsed++
			if opts.OnReclaim != nil {
				opts.OnReclaim(ReclaimResult{ChannelIDs: channelIDs, Transaction: signature})
			}
			for _, channelID := range channelIDs {
				if err := m.storage.Delete(ctx, channelID); err != nil {
					opts.reportError(err, channelID)
				}
			}
		}
	}
}

// refreshReclaimBatch refetches each candidate immediately before acting, so a
// channel that changed since the listing pass is skipped rather than failing
// the whole batch.
func (m *RentCleanupManager) refreshReclaimBatch(
	ctx context.Context,
	rpcClient *rpc.Client,
	batch []reclaimCandidate,
	opts CleanupOptions,
) []reclaimCandidate {
	live := make([]reclaimCandidate, 0, len(batch))
	for _, candidate := range batch {
		channel, exists, err := fetchChannelAccount(ctx, rpcClient, candidate.channelID)
		if err != nil {
			opts.reportError(err, candidate.channelID.String())
			continue
		}
		if !exists {
			if err := m.storage.Delete(ctx, candidate.channelID.String()); err != nil {
				opts.reportError(err, candidate.channelID.String())
			}
			continue
		}
		if channel.Status != paymentchannels.StatusDistributed {
			continue
		}
		live = append(live, reclaimCandidate{channelID: candidate.channelID, rentPayer: channel.RentPayer})
	}
	return live
}

// deleteIfGone drops the storage entry once the channel account is closed.
func (m *RentCleanupManager) deleteIfGone(
	ctx context.Context,
	rpcClient *rpc.Client,
	channelID solana.PublicKey,
	storedID string,
	opts CleanupOptions,
) {
	exists, err := channelExists(ctx, rpcClient, channelID)
	if err != nil {
		opts.reportError(err, storedID)
		return
	}
	if exists {
		return
	}
	if err := m.storage.Delete(ctx, storedID); err != nil {
		opts.reportError(err, storedID)
	}
}

// resolveFeePayer checks that a live channel's payee / rent payer is a signer
// this facilitator controls.
func (m *RentCleanupManager) resolveFeePayer(ctx context.Context, address solana.PublicKey) (solana.PublicKey, error) {
	for _, managed := range m.signer.GetAddresses(ctx, m.network) {
		if managed.Equals(address) {
			return address, nil
		}
	}
	return solana.PublicKey{}, fmt.Errorf("channel key %s is not in the facilitator signer set", address)
}
