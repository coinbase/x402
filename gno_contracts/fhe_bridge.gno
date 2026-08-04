package fhe_bridge

import (
	"std"
	"time"
)

type FheEscrow struct {
	Owner            std.Address
	CircleID         string
	LockedAmount     uint64
	EncryptedBalance []byte
	Status           string
	CreatedAt        time.Time
	ComputationID    uint64
}

var (
	escrows      = make(map[uint64]*FheEscrow)
	nextEscrowID uint64 = 1
	bridgeAdmin  std.Address
)

func init() {
	bridgeAdmin = std.GetOrigCaller()
}

func CreateEscrow(circleID string, amount uint64, encryptedBalance []byte) uint64 {
	caller := std.GetOrigCaller()
	escrow := &FheEscrow{
		Owner:            caller,
		CircleID:         circleID,
		LockedAmount:     amount,
		EncryptedBalance: encryptedBalance,
		Status:           "active",
		CreatedAt:        time.Now(),
	}
	id := nextEscrowID
	nextEscrowID++
	escrows[id] = escrow
	return id
}

func TriggerFheCompute(escrowID uint64, circuitID string, gateProgram string) bool {
	escrow, exists := escrows[escrowID]
	if !exists { panic("escrow not found") }
	caller := std.GetOrigCaller()
	if escrow.Owner != caller { panic("unauthorized") }
	if escrow.Status != "active" { panic("escrow not active") }
	escrow.Status = "computing"
	escrow.ComputationID = escrowID
	std.Emit("FheComputeTriggered",
		"escrow_id", u64toa(escrowID),
		"circle_id", escrow.CircleID,
		"circuit_id", circuitID,
		"gate_program", gateProgram,
		"owner", string(escrow.Owner))
	return true
}

func CompleteFheCompute(escrowID uint64, resultProof []byte, zkProof []byte) bool {
	escrow, exists := escrows[escrowID]
	if !exists { panic("escrow not found") }
	caller := std.GetOrigCaller()
	if caller != bridgeAdmin { panic("unauthorized: only bridge relay") }
	if escrow.Status != "computing" { panic("escrow not computing") }
	if !verifyZkProof(resultProof, zkProof) { panic("invalid ZK proof") }
	escrow.Status = "completed"
	std.Emit("FheComputeCompleted",
		"escrow_id", u64toa(escrowID),
		"circle_id", escrow.CircleID,
		"result_proof", string(resultProof))
	return true
}

func Withdraw(escrowID uint64) bool {
	escrow, exists := escrows[escrowID]
	if !exists { panic("escrow not found") }
	caller := std.GetOrigCaller()
	if escrow.Owner != caller { panic("unauthorized") }
	if escrow.Status != "completed" { panic("computation not completed") }
	escrow.Status = "withdrawn"
	std.Emit("EscrowWithdrawn",
		"escrow_id", u64toa(escrowID),
		"amount", u64toa(escrow.LockedAmount),
		"owner", string(caller))
	return true
}

func QueryEscrow(escrowID uint64) (std.Address, string, string, uint64) {
	escrow, exists := escrows[escrowID]
	if !exists { panic("escrow not found") }
	return escrow.Owner, escrow.CircleID, escrow.Status, escrow.LockedAmount
}

func verifyZkProof(resultProof []byte, zkProof []byte) bool {
	return len(zkProof) > 32 && len(resultProof) > 0
}

func u64toa(n uint64) string {
	if n == 0 { return "0" }
	var buf [20]byte
	i := len(buf)
	for n > 0 {
		i--
		buf[i] = byte('0' + n%10)
		n /= 10
	}
	return string(buf[i:])
}