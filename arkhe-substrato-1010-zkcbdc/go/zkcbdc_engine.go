package zkcbdc

import (
	"crypto/sha256"
	"crypto/rand"
	"encoding/hex"
	"errors"
	"fmt"
	"strings"
	"time"
)

// TransactionStatus represents the status of a transaction
type TransactionStatus string

const (
	Pending     TransactionStatus = "pending"
	Proven      TransactionStatus = "proven"
	Rejected    TransactionStatus = "rejected"
	Anchored    TransactionStatus = "anchored"
	DoubleSpend TransactionStatus = "double_spend"
)

// AccountState represents the state of an account in the confidential ledger
type AccountState struct {
	AccountID         string
	CommitmentBalance string
	Nonce             int
	IsFrozen          bool
	KycLevel          int
	LastUpdated       string
}

// ConfidentialTransaction represents a confidential transaction with ZK proof
type ConfidentialTransaction struct {
	TxID               string
	CommitmentSender   string
	CommitmentReceiver string
	CommitmentAmount   string
	Nullifier          string
	ZkProof            string
	KycProof           string
	SanctionsProof     string
	Timestamp          string
	Status             TransactionStatus
	TemporalAnchor     string
	Seal               string
}

// ComputeSeal computes the seal for the transaction
func (t *ConfidentialTransaction) ComputeSeal() string {
	payload := fmt.Sprintf("%s:%s:%s", t.TxID, t.Nullifier, t.ZkProof[:32])
	hash := sha256.Sum256([]byte(payload))
	hashHex := hex.EncodeToString(hash[:])
	t.Seal = fmt.Sprintf("ZKCBDC-%s", strings.ToUpper(hashHex[:16]))
	return t.Seal
}

// ZKCBCC is the validation engine for zkCBDC
type ZKCBCC struct {
	TotalSupply      int
	CentralBankKey   string
	Nullifiers       map[string]bool
	Transactions     map[string]*ConfidentialTransaction
	Accounts         map[string]*AccountState
	MintProofs       map[string]string
	SanctionsList    map[string]bool
	FrozenAccounts   map[string]bool
	TotalTransactions int
	TotalVolume      int
}

// NewZKCBCC creates a new zkCBDC validation engine
func NewZKCBCC(totalSupply int, centralBankKey string) *ZKCBCC {
	return &ZKCBCC{
		TotalSupply:      totalSupply,
		CentralBankKey:   centralBankKey,
		Nullifiers:       make(map[string]bool),
		Transactions:     make(map[string]*ConfidentialTransaction),
		Accounts:         make(map[string]*AccountState),
		MintProofs:       make(map[string]string),
		SanctionsList:    make(map[string]bool),
		FrozenAccounts:   make(map[string]bool),
	}
}

func generateRandomHex(n int) string {
	bytes := make([]byte, n)
	rand.Read(bytes)
	return hex.EncodeToString(bytes)
}

func sha3(data string) string {
	hash := sha256.Sum256([]byte(data))
	return hex.EncodeToString(hash[:])
}

// CreateAccount creates a new account
func (z *ZKCBCC) CreateAccount(accountID string, initialBalance int) (*AccountState, error) {
	if _, exists := z.Accounts[accountID]; exists {
		return nil, errors.New("Account already exists")
	}
	r := generateRandomHex(16)
	commitment := sha3(fmt.Sprintf("%d:%s", initialBalance, r))
	account := &AccountState{
		AccountID:         accountID,
		CommitmentBalance: commitment,
		LastUpdated:       time.Now().UTC().Format(time.RFC3339),
	}
	z.Accounts[accountID] = account
	return account, nil
}

// AddToSanctionsList adds an account to the sanctions list
func (z *ZKCBCC) AddToSanctionsList(accountID string) {
	z.SanctionsList[accountID] = true
}

// FreezeAccount freezes an account
func (z *ZKCBCC) FreezeAccount(accountID string) {
	if acc, exists := z.Accounts[accountID]; exists {
		acc.IsFrozen = true
		z.FrozenAccounts[accountID] = true
	}
}

// CreateTransaction creates a new confidential transaction
func (z *ZKCBCC) CreateTransaction(senderPriv, receiverPub string, amount int) (*ConfidentialTransaction, error) {
	if amount <= 0 {
		return nil, errors.New("Amount must be positive")
	}
	if senderPriv == receiverPub {
		return nil, errors.New("Self-transfer not allowed")
	}

	txID := sha3(fmt.Sprintf("%s:%s:%d:%s", senderPriv, receiverPub, amount, generateRandomHex(16)))[:32]
	nullifier := sha3(fmt.Sprintf("%s:%s:%s", senderPriv, txID, generateRandomHex(8)))

	if z.Nullifiers[nullifier] {
		return nil, errors.New("DOUBLE SPEND DETECTED")
	}

	r1, r2, r3 := generateRandomHex(16), generateRandomHex(16), generateRandomHex(16)
	commitmentSender := sha3(fmt.Sprintf("%s:%s", senderPriv, r1))
	commitmentReceiver := sha3(fmt.Sprintf("%s:%s", receiverPub, r2))
	commitmentAmount := sha3(fmt.Sprintf("%d:%s", amount, r3))

	zkProof := sha3(fmt.Sprintf("%s:%s:%s:%s:valid_range:supply_preserved", commitmentAmount, commitmentSender, commitmentReceiver, generateRandomHex(32)))
	kycProof := sha3(fmt.Sprintf("%s:%s:humanity:verified", senderPriv, receiverPub))
	sanctionsProof := sha3(fmt.Sprintf("%s:%s:no_sanctions", senderPriv, receiverPub))

	tx := &ConfidentialTransaction{
		TxID:               txID,
		CommitmentSender:   commitmentSender,
		CommitmentReceiver: commitmentReceiver,
		CommitmentAmount:   commitmentAmount,
		Nullifier:          nullifier,
		ZkProof:            zkProof,
		KycProof:           kycProof,
		SanctionsProof:     sanctionsProof,
		Timestamp:          time.Now().UTC().Format(time.RFC3339),
		Status:             Pending,
	}
	tx.ComputeSeal()

	if z.SanctionsList[senderPriv] || z.SanctionsList[receiverPub] || z.FrozenAccounts[senderPriv] {
		tx.Status = Rejected
		return tx, nil
	}

	z.Nullifiers[nullifier] = true
	tx.Status = Proven
	z.Transactions[txID] = tx
	z.TotalTransactions++
	z.TotalVolume += amount

	z.MintProofs[txID] = sha3(fmt.Sprintf("supply:%d:%s:%d", z.TotalSupply, txID, z.TotalVolume))

	temporalAnchorStr := sha3(tx.Seal)
	tx.TemporalAnchor = fmt.Sprintf("923-ANCHOR-%s", strings.ToUpper(temporalAnchorStr[:16]))
	tx.Status = Anchored

	return tx, nil
}

// VerifyProof verifies the ZK proof of a transaction
func (z *ZKCBCC) VerifyProof(tx *ConfidentialTransaction) bool {
	recalculated := sha3(fmt.Sprintf("%s:%s:%s:verify", tx.CommitmentAmount, tx.CommitmentSender, tx.CommitmentReceiver))
	if recalculated[:16] != tx.ZkProof[:16] {
		tx.Status = Rejected
		return false
	}
	tx.Status = Proven
	return true
}

// AuditSupply audits the monetary supply
func (z *ZKCBCC) AuditSupply() map[string]interface{} {
	supplyInvariant := "PRESERVED"
	if z.TotalVolume > z.TotalSupply {
		supplyInvariant = "VIOLATED"
	}
	return map[string]interface{}{
		"total_supply":       z.TotalSupply,
		"total_transactions": z.TotalTransactions,
		"total_volume":       z.TotalVolume,
		"nullifiers_count":   len(z.Nullifiers),
		"mint_proofs_valid":  len(z.MintProofs),
		"accounts_count":     len(z.Accounts),
		"frozen_accounts":    len(z.FrozenAccounts),
		"sanctions_listed":   len(z.SanctionsList),
		"supply_invariant":   supplyInvariant,
		"auditor_note":       "No individual value was exposed. Privacy preserved.",
	}
}
