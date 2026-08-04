package main

import (
	"encoding/json"
	"fmt"
	"time"
)

type BridgePacket struct {
	Sequence      uint64    `json:"sequence"`
	SourceChain   string    `json:"source_chain"`
	DestChain     string    `json:"dest_chain"`
	Payload       []byte    `json:"payload"`
	Timeout       uint64    `json:"timeout"`
	Timestamp     time.Time `json:"timestamp"`
	Proof         []byte    `json:"proof"`
	ZkProof       []byte    `json:"zk_proof"`
	CircleID      string    `json:"circle_id"`
	OperationType string    `json:"operation_type"`
}

type FheComputeRequest struct {
	CircuitID          string   `json:"circuit_id"`
	InputCiphertexts   [][]byte `json:"input_ciphertexts"`
	GateProgram        []GateOp `json:"gate_program"`
	ExpectedOutputBits int      `json:"expected_output_bits"`
}

type GateOp struct {
	Type   string `json:"type"`
	Inputs []int  `json:"inputs"`
	Output int    `json:"output"`
}

type BridgeRelay struct {
	gnoEndpoint   string
	octraEndpoint string
	arkheEndpoint string
	sequence      uint64
	packets       map[uint64]*BridgePacket
}

func NewBridgeRelay(gnoEP, octraEP, arkheEP string) *BridgeRelay {
	return &BridgeRelay{
		gnoEndpoint:   gnoEP,
		octraEndpoint: octraEP,
		arkheEndpoint: arkheEP,
		sequence:      0,
		packets:       make(map[uint64]*BridgePacket),
	}
}

func (r *BridgeRelay) SendFheCompute(req *FheComputeRequest, circleID string) (*BridgePacket, error) {
	r.sequence++
	payload, err := json.Marshal(req)
	if err != nil {
		return nil, fmt.Errorf("marshal request: %w", err)
	}
	packet := &BridgePacket{
		Sequence:      r.sequence,
		SourceChain:   "gno",
		DestChain:     "octra",
		Payload:       payload,
		Timeout:       uint64(time.Now().Add(5 * time.Minute).Unix()),
		Timestamp:     time.Now(),
		CircleID:      circleID,
		OperationType: "fhe_compute",
	}
	packet.Proof = r.generateMerkleProof(packet)
	r.packets[packet.Sequence] = packet
	fmt.Printf("[RELAY] Packet #%d: Gno → Octra (FHE compute, Circle: %s)\n",
		packet.Sequence, circleID)
	return packet, nil
}

func (r *BridgeRelay) RelayToArkhe(octraResult []byte, originalSeq uint64) (*BridgePacket, error) {
	r.sequence++
	packet := &BridgePacket{
		Sequence:      r.sequence,
		SourceChain:   "octra",
		DestChain:     "arkhe",
		Payload:       octraResult,
		Timeout:       uint64(time.Now().Add(5 * time.Minute).Unix()),
		Timestamp:     time.Now(),
		OperationType: "fhe_result",
	}
	refData := map[string]interface{}{
		"original_sequence": originalSeq,
		"result":            octraResult,
	}
	payload, _ := json.Marshal(refData)
	packet.Payload = payload
	packet.Proof = r.generateMerkleProof(packet)
	r.packets[packet.Sequence] = packet
	fmt.Printf("[RELAY] Packet #%d: Octra → ARKHE (FHE result, ref: #%d)\n",
		packet.Sequence, originalSeq)
	return packet, nil
}

func (r *BridgeRelay) VerifyPacket(packet *BridgePacket) error {
	if packet.Proof == nil || len(packet.Proof) == 0 {
		return fmt.Errorf("missing Merkle proof")
	}
	if !r.verifyMerkleProof(packet.Proof, packet.Payload) {
		return fmt.Errorf("invalid Merkle proof")
	}
	if packet.OperationType == "fhe_compute" || packet.OperationType == "fhe_result" {
		if packet.ZkProof == nil || len(packet.ZkProof) == 0 {
			return fmt.Errorf("missing ZK proof for FHE operation")
		}
		if !r.verifyZkProof(packet.ZkProof, packet.Payload) {
			return fmt.Errorf("invalid ZK proof")
		}
	}
	return nil
}

func (r *BridgeRelay) generateMerkleProof(packet *BridgePacket) []byte {
	return sha256Hash(packet.Payload)
}

func (r *BridgeRelay) verifyMerkleProof(proof, payload []byte) bool {
	expected := sha256Hash(payload)
	return string(proof) == string(expected)
}

func (r *BridgeRelay) verifyZkProof(proof, payload []byte) bool {
	return len(proof) > 32
}

func sha256Hash(data []byte) []byte {
	return data[:32]
}

func main() {
	fmt.Println("Relay started")
}
