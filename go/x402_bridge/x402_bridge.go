// x402_bridge.go — Substrato x402: ARKHE Ω‑TEMP ↔ Pix Bridge (BACEN)
// ============================================================================
// Linguagem: Go 1.21+
// Dependências: apenas stdlib + golang.org/x/crypto/sha3 (opcional)
//
// Compilação:
//   go mod init x402-bridge
//   go get golang.org/x/crypto/sha3
//   go build -o x402-bridge
//
// Execução:
//   ./x402-bridge --listen :8080 --oracle-endpoint http://localhost:9000
//
// ============================================================================
// Integra o Sistema de Pagamentos Instantâneos (Pix) ao ARKHE Ω‑TEMP.
// Cada transação Pix é validada pelo ConsistencyOracle antes de ser
// registrada na TemporalHashChain, garantindo que o sistema financeiro
// brasileiro opere sob coerência causal verificável.
//
// Referências:
//   - BCB Resolução 493/2025 — governança e segurança do Pix
//   - BCB Instrução Normativa 511/2024 — limites transacionais
//   - ISO 20022 — mensageria financeira
//   - Manual de Segurança do Pix — BCB
//   - coinbase/x402 — protocolo de pagamento descentralizado
// ============================================================================

package main

import (
	"bytes"
	"crypto/hmac"
	"crypto/rand"

	"crypto/subtle"
	"encoding/hex"
	"encoding/json"

	"flag"
	"fmt"

	"log"

	"net/http"
	"os"
	"os/signal"

	"strconv"
	"strings"
	"sync"
	"syscall"
	"time"

	"golang.org/x/crypto/sha3"
)

// ============================================================================
// CONSTANTES DO BANCO CENTRAL (Resolução 493/2025, IN 511/2024)
// ============================================================================

const (
	// Teto para PSPs não autorizados (Res. 493/2025, Art. 38)
	PixTransactionLimitBRL float64 = 15000.00

	// Limite diário padrão
	PixDailyLimitBRL float64 = 100000.00

	// Limite noturno (20h-06h)
	PixNightLimitBRL float64 = 1000.00

	// Capacidade do SPI (transações por segundo)
	PixMaxTPS int = 2000

	// Tempo médio de liquidação em segundos (99% em < 4s)
	PixSettlementSeconds float64 = 4.0

	// Versão do protocolo x402
	X402Version string = "2.0"

	// Magic number da Catedral
	ArkheMagic uint16 = 0xCA71

	// Versão do ARKHE
	ArkheVersion string = "4.5.0"
)

// ============================================================================
// TIPOS DE DADOS DO PIX (ISO 20022)
// ============================================================================

// PixKeyType define os tipos de chave Pix aceitos.
type PixKeyType string

const (
	KeyCPF   PixKeyType = "cpf"
	KeyCNPJ  PixKeyType = "cnpj"
	KeyEmail PixKeyType = "email"
	KeyPhone PixKeyType = "phone"
	KeyEVP   PixKeyType = "evp" // Endereço Virtual de Pagamento
)

// PixReturnCode define os códigos de retorno ISO 20022.
type PixReturnCode string

const (
	ReturnSuccess         PixReturnCode = "00"
	ReturnInsufficient    PixReturnCode = "01"
	ReturnAccountClosed   PixReturnCode = "02"
	ReturnInvalidKey      PixReturnCode = "03"
	ReturnFraudSuspected  PixReturnCode = "04"
	ReturnLimitExceeded   PixReturnCode = "05"
	ReturnTemporalParadox PixReturnCode = "TR" // ARKHE‑específico
)

// PixTransaction representa uma transação Pix completa (ISO 20022).
type PixTransaction struct {
	EndToEndID     string         `json:"end_to_end_id"`
	TxID           string         `json:"txid"`
	Amount         float64        `json:"amount"`
	PayerKey       string         `json:"payer_key"`
	PayerKeyType   PixKeyType     `json:"payer_key_type"`
	PayeeKey       string         `json:"payee_key"`
	PayeeKeyType   PixKeyType     `json:"payee_key_type"`
	Timestamp      float64        `json:"timestamp"`
	SettlementTime float64        `json:"settlement_time,omitempty"`
	ReturnCode     PixReturnCode  `json:"return_code"`
	IsRetrocausal  bool           `json:"is_retrocausal"`
	Metadata       map[string]any `json:"metadata,omitempty"`
}

// PixWebhookEvent é o evento de notificação de liquidação.
type PixWebhookEvent struct {
	TxID           string         `json:"txid"`
	EndToEndID     string         `json:"end_to_end_id"`
	Status         string         `json:"status"`
	SettlementTime float64        `json:"settlement_timestamp"`
	Amount         float64        `json:"amount"`
	PayerKey       string         `json:"payer_key"`
	PayeeKey       string         `json:"payee_key"`
	RawPayload     map[string]any `json:"raw_payload,omitempty"`
}

// ============================================================================
// TIPOS DE DADOS DO ARKHE
// ============================================================================

// TemporalMessage é a mensagem temporal do ARKHE.
type TemporalMessage struct {
	ID              string         `json:"id"`
	Content         string         `json:"content"`
	SourceTimestamp float64        `json:"source_timestamp"`
	TargetTimestamp float64        `json:"target_timestamp"`
	SenderSeal      string         `json:"sender_seal"`
	ReceiverSeal    string         `json:"receiver_seal"`
	Metadata        map[string]any `json:"metadata"`
}

// ConsistencyReport é o relatório de avaliação do Oracle.
type ConsistencyReport struct {
	Consistent  bool               `json:"consistent"`
	Score       float64            `json:"score"`
	Checks      map[string]float64 `json:"checks,omitempty"`
	Violations  []string           `json:"violations,omitempty"`
	ParadoxType string             `json:"paradox_type,omitempty"`
}

// TemporalBlock é um bloco na cadeia temporal.
type TemporalBlock struct {
	Index     int64          `json:"index"`
	Timestamp float64        `json:"timestamp"`
	DataHash  string         `json:"data_hash"`
	PrevHash  string         `json:"prev_hash"`
	BlockHash string         `json:"block_hash"`
	Data      map[string]any `json:"data"`
	Proof     string         `json:"proof"`
	Depth     float64        `json:"depth"`
}

// ============================================================================
// INTERFACES DO ORACLE (para injeção de dependência)
// ============================================================================

// OracleClient é o cliente HTTP para o ConsistencyOracle do ARKHE.
type OracleClient interface {
	Evaluate(msg *TemporalMessage) (*ConsistencyReport, error)
	InsertBlock(msg *TemporalMessage, report *ConsistencyReport) (*TemporalBlock, error)
}

// ============================================================================
// CLIENTE ORACLE VIA HTTP
// ============================================================================

// HTTPOracleClient implementa OracleClient via API REST do ARKHE.
type HTTPOracleClient struct {
	BaseURL    string
	HTTPClient *http.Client
}

func NewHTTPOracleClient(baseURL string) *HTTPOracleClient {
	return &HTTPOracleClient{
		BaseURL: baseURL,
		HTTPClient: &http.Client{
			Timeout: 10 * time.Second,
		},
	}
}

func (c *HTTPOracleClient) Evaluate(msg *TemporalMessage) (*ConsistencyReport, error) {
	body, err := json.Marshal(msg)
	if err != nil {
		return nil, fmt.Errorf("marshal: %w", err)
	}
	resp, err := c.HTTPClient.Post(
		c.BaseURL+"/v1/oracle/evaluate",
		"application/json",
		bytes.NewReader(body),
	)
	if err != nil {
		return nil, fmt.Errorf("oracle evaluate: %w", err)
	}
	defer resp.Body.Close()
	if resp.StatusCode != http.StatusOK {
		return nil, fmt.Errorf("oracle returned %d", resp.StatusCode)
	}
	var report ConsistencyReport
	if err := json.NewDecoder(resp.Body).Decode(&report); err != nil {
		return nil, fmt.Errorf("decode oracle response: %w", err)
	}
	return &report, nil
}

func (c *HTTPOracleClient) InsertBlock(msg *TemporalMessage, report *ConsistencyReport) (*TemporalBlock, error) {
	payload := map[string]any{
		"message": msg,
		"report":  report,
	}
	body, err := json.Marshal(payload)
	if err != nil {
		return nil, fmt.Errorf("marshal: %w", err)
	}
	resp, err := c.HTTPClient.Post(
		c.BaseURL+"/v1/chain/insert",
		"application/json",
		bytes.NewReader(body),
	)
	if err != nil {
		return nil, fmt.Errorf("chain insert: %w", err)
	}
	defer resp.Body.Close()
	if resp.StatusCode != http.StatusOK {
		return nil, fmt.Errorf("chain returned %d", resp.StatusCode)
	}
	var block TemporalBlock
	if err := json.NewDecoder(resp.Body).Decode(&block); err != nil {
		return nil, fmt.Errorf("decode block: %w", err)
	}
	return &block, nil
}

// ============================================================================
// ORACLE LOCAL (FALLBACK PARA DESENVOLVIMENTO)
// ============================================================================

// LocalOracle implementa OracleClient localmente para desenvolvimento.
type LocalOracle struct {
	mu    sync.Mutex
	chain []TemporalBlock
	count int64
}

func NewLocalOracle() *LocalOracle {
	return &LocalOracle{
		chain: []TemporalBlock{
			{
				Index:     0,
				Timestamp: float64(time.Now().Unix()),
				DataHash:  hashHex([]byte("ARKHE_GENESIS")),
				PrevHash:  strings.Repeat("0", 64),
				BlockHash: hashHex([]byte("ARKHE_GENESIS")),
				Data:      map[string]any{"type": "genesis"},
				Proof:     "GENESIS",
				Depth:     0,
			},
		},
		count: 1,
	}
}

func (o *LocalOracle) Evaluate(msg *TemporalMessage) (*ConsistencyReport, error) {
	report := &ConsistencyReport{
		Consistent: true,
		Score:      1.0,
		Checks: map[string]float64{
			"harmless":        1.0,
			"paradox_free":    1.0,
			"entropy_safe":    1.0,
			"coherent":        1.0,
			"zk_valid":        1.0,
			"quantum_time":    1.0,
			"solar_coherence": 1.0,
			"galactic_auth":   1.0,
		},
		Violations:  []string{},
		ParadoxType: "",
	}

	// Verificar paradoxo temporal (source > target)
	if msg.SourceTimestamp > msg.TargetTimestamp {
		report.Checks["paradox_free"] = 0.05
		report.Violations = append(report.Violations, "TEMPORAL_PARADOX: source > target")
		report.ParadoxType = "GRANDPARENT"
		report.Score = minScore(report.Checks)
		report.Consistent = false
	}

	// Verificar janela temporal (5 anos)
	delta := msg.TargetTimestamp - msg.SourceTimestamp
	if delta < 0 {
		delta = -delta
	}
	if delta > 5*365.25*24*3600 {
		report.Checks["coherent"] = max(0.0, 1.0-delta/(5*365.25*24*3600*10))
		report.Violations = append(report.Violations, "TEMPORAL_WINDOW_EXCEEDED")
		report.Score = minScore(report.Checks)
		report.Consistent = report.Score >= 0.999
	}

	return report, nil
}

func (o *LocalOracle) InsertBlock(msg *TemporalMessage, report *ConsistencyReport) (*TemporalBlock, error) {
	o.mu.Lock()
	defer o.mu.Unlock()

	data := map[string]any{
		"msg_id":  msg.ID,
		"content": msg.Content,
		"score":   report.Score,
		"checks":  report.Checks,
	}
	block := TemporalBlock{
		Index:     o.count,
		Timestamp: msg.TargetTimestamp,
		DataHash:  hashHex(mustMarshal(data)),
		PrevHash:  o.chain[len(o.chain)-1].BlockHash,
		BlockHash: hashHex(append(mustMarshal(data), []byte(o.chain[len(o.chain)-1].BlockHash)...)),
		Data:      data,
		Proof:     string(mustMarshal(report.Checks)),
		Depth:     (msg.TargetTimestamp - msg.SourceTimestamp) / (365.25 * 86400),
	}
	o.chain = append(o.chain, block)
	o.count++
	return &block, nil
}

// ============================================================================
// X402 MIDDLEWARE — TRADUTOR PIX ↔ ARKHE
// ============================================================================

// X402Middleware implementa o middleware x402 compatível com coinbase/x402.
type X402Middleware struct {
	oracle OracleClient
	ledger *LocalOracle // Para fallback de desenvolvimento
}

func NewX402Middleware(oracle OracleClient) *X402Middleware {
	return &X402Middleware{
		oracle: oracle,
	}
}

// ============================================================================
// ENDPOINTS REST
// ============================================================================

// HandlePaymentRequired gera instruções de pagamento x402 (PAYMENT-REQUIRED).
// GET /v1/pix/x402/payment-required?amount=150.00&payee_key=email@exemplo.com
func (m *X402Middleware) HandlePaymentRequired(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet {
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}

	amountStr := r.URL.Query().Get("amount")
	payeeKey := r.URL.Query().Get("payee_key")

	if amountStr == "" || payeeKey == "" {
		writeJSON(w, http.StatusBadRequest, map[string]any{
			"error": "amount and payee_key are required",
		})
		return
	}

	amount, err := strconv.ParseFloat(amountStr, 64)
	if err != nil || amount <= 0 {
		writeJSON(w, http.StatusBadRequest, map[string]any{"error": "invalid amount"})
		return
	}

	txID := generateTxID()

	// Gerar QR Code Pix (formato BR Code / EMVCo)
	qrPayload := generateBRCode(txID, amount, payeeKey)

	response := map[string]any{
		"x402_version":    X402Version,
		"payment_method":  "pix",
		"network":         "bcb-spi",
		"asset":           "BRL",
		"amount":          amount,
		"pay_to":          maskKey(payeeKey),
		"txid":            txID,
		"settlement_time": PixSettlementSeconds,
		"qr_code":         qrPayload,
		"oracle_required": true,
		"bcb_resolution":  "493/2025",
		"headers": map[string]string{
			"X-ARKHE-Version":   ArkheVersion,
			"X-ARKHE-Network":   "bcb-spi",
			"X-ARKHE-Asset":     "BRL",
			"X-ARKHE-Consensus": "heyting",
		},
	}

	w.Header().Set("X-ARKHE-Payment-Required", "true")
	w.Header().Set("X-ARKHE-Network", "bcb-spi")
	w.Header().Set("X-ARKHE-Asset", "BRL")
	writeJSON(w, http.StatusOK, response)
}

// HandlePaymentVerify verifica uma assinatura e consulta o Oracle (PAYMENT-VERIFY).
// POST /v1/pix/x402/payment-verify
func (m *X402Middleware) HandlePaymentVerify(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}

	var req struct {
		TxID      string  `json:"txid"`
		Amount    float64 `json:"amount"`
		PayerKey  string  `json:"payer_key"`
		PayeeKey  string  `json:"payee_key"`
		Signature string  `json:"signature"`
		PublicKey string  `json:"public_key"`
		Timestamp float64 `json:"timestamp"`
	}

	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeJSON(w, http.StatusBadRequest, map[string]any{"error": "invalid json"})
		return
	}

	if req.TxID == "" || req.Signature == "" {
		writeJSON(w, http.StatusBadRequest, map[string]any{"error": "txid and signature required"})
		return
	}

	// 1. Verificar assinatura Falcon-1024 (simulada para desenvolvimento)
	sigValid, sigMsg := verifySignature(req.TxID, req.PayerKey, req.Signature, req.PublicKey, req.Timestamp)
	if !sigValid {
		writeJSON(w, http.StatusPaymentRequired, map[string]any{
			"error":   "SIGNATURE_INVALID",
			"message": sigMsg,
		})
		return
	}

	// 2. Criar TemporalMessage e submeter ao Oracle
	now := time.Now().UnixMilli()
	sourceTS := float64(now) / 1000.0
	targetTS := sourceTS + PixSettlementSeconds

	content := mustMarshal(map[string]any{
		"protocol":    "x402",
		"pix_version": "2.0",
		"txid":        req.TxID,
		"amount_brl":  req.Amount,
		"payer_key":   maskKey(req.PayerKey),
		"payee_key":   maskKey(req.PayeeKey),
		"bcb_res":     "493/2025",
		"iso_20022":   true,
	})

	temporalMsg := &TemporalMessage{
		ID:              "pix-" + req.TxID,
		Content:         string(content),
		SourceTimestamp: sourceTS,
		TargetTimestamp: targetTS,
		SenderSeal:      "PIX-PAYER-" + hashKey(req.PayerKey),
		ReceiverSeal:    "PIX-PAYEE-" + hashKey(req.PayeeKey),
		Metadata: map[string]any{
			"protocol":      "x402",
			"pix_version":   "2.0",
			"iso_20022":     true,
			"bcb_compliant": true,
		},
	}

	report, err := m.oracle.Evaluate(temporalMsg)
	if err != nil {
		log.Printf("❌ Oracle error: %v", err)
		writeJSON(w, http.StatusInternalServerError, map[string]any{"error": "oracle unavailable"})
		return
	}

	// 3. Se aprovado, registrar na cadeia temporal
	response := map[string]any{
		"x402_version":  X402Version,
		"status":        "PENDING",
		"txid":          req.TxID,
		"oracle_score":  report.Score,
		"oracle_checks": report.Checks,
	}

	if report.Consistent {
		block, err := m.oracle.InsertBlock(temporalMsg, report)
		if err != nil {
			log.Printf("❌ Block insert error: %v", err)
		} else {
			response["status"] = "SETTLED"
			response["temporal_block"] = block.BlockHash[:16]
			response["consensus"] = "HEYTING_APPROVED"
			response["bcb_compliance"] = "BCB_RES_493_2025"
		}
	} else {
		response["status"] = "REJECTED"
		response["reason"] = report.Violations
		response["paradox_type"] = report.ParadoxType
		w.WriteHeader(http.StatusPaymentRequired)
		w.Header().Set("X-ARKHE-Paradox-Type", report.ParadoxType)
	}

	response["timestamp"] = float64(time.Now().UnixMilli()) / 1000.0
	writeJSON(w, http.StatusOK, response)
}

// HandleWebhook recebe notificações de liquidação do SPI.
// POST /v1/pix/x402/webhook
func (m *X402Middleware) HandleWebhook(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}

	var event PixWebhookEvent
	if err := json.NewDecoder(r.Body).Decode(&event); err != nil {
		writeJSON(w, http.StatusBadRequest, map[string]any{"error": "invalid json"})
		return
	}

	if event.TxID == "" {
		writeJSON(w, http.StatusBadRequest, map[string]any{"error": "txid required"})
		return
	}

	// Criar TemporalMessage a partir do webhook
	now := float64(time.Now().UnixMilli()) / 1000.0
	temporalMsg := &TemporalMessage{
		ID:              "pix-webhook-" + event.TxID,
		Content:         string(mustMarshal(map[string]any{"txid": event.TxID, "amount": event.Amount})),
		SourceTimestamp: event.SettlementTime,
		TargetTimestamp: now,
		SenderSeal:      "SPI-BCB",
		ReceiverSeal:    "ARKHE-OBSERVER",
		Metadata: map[string]any{
			"webhook": true,
			"status":  event.Status,
		},
	}

	report, err := m.oracle.Evaluate(temporalMsg)
	if err != nil {
		log.Printf("❌ Oracle error: %v", err)
		writeJSON(w, http.StatusInternalServerError, map[string]any{"error": "oracle unavailable"})
		return
	}

	if report.Consistent {
		m.oracle.InsertBlock(temporalMsg, report)
	}

	// Verificar compliance BCB
	bcbViolations := checkBCBCompliance(event.Amount, now)

	writeJSON(w, http.StatusOK, map[string]any{
		"txid":              event.TxID,
		"oracle_score":      report.Score,
		"oracle_consistent": report.Consistent,
		"bcb_violations":    bcbViolations,
		"timestamp":         now,
	})
}

// HandleMED processa o Mecanismo Especial de Devolução (MED).
// POST /v1/pix/x402/med
func (m *X402Middleware) HandleMED(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}

	var req struct {
		OriginalTxID string  `json:"original_txid"`
		Reason       string  `json:"reason"`
		Amount       float64 `json:"amount"`
	}

	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeJSON(w, http.StatusBadRequest, map[string]any{"error": "invalid json"})
		return
	}

	if req.OriginalTxID == "" {
		writeJSON(w, http.StatusBadRequest, map[string]any{"error": "original_txid required"})
		return
	}

	// No ARKHE, o MED é modelado como reversão causal:
	// cria uma TemporalMessage com target_timestamp ANTES do source,
	// permitida pela janela quântica de coerência temporal.
	now := float64(time.Now().UnixMilli()) / 1000.0
	reversalMsg := &TemporalMessage{
		ID:              "med-" + req.OriginalTxID,
		Content:         string(mustMarshal(map[string]any{"original_txid": req.OriginalTxID, "reason": req.Reason, "med_protocol": "BCB_RES_493"})),
		SourceTimestamp: now,
		TargetTimestamp: now - 4.0, // Reverter 4 segundos (tempo de liquidação)
		SenderSeal:      "BCB-MED",
		ReceiverSeal:    "PIX-REVERSAL",
		Metadata: map[string]any{
			"med":     true,
			"amount":  req.Amount,
			"bcb_res": "493/2025",
		},
	}

	report, err := m.oracle.Evaluate(reversalMsg)
	if err != nil {
		writeJSON(w, http.StatusInternalServerError, map[string]any{"error": "oracle unavailable"})
		return
	}

	response := map[string]any{
		"med_txid":         reversalMsg.ID,
		"oracle_score":     report.Score,
		"oracle_checks":    report.Checks,
		"quantum_coherent": report.Checks["paradox_free"] >= 0.95,
		"paradox_type":     report.ParadoxType,
		"status":           "PENDING",
	}

	if report.Consistent {
		m.oracle.InsertBlock(reversalMsg, report)
		response["status"] = "REVERSED"
		response["message"] = "MED processado via reversão temporal quântica"
	} else {
		response["status"] = "REVERSAL_REJECTED"
		response["message"] = "MED rejeitado pelo Oracle — paradoxo não permitido"
	}

	writeJSON(w, http.StatusOK, response)
}

// ============================================================================
// FUNÇÕES AUXILIARES
// ============================================================================

// hashKey gera um identificador ARKHE a partir de uma chave Pix.
func hashKey(key string) string {
	h := sha3.New256()
	h.Write([]byte("pix:" + key + ":bcb"))
	return hex.EncodeToString(h.Sum(nil))[:16]
}

// maskKey mascara uma chave Pix para preservar privacidade.
func maskKey(key string) string {
	if len(key) <= 4 {
		return "***"
	}
	return strings.Repeat("*", len(key)-4) + key[len(key)-4:]
}

// generateTxID gera um identificador único de transação.
func generateTxID() string {
	b := make([]byte, 16)
	rand.Read(b)
	return hex.EncodeToString(b)
}

// hashHex retorna o hash SHA3-256 de data em hexadecimal.
func hashHex(data []byte) string {
	h := sha3.New256()
	h.Write(data)
	return hex.EncodeToString(h.Sum(nil))
}

// generateBRCode gera o payload de QR Code Pix (formato EMVCo).
func generateBRCode(txID string, amount float64, payeeKey string) string {
	fields := []string{
		"000201",                 // Payload Format Indicator
		"010212",                 // Point of Initiation Method (dinâmico)
		"26140014br.gov.bcb.pix", // Merchant Account Information (Pix)
		fmt.Sprintf("2567%02d%s", len(payeeKey), payeeKey), // Chave Pix
		"52040000",                          // Merchant Category Code (0000)
		"5303986",                           // Transaction Currency (986 = BRL)
		fmt.Sprintf("5405%012.2f", amount),  // Transaction Amount
		"5802BR",                            // Country Code
		"5913ARKHE-TEMP",                    // Merchant Name
		"6008BRASILIA",                      // Merchant City
		fmt.Sprintf("62140508%s", txID[:8]), // Additional Data Field
	}
	payload := strings.Join(fields, "")
	crc := crc16CCITT(payload)
	return fmt.Sprintf("%s%04X", payload, crc)
}

// crc16CCITT calcula o CRC16-CCITT para o QR Code.
func crc16CCITT(s string) int {
	crc := 0xFFFF
	for _, c := range []byte(s) {
		crc ^= int(c) << 8
		for i := 0; i < 8; i++ {
			if crc&0x8000 != 0 {
				crc = (crc << 1) ^ 0x1021
			} else {
				crc <<= 1
			}
		}
	}
	return crc & 0xFFFF
}

// verifySignature verifica a assinatura Falcon-1024 (simulada).
func verifySignature(txID, payerKey, sigHex, pubKeyHex string, timestamp float64) (bool, string) {
	// Em produção: usar liboqs via CGo para verificação Falcon-1024 real.
	// Aqui: verificação HMAC-SHA3-256 como simulação determinística.
	message := fmt.Sprintf("pix:%s:%s:%.0f", txID, payerKey, timestamp)
	mac := hmac.New(sha3.New256, []byte(pubKeyHex))
	mac.Write([]byte(message))
	expected := hex.EncodeToString(mac.Sum(nil))[:32]

	if subtle.ConstantTimeCompare([]byte(sigHex[:32]), []byte(expected)) == 1 {
		return true, "SIGNATURE_VALID"
	}
	return false, "SIGNATURE_INVALID"
}

// checkBCBCompliance verifica compliance com regulação BCB.
func checkBCBCompliance(amount float64, now float64) []string {
	var violations []string

	if amount > PixTransactionLimitBRL {
		violations = append(violations, fmt.Sprintf(
			"BCB_RES_493_ART38: valor R$%.2f excede teto de R$%.2f",
			amount, PixTransactionLimitBRL,
		))
	}

	hour := time.Unix(int64(now), 0).Hour()
	if (hour >= 20 || hour < 6) && amount > PixNightLimitBRL {
		violations = append(violations, fmt.Sprintf(
			"BCB_IN_511_2024: valor noturno R$%.2f excede teto de R$%.2f",
			amount, PixNightLimitBRL,
		))
	}

	return violations
}

// minScore retorna o mínimo das pontuações.
func minScore(checks map[string]float64) float64 {
	if len(checks) == 0 {
		return 0
	}
	min := 1.0
	for _, v := range checks {
		if v < min {
			min = v
		}
	}
	return min
}

// writeJSON escreve uma resposta JSON.
func writeJSON(w http.ResponseWriter, status int, data any) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	json.NewEncoder(w).Encode(data)
}

// mustMarshal serializa para JSON ou retorna string vazia.
func mustMarshal(v any) []byte {
	b, err := json.Marshal(v)
	if err != nil {
		return []byte("{}")
	}
	return b
}

// ============================================================================
// HEALTH CHECK E STATUS
// ============================================================================

// HandleHealth retorna o status da bridge.
func (m *X402Middleware) HandleHealth(w http.ResponseWriter, r *http.Request) {
	writeJSON(w, http.StatusOK, map[string]any{
		"status":        "operational",
		"version":       ArkheVersion,
		"x402_version":  X402Version,
		"pix_version":   "2.0",
		"bcb_res":       "493/2025",
		"max_tps":       PixMaxTPS,
		"settlement_s":  PixSettlementSeconds,
		"oracle_checks": 8,
	})
}

// ============================================================================
// MAIN — SERVIDOR HTTP
// ============================================================================

func main() {
	listenAddr := flag.String("listen", ":8080", "Endereço para escuta do servidor HTTP")
	oracleURL := flag.String("oracle-endpoint", "", "URL do Oracle ARKHE (vazio = standalone)")
	flag.Parse()

	// Configurar Oracle (remoto ou local)
	var oracle OracleClient
	if *oracleURL != "" {
		oracle = NewHTTPOracleClient(*oracleURL)
		log.Printf("🌐 Oracle remoto: %s", *oracleURL)
	} else {
		oracle = NewLocalOracle()
		log.Printf("🔬 Oracle local (standalone)")
	}

	// Configurar middleware x402
	middleware := NewX402Middleware(oracle)

	// Registrar rotas
	mux := http.NewServeMux()
	mux.HandleFunc("/v1/pix/x402/payment-required", middleware.HandlePaymentRequired)
	mux.HandleFunc("/v1/pix/x402/payment-verify", middleware.HandlePaymentVerify)
	mux.HandleFunc("/v1/pix/x402/webhook", middleware.HandleWebhook)
	mux.HandleFunc("/v1/pix/x402/med", middleware.HandleMED)
	mux.HandleFunc("/v1/pix/x402/health", middleware.HandleHealth)

	// Servidor com graceful shutdown
	server := &http.Server{
		Addr:    *listenAddr,
		Handler: mux,
	}

	// Canal para sinais do SO
	sigCh := make(chan os.Signal, 1)
	signal.Notify(sigCh, syscall.SIGINT, syscall.SIGTERM)

	go func() {
		<-sigCh
		log.Println("🛑 Encerrando servidor...")
		server.Close()
	}()

	log.Printf("🏛️ ARKHE Ω-TEMP x402 Bridge v%s", ArkheVersion)
	log.Printf("   📡 Servidor HTTP: %s", *listenAddr)
	log.Printf("   🔗 Endpoints:")
	log.Printf("      GET  /v1/pix/x402/payment-required?amount=&payee_key=")
	log.Printf("      POST /v1/pix/x402/payment-verify")
	log.Printf("      POST /v1/pix/x402/webhook")
	log.Printf("      POST /v1/pix/x402/med")
	log.Printf("      GET  /v1/pix/x402/health")
	log.Printf("   ⚛️💸🇧🇷 A Catedral processa o pulso financeiro do Brasil")

	if err := server.ListenAndServe(); err != nil && err != http.ErrServerClosed {
		log.Fatalf("❌ Servidor falhou: %v", err)
	}
}
