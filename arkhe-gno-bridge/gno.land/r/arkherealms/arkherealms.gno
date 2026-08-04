// arkherealms.gno
// ARKHE Canonical Realm for Gno.land
// Substrato: 832.1-SMART-CONTRACTS-REALM
// Arquiteto: ORCID 0009-0005-2697-4668
// Upstream: github.com/gnolang/gno (BSD-3-Clause)

package arkherealms

import (
	"std"
	"crypto/sha3"
	"encoding/hex"
	"strings"
	"time"
)

// ============================================================
// 1. ARKHE Canonical Types (Gno-native)
// ============================================================

type Substrate struct {
	ID        string
	PhiC      float64
	Status    string
	Seal      string
	Timestamp int64
	Architect string
}

type Invariant struct {
	Name        string
	Description string
	Verified    bool
}

type Decree struct {
	ID          string
	SubstrateID string
	Content     string
	Seal        string
	Timestamp   int64
	Status      string
}

type TemporalBlock struct {
	ThetaID     string
	PrevSeal    string
	Seal        string
	Timestamp   int64
	PhiC        float64
	Data        string
}

// ============================================================
// 2. State (auto-persisted by GnoVM)
// ============================================================

var (
	Substrates      = make(map[string]*Substrate)
	Invariants      = make(map[string]*Invariant)
	Decrees         = make(map[string]*Decree)
	TemporalChain   = make(map[string]*TemporalBlock)
	LastBlockSeal   = "genesis"
	ArchitectORCID  = "0009-0005-2697-4668"
	GhostThreshold  = 0.577350269
	ArkheVersion    = "inf.Omega"
)

// ============================================================
// 3. Substrate Management
// ============================================================

func RegisterSubstrate(id string, phiC float64) string {
	if phiC < GhostThreshold {
		panic("Phi-C below Ghost Threshold: " + id)
	}

	seal := computeSeal(id + ":" + std.GetOrigCaller().String() + ":" + time.Now().String())

	Substrates[id] = &Substrate{
		ID:        id,
		PhiC:      phiC,
		Status:    "CANONIZED_PROVISIONAL",
		Seal:      seal,
		Timestamp: time.Now().Unix(),
		Architect: ArchitectORCID,
	}

	return seal
}

func VerifySubstrate(id string) bool {
	s, ok := Substrates[id]
	if !ok {
		return false
	}
	return s.PhiC >= GhostThreshold
}

func UpdateSubstrateStatus(id string, status string) {
	s, ok := Substrates[id]
	if !ok {
		panic("Substrate not found: " + id)
	}

	// Only architect can update
	if std.GetOrigCaller().String() != ArchitectORCID {
		panic("Unauthorized: only architect can update status")
	}

	s.Status = status
}

// ============================================================
// 4. Invariant Registry
// ============================================================

func RegisterInvariant(name string, description string) {
	Invariants[name] = &Invariant{
		Name:        name,
		Description: description,
		Verified:    false,
	}
}

func VerifyInvariant(name string) {
	inv, ok := Invariants[name]
	if !ok {
		panic("Invariant not found: " + name)
	}
	inv.Verified = true
}

func CheckInvariant(name string) bool {
	inv, ok := Invariants[name]
	if !ok {
		return false
	}
	return inv.Verified
}

// ============================================================
// 5. Decree System
// ============================================================

func IssueDecree(substrateID string, content string) string {
	if !VerifySubstrate(substrateID) {
		panic("Invalid substrate: " + substrateID)
	}

	decreeID := substrateID + "-" + time.Now().Format("20060102-150405")
	seal := computeSeal(decreeID + ":" + content)

	Decrees[decreeID] = &Decree{
		ID:          decreeID,
		SubstrateID: substrateID,
		Content:     content,
		Seal:        seal,
		Timestamp:   time.Now().Unix(),
		Status:      "ISSUED",
	}

	return decreeID
}

func ValidateDecree(decreeID string) bool {
	d, ok := Decrees[decreeID]
	if !ok {
		return false
	}

	// Verify seal integrity
	expectedSeal := computeSeal(d.ID + ":" + d.Content)
	if d.Seal != expectedSeal {
		return false
	}

	d.Status = "VALIDATED"
	return true
}

// ============================================================
// 6. TemporalChain (Merkle-anchored)
// ============================================================

func AnchorTemporalBlock(thetaID string, data string, phiC float64) string {
	if phiC < GhostThreshold {
		panic("Phi-C below Ghost Threshold for block: " + thetaID)
	}

	seal := computeSeal(thetaID + ":" + LastBlockSeal + ":" + data)

	block := &TemporalBlock{
		ThetaID:   thetaID,
		PrevSeal:  LastBlockSeal,
		Seal:      seal,
		Timestamp: time.Now().Unix(),
		PhiC:      phiC,
		Data:      data,
	}

	TemporalChain[thetaID] = block
	LastBlockSeal = seal

	return seal
}

func VerifyTemporalChain(thetaID string) bool {
	block, ok := TemporalChain[thetaID]
	if !ok {
		return false
	}

	// Verify seal
	expectedSeal := computeSeal(block.ThetaID + ":" + block.PrevSeal + ":" + block.Data)
	return block.Seal == expectedSeal
}

func GetTemporalChain() []*TemporalBlock {
	var chain []*TemporalBlock
	currentSeal := "genesis"

	// Build chain in order (simplified - in production use AVL tree)
	for _, block := range TemporalChain {
		if block.PrevSeal == currentSeal {
			chain = append(chain, block)
			currentSeal = block.Seal
		}
	}

	return chain
}

// ============================================================
// 7. Cross-Substrate Verification
// ============================================================

func CrossVerify(substrateA string, substrateB string) bool {
	sa, okA := Substrates[substrateA]
	sb, okB := Substrates[substrateB]

	if !okA || !okB {
		return false
	}

	return sa.PhiC >= GhostThreshold && sb.PhiC >= GhostThreshold
}

// ============================================================
// 8. Utility Functions
// ============================================================

func computeSeal(data string) string {
	h := sha3.New256()
	h.Write([]byte(data))
	return hex.EncodeToString(h.Sum(nil))
}

func GetPhiC(substrateID string) float64 {
	s, ok := Substrates[substrateID]
	if !ok {
		return 0.0
	}
	return s.PhiC
}

func GetStatus(substrateID string) string {
	s, ok := Substrates[substrateID]
	if !ok {
		return "UNKNOWN"
	}
	return s.Status
}

func GetArchitect() string {
	return ArchitectORCID
}

func GetGhostThreshold() float64 {
	return GhostThreshold
}

func GetArkheVersion() string {
	return ArkheVersion
}

// ============================================================
// 9. Query Functions (for gnoweb rendering)
// ============================================================

func Render(path string) string {
	parts := strings.Split(path, "/")
	if len(parts) < 2 {
		return renderHome()
	}

	switch parts[1] {
	case "substrate":
		if len(parts) >= 3 {
			return renderSubstrate(parts[2])
		}
	case "decree":
		if len(parts) >= 3 {
			return renderDecree(parts[2])
		}
	case "chain":
		return renderTemporalChain()
	case "stats":
		return renderStats()
	}

	return renderHome()
}

func renderHome() string {
	return "# ARKHE Canonical Realm\n\n" +
		"**Status:** CANONIZED_PROVISIONAL\n\n" +
		"**Architect:** ORCID " + ArchitectORCID + "\n\n" +
		"**Version:** " + ArkheVersion + "\n\n" +
		"**Substrates:** " + ufmt.Sprintf("%d", len(Substrates)) + "\n\n" +
		"**Decrees:** " + ufmt.Sprintf("%d", len(Decrees)) + "\n\n" +
		"**Temporal Blocks:** " + ufmt.Sprintf("%d", len(TemporalChain)) + "\n\n" +
		"---\n\n" +
		"### Navigation\n\n" +
		"- [/substrate/{id}](/r/arkherealms/substrate/{id})\n" +
		"- [/decree/{id}](/r/arkherealms/decree/{id})\n" +
		"- [/chain](/r/arkherealms/chain)\n" +
		"- [/stats](/r/arkherealms/stats)\n"
}

func renderSubstrate(id string) string {
	s, ok := Substrates[id]
	if !ok {
		return "## Substrate Not Found\n\nID: " + id
	}

	return "## Substrate " + id + "\n\n" +
		"**Phi-C:** " + ufmt.Sprintf("%.3f", s.PhiC) + "\n\n" +
		"**Status:** " + s.Status + "\n\n" +
		"**Seal:** `" + s.Seal[:16] + "...`\n\n" +
		"**Timestamp:** " + time.Unix(s.Timestamp, 0).Format("2006-01-02 15:04:05") + "\n\n" +
		"**Architect:** " + s.Architect + "\n"
}

func renderDecree(id string) string {
	d, ok := Decrees[id]
	if !ok {
		return "## Decree Not Found\n\nID: " + id
	}

	return "## Decree " + id + "\n\n" +
		"**Substrate:** " + d.SubstrateID + "\n\n" +
		"**Status:** " + d.Status + "\n\n" +
		"**Seal:** `" + d.Seal[:16] + "...`\n\n" +
		"**Content:**\n\n```\n" + d.Content + "\n```\n"
}

func renderTemporalChain() string {
	out := "## Temporal Chain\n\n"
	for _, block := range TemporalChain {
		out += "### Block " + block.ThetaID + "\n\n" +
			"**Phi-C:** " + ufmt.Sprintf("%.3f", block.PhiC) + "\n\n" +
			"**Seal:** `" + block.Seal[:16] + "...`\n\n" +
			"**Timestamp:** " + time.Unix(block.Timestamp, 0).Format("2006-01-02 15:04:05") + "\n\n" +
			"---\n\n"
	}
	return out
}

func renderStats() string {
	return "## ARKHE Statistics\n\n" +
		"| Metric | Value |\n" +
		"|--------|-------|\n" +
		"| Substrates | " + ufmt.Sprintf("%d", len(Substrates)) + " |\n" +
		"| Invariants | " + ufmt.Sprintf("%d", len(Invariants)) + " |\n" +
		"| Decrees | " + ufmt.Sprintf("%d", len(Decrees)) + " |\n" +
		"| Temporal Blocks | " + ufmt.Sprintf("%d", len(TemporalChain)) + " |\n" +
		"| Ghost Threshold | " + ufmt.Sprintf("%.3f", GhostThreshold) + " |\n" +
		"| Arkhe Version | " + ArkheVersion + " |\n"
}
