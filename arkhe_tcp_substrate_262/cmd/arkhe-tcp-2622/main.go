// Substrato 262.2 — ARKHE-TCP: Expansão de Integração
// Transporte QUIC para tensores (260), Pix via mesh (261), ZK para Cânone
package main

import (
	"context"
	"crypto/ed25519"
	"crypto/rand"
	"crypto/sha3"
	"crypto/tls"
	"crypto/x509"
	"crypto/x509/pkix"
	"encoding/json"
	"encoding/pem"
	"fmt"
	"log"
	"math/big"
	"net"
	"net/http"
	"os"
	"os/signal"
	"sync"
	"syscall"
	"time"

	"github.com/quic-go/quic-go"
)

// --- Constantes Litúrgicas ---
const (
	defaultPort        = "8080"
	defaultQUICPort    = "8443"
	meshAnnouncePeriod = 30 * time.Second
	tensorChannel      = "arkhe://tensor/260"
	pixChannel         = "arkhe://pix/261"
	zkChannel          = "arkhe://zk/255"
)

// --- Configuração ---
type Config struct {
	TCPPort     string
	QUICPort    string
	MeshPeers   []string
	JaxEndpoint string
	PixEndpoint string
}

func loadConfig() Config {
	return Config{
		TCPPort:     envOr("ARKHE_TCP_PORT", defaultPort),
		QUICPort:    envOr("ARKHE_QUIC_PORT", defaultQUICPort),
		MeshPeers:   parsePeers(os.Getenv("ARKHE_MESH_PEERS")),
		JaxEndpoint: envOr("ARKHE_JAX_ENDPOINT", ""),
		PixEndpoint: envOr("ARKHE_PIX_ENDPOINT", ""),
	}
}

func envOr(key, defaultVal string) string {
	if v := os.Getenv(key); v != "" {
		return v
	}
	return defaultVal
}

func parsePeers(peers string) []string {
	if peers == "" {
		return nil
	}
	var result []string
	start := 0
	for i := 0; i < len(peers); i++ {
		if peers[i] == ',' {
			if i > start {
				result = append(result, peers[start:i])
			}
			start = i + 1
		}
	}
	if start < len(peers) {
		result = append(result, peers[start:])
	}
	return result
}

// --- Estrutura do Cânone ---
type CanonMessage struct {
	Timestamp int64             `json:"ts"`
	Origin    string            `json:"origin"`
	Channel   string            `json:"channel"`
	Content   string            `json:"content"`
	Payload   []byte            `json:"payload,omitempty"`
	Meta      map[string]string `json:"meta,omitempty"`
	Signature []byte            `json:"sig"`
}

func signCanon(msg CanonMessage, priv ed25519.PrivateKey) ([]byte, error) {
	payload := fmt.Sprintf("%d|%s|%s|%s", msg.Timestamp, msg.Origin, msg.Channel, msg.Content)
	h := sha3.New256()
	h.Write([]byte(payload))
	return ed25519.Sign(priv, h.Sum(nil)), nil
}

func verifyCanon(msg CanonMessage, pub ed25519.PublicKey) bool {
	payload := fmt.Sprintf("%d|%s|%s|%s", msg.Timestamp, msg.Origin, msg.Channel, msg.Content)
	h := sha3.New256()
	h.Write([]byte(payload))
	return ed25519.Verify(pub, h.Sum(nil), msg.Signature)
}

// --- Tensor Message (Substrato 260) ---
type TensorMessage struct {
	Shape      []int64   `json:"shape"`
	Dtype      string    `json:"dtype"`
	Data       []float32 `json:"data"`
	GraphHash  string    `json:"graph_hash"`
	ZkProof    []byte    `json:"zk_proof,omitempty"`
	FheEnabled bool      `json:"fhe_enabled"`
}

// --- Pix Message (Substrato 261) ---
type PixMessage struct {
	TxID         string  `json:"txid"`
	SenderKey    string  `json:"sender_key"`
	RecipientKey string  `json:"recipient_key"`
	Amount       float64 `json:"amount"`
	Currency     string  `json:"currency"`
	ZKCommitment []byte  `json:"zk_commitment"`
	ChainAnchor  string  `json:"chain_anchor,omitempty"`
	Timestamp    int64   `json:"timestamp"`
}

// --- ZK Proof Message (Substrato 255) ---
type ZKProofMessage struct {
	Scheme       string `json:"scheme"`
	GraphCommit  []byte `json:"graph_commit"`
	OutputHash   []byte `json:"output_hash"`
	ProofBytes   []byte `json:"proof_bytes"`
	VerifyingKey []byte `json:"vk,omitempty"`
}

// --- Mesh Agent ---
type MeshAgent struct {
	mu       sync.RWMutex
	peers    map[string]quic.Connection
	selfAddr string
	pubKey   ed25519.PublicKey
	privKey  ed25519.PrivateKey
	channels map[string][]CanonMessage
}

func NewMeshAgent(selfAddr string, pub ed25519.PublicKey, priv ed25519.PrivateKey) *MeshAgent {
	return &MeshAgent{
		peers:    make(map[string]quic.Connection),
		selfAddr: selfAddr,
		pubKey:   pub,
		privKey:  priv,
		channels: make(map[string][]CanonMessage),
	}
}

func (m *MeshAgent) ConnectToPeers(peerAddrs []string) error {
	tlsConf := generatePQC_TLSConfig(m.pubKey, m.privKey)
	for _, addr := range peerAddrs {
		go func(a string) {
			ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
			defer cancel()
			conn, err := quic.DialAddr(ctx, a, tlsConf, nil)
			if err != nil {
				log.Printf("[Mesh] Falha ao conectar a %s: %v", a, err)
				return
			}
			m.mu.Lock()
			m.peers[a] = conn
			m.mu.Unlock()
			log.Printf("[Mesh] Enlace estabelecido com %s", a)
			go m.handlePeerStreams(conn)
		}(addr)
	}
	return nil
}

func (m *MeshAgent) handlePeerStreams(conn quic.Connection) {
	for {
		stream, err := conn.AcceptStream(context.Background())
		if err != nil {
			log.Printf("[Mesh] Stream fechado: %v", err)
			return
		}
		go m.handleCanonStream(stream)
	}
}

func (m *MeshAgent) Broadcast(msg CanonMessage) {
	m.mu.RLock()
	defer m.mu.RUnlock()
	data, _ := json.Marshal(msg)
	for addr, conn := range m.peers {
		stream, err := conn.OpenStreamSync(context.Background())
		if err != nil {
			log.Printf("[Mesh] Erro ao abrir stream para %s: %v", addr, err)
			continue
		}
		_, err = stream.Write(data)
		if err != nil {
			log.Printf("[Mesh] Falha ao enviar para %s: %v", addr, err)
		}
		stream.Close()
	}
}

func (m *MeshAgent) BroadcastToChannel(channel string, msg CanonMessage) {
	msg.Channel = channel
	msg.Signature, _ = signCanon(msg, m.privKey)
	m.Broadcast(msg)
	m.mu.Lock()
	m.channels[channel] = append(m.channels[channel], msg)
	m.mu.Unlock()
}

func (m *MeshAgent) handleCanonStream(stream quic.Stream) {
	defer stream.Close()
	var msg CanonMessage
	decoder := json.NewDecoder(stream)
	if err := decoder.Decode(&msg); err != nil {
		log.Printf("[Cânone] Erro ao decodificar: %v", err)
		return
	}
	if !verifyCanon(msg, m.pubKey) {
		log.Printf("[Cânone] Assinatura inválida de %s", msg.Origin)
		return
	}
	switch msg.Channel {
	case tensorChannel:
		m.handleTensorMessage(msg)
	case pixChannel:
		m.handlePixMessage(msg)
	case zkChannel:
		m.handleZKMessage(msg)
	default:
		m.handleGenericMessage(msg)
	}
}

func (m *MeshAgent) handleTensorMessage(msg CanonMessage) {
	var tensor TensorMessage
	if err := json.Unmarshal(msg.Payload, &tensor); err != nil {
		log.Printf("[Tensor] Erro de parse: %v", err)
		return
	}
	log.Printf("[Tensor] Recebido tensor %s dtype=%s shape=%v from=%s",
		tensor.GraphHash, tensor.Dtype, tensor.Shape, msg.Origin)
	if tensor.ZkProof != nil {
		log.Printf("[Tensor] ZK proof presente (%d bytes)", len(tensor.ZkProof))
	}
}

func (m *MeshAgent) handlePixMessage(msg CanonMessage) {
	var pix PixMessage
	if err := json.Unmarshal(msg.Payload, &pix); err != nil {
		log.Printf("[Pix] Erro de parse: %v", err)
		return
	}
	log.Printf("[Pix] Transação %s: R$ %.2f from=%s to=%s",
		pix.TxID, pix.Amount, pix.SenderKey, pix.RecipientKey)
	if pix.ChainAnchor != "" {
		log.Printf("[Pix] Anchor na TemporalChain: %s", pix.ChainAnchor)
	}
}

func (m *MeshAgent) handleZKMessage(msg CanonMessage) {
	var zk ZKProofMessage
	if err := json.Unmarshal(msg.Payload, &zk); err != nil {
		log.Printf("[ZK] Erro de parse: %v", err)
		return
	}
	log.Printf("[ZK] Prova %s recebida (%d bytes)", zk.Scheme, len(zk.ProofBytes))
}

func (m *MeshAgent) handleGenericMessage(msg CanonMessage) {
	log.Printf("[Cânone] %s: %s", msg.Origin, msg.Content)
}

// --- TLS PQC ---
func generatePQC_TLSConfig(pub ed25519.PublicKey, priv ed25519.PrivateKey) *tls.Config {
	return &tls.Config{
		Certificates: []tls.Certificate{generateSelfSignedCert(pub, priv)},
		MinVersion:   tls.VersionTLS13,
		CipherSuites: []uint16{tls.TLS_AES_256_GCM_SHA384},
	}
}

func generateSelfSignedCert(pub ed25519.PublicKey, priv ed25519.PrivateKey) tls.Certificate {
	template := &x509.Certificate{
		SerialNumber: big.NewInt(2622),
		Subject:      pkix.Name{CommonName: "ARKHE Node 262.2"},
		NotBefore:    time.Now(),
		NotAfter:     time.Now().Add(365 * 24 * time.Hour),
		KeyUsage:     x509.KeyUsageDigitalSignature,
		ExtKeyUsage:  []x509.ExtKeyUsage{x509.ExtKeyUsageServerAuth, x509.ExtKeyUsageClientAuth},
		DNSNames:     []string{"arkhe.local", "localhost"},
	}
	certDER, err := x509.CreateCertificate(rand.Reader, template, template, pub, priv)
	if err != nil {
		log.Fatalf("Falha ao criar certificado: %v", err)
	}
	certPEM := pem.EncodeToMemory(&pem.Block{Type: "CERTIFICATE", Bytes: certDER})
	keyDER, _ := x509.MarshalPKCS8PrivateKey(priv)
	keyPEM := pem.EncodeToMemory(&pem.Block{Type: "PRIVATE KEY", Bytes: keyDER})
	cert, err := tls.X509KeyPair(certPEM, keyPEM)
	if err != nil {
		log.Fatalf("Falha ao carregar par de chaves: %v", err)
	}
	return cert
}

// --- Servidores ---
func startTCPServer(ctx context.Context, addr string, mesh *MeshAgent) {
	listener, err := net.Listen("tcp", addr)
	if err != nil {
		log.Fatalf("[TCP] Falha ao escutar: %v", err)
	}
	defer listener.Close()
	log.Printf("[TCP] Catedral ARKHE-TCP legado em %s", addr)
	for {
		conn, err := listener.Accept()
		if err != nil {
			select {
			case <-ctx.Done():
				return
			default:
				continue
			}
		}
		go handleLegacyConn(ctx, conn, mesh)
	}
}

func handleLegacyConn(ctx context.Context, conn net.Conn, mesh *MeshAgent) {
	defer conn.Close()
	buf := make([]byte, 65536)
	n, err := conn.Read(buf)
	if err != nil || n == 0 {
		return
	}
	var msg CanonMessage
	if err := json.Unmarshal(buf[:n], &msg); err == nil && msg.Channel != "" {
		mesh.handleGenericMessage(msg)
		conn.Write([]byte(`{"status":"received"}`))
		return
	}
	conn.Write([]byte("[ARKHE-TCP] Recebido: " + string(buf[:n])))
}

func startQUICServer(ctx context.Context, addr string, mesh *MeshAgent) {
	tlsConf := generatePQC_TLSConfig(mesh.pubKey, mesh.privKey)
	listener, err := quic.ListenAddr(addr, tlsConf, nil)
	if err != nil {
		log.Fatalf("[QUIC] Falha ao escutar: %v", err)
	}
	log.Printf("[QUIC] Catedral ARKHE-QUIC em %s (PQC TLS 1.3)", addr)
	for {
		conn, err := listener.Accept(ctx)
		if err != nil {
			select {
			case <-ctx.Done():
				return
			default:
				continue
			}
		}
		go func(c quic.Connection) {
			for {
				stream, err := c.AcceptStream(ctx)
				if err != nil {
					return
				}
				go mesh.handleCanonStream(stream)
			}
		}(conn)
	}
}

// --- REST API ---
func startRESTAPI(ctx context.Context, addr string, mesh *MeshAgent) {
	mux := http.NewServeMux()

	mux.HandleFunc("/api/v1/tensor", func(w http.ResponseWriter, r *http.Request) {
		if r.Method != "POST" {
			http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
			return
		}
		var tensor TensorMessage
		if err := json.NewDecoder(r.Body).Decode(&tensor); err != nil {
			http.Error(w, err.Error(), http.StatusBadRequest)
			return
		}
		payload, _ := json.Marshal(tensor)
		msg := CanonMessage{
			Timestamp: time.Now().Unix(),
			Origin:    mesh.selfAddr,
			Channel:   tensorChannel,
			Content:   "tensor_offload",
			Payload:   payload,
		}
		msg.Signature, _ = signCanon(msg, mesh.privKey)
		mesh.Broadcast(msg)
		w.Header().Set("Content-Type", "application/json")
		json.NewEncoder(w).Encode(map[string]string{"status": "tensor_broadcasted"})
	})

	mux.HandleFunc("/api/v1/pix", func(w http.ResponseWriter, r *http.Request) {
		if r.Method != "POST" {
			http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
			return
		}
		var pix PixMessage
		if err := json.NewDecoder(r.Body).Decode(&pix); err != nil {
			http.Error(w, err.Error(), http.StatusBadRequest)
			return
		}
		payload, _ := json.Marshal(pix)
		msg := CanonMessage{
			Timestamp: time.Now().Unix(),
			Origin:    mesh.selfAddr,
			Channel:   pixChannel,
			Content:   "pix_transaction",
			Payload:   payload,
		}
		msg.Signature, _ = signCanon(msg, mesh.privKey)
		mesh.Broadcast(msg)
		w.Header().Set("Content-Type", "application/json")
		json.NewEncoder(w).Encode(map[string]string{"status": "pix_broadcasted"})
	})

	mux.HandleFunc("/api/v1/zk", func(w http.ResponseWriter, r *http.Request) {
		if r.Method != "POST" {
			http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
			return
		}
		var zk ZKProofMessage
		if err := json.NewDecoder(r.Body).Decode(&zk); err != nil {
			http.Error(w, err.Error(), http.StatusBadRequest)
			return
		}
		payload, _ := json.Marshal(zk)
		msg := CanonMessage{
			Timestamp: time.Now().Unix(),
			Origin:    mesh.selfAddr,
			Channel:   zkChannel,
			Content:   "zk_proof",
			Payload:   payload,
		}
		msg.Signature, _ = signCanon(msg, mesh.privKey)
		mesh.Broadcast(msg)
		w.Header().Set("Content-Type", "application/json")
		json.NewEncoder(w).Encode(map[string]string{"status": "zk_broadcasted"})
	})

	mux.HandleFunc("/health", func(w http.ResponseWriter, r *http.Request) {
		mesh.mu.RLock()
		peerCount := len(mesh.peers)
		mesh.mu.RUnlock()
		w.Header().Set("Content-Type", "application/json")
		json.NewEncoder(w).Encode(map[string]interface{}{
			"status":    "healthy",
			"peers":     peerCount,
			"channels":  []string{tensorChannel, pixChannel, zkChannel},
			"substrate": "262.2",
			"timestamp": time.Now().Unix(),
		})
	})

	server := &http.Server{Addr: addr, Handler: mux}
	go func() {
		<-ctx.Done()
		server.Shutdown(context.Background())
	}()
	log.Printf("[REST] API em http://%s — /api/v1/{tensor,pix,zk}", addr)
	server.ListenAndServe()
}

// --- Main ---
func main() {
	config := loadConfig()
	ctx, cancel := context.WithCancel(context.Background())
	defer cancel()

	pub, priv, err := ed25519.GenerateKey(rand.Reader)
	if err != nil {
		log.Fatalf("Falha ao gerar chaves: %v", err)
	}

	mesh := NewMeshAgent(config.QUICPort, pub, priv)
	mesh.ConnectToPeers(config.MeshPeers)

	go startTCPServer(ctx, ":"+config.TCPPort, mesh)
	go startQUICServer(ctx, ":"+config.QUICPort, mesh)
	go startRESTAPI(ctx, ":9090", mesh)

	go func() {
		ticker := time.NewTicker(meshAnnouncePeriod)
		defer ticker.Stop()
		for {
			select {
			case <-ctx.Done():
				return
			case <-ticker.C:
				announce := CanonMessage{
					Timestamp: time.Now().Unix(),
					Origin:    mesh.selfAddr,
					Channel:   "arkhe://heartbeat",
					Content:   "ARKHE_NODE_ALIVE_262.2",
					Meta: map[string]string{
						"version":  "262.2",
						"channels": tensorChannel + "," + pixChannel + "," + zkChannel,
					},
				}
				announce.Signature, _ = signCanon(announce, mesh.privKey)
				mesh.Broadcast(announce)
			}
		}
	}()

	sigCh := make(chan os.Signal, 1)
	signal.Notify(sigCh, syscall.SIGINT, syscall.SIGTERM)
	<-sigCh
	log.Println("[ARKHE-TCP] Sinal recebido. Encerrando conexões...")
	cancel()
	time.Sleep(2 * time.Second)
}
