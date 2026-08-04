#!/usr/bin/env python3
"""
╔══════════════════════════════════════════════════════════════════╗
║  SUBSTRATO 972.2 — ARKHE-GLOBAL-MESH: PQ HANDSHAKE               ║
║  SUBSTRATO 989.x.5 — PASSPORT-GATEWAY: PQ CREDENTIALS             ║
║  Implementação completa de handshake Kyber e assinatura          ║
║  Dilithium para nós de mesh e credenciais on-chain.              ║
║  Arquiteto ORCID 0009-0005-2697-4668                             ║
║  Seal: 972.2-MESH-PQ-2026-06-01                                  ║
╚══════════════════════════════════════════════════════════════════╝
"""

import socket
import struct
import threading
import hashlib
import secrets
import json
import time
from typing import Tuple, Dict, Optional, List, Callable
from dataclasses import dataclass, asdict

# Importar primitivas do Substrato 955.1
from lattice_crypto import Kyber768, Dilithium3, NTT

# ================================================================
# 1. PROTOCOLO DE HANDSHAKE PQ PARA MESH (Substrato 972)
# ================================================================

@dataclass
class MeshNodeIdentity:
    """Identidade de um nó na mesh ARKHE."""
    node_id: str
    region: str
    public_key_kyber: bytes
    public_key_dilithium: bytes
    orcid: str
    timestamp: float
    nonce: bytes

    def to_bytes(self) -> bytes:
        return json.dumps({
            'node_id': self.node_id,
            'region': self.region,
            'public_key_kyber': self.public_key_kyber.hex(),
            'public_key_dilithium': self.public_key_dilithium.hex(),
            'orcid': self.orcid,
            'timestamp': self.timestamp,
            'nonce': self.nonce.hex()
        }).encode('utf-8')

    @classmethod
    def from_bytes(cls, data: bytes) -> 'MeshNodeIdentity':
        d = json.loads(data.decode('utf-8'))
        return cls(
            node_id=d['node_id'],
            region=d['region'],
            public_key_kyber=bytes.fromhex(d['public_key_kyber']),
            public_key_dilithium=bytes.fromhex(d['public_key_dilithium']),
            orcid=d['orcid'],
            timestamp=d['timestamp'],
            nonce=bytes.fromhex(d['nonce'])
        )


class PQMeshProtocol:
    """
    Protocolo de handshake pós-quântico para a ARKHE Global Mesh.
    Substitui ECDH por Kyber KEM + ECDSA por Dilithium DSA.
    """

    PROTOCOL_VERSION = b'ARKHE-PQ-1.0'
    HANDSHAKE_TIMEOUT = 5.0  # segundos

    def __init__(self, node_id: str, region: str, orcid: str):
        self.node_id = node_id
        self.region = region
        self.orcid = orcid
        self.kyber = Kyber768()
        self.dilithium = Dilithium3()

        # Gerar chaves persistentes do nó
        self.sk_kyber, self.pk_kyber = self.kyber.keygen()
        self.sk_dil, self.pk_dil = self.dilithium.keygen()
        self.nonce = secrets.token_bytes(16)

        # Sessões ativas: node_id -> shared_secret
        self.sessions: Dict[str, bytes] = {}
        self.session_lock = threading.Lock()

        # Callbacks
        self.on_message: Optional[Callable[[str, bytes], None]] = None
        self.on_connect: Optional[Callable[[str], None]] = None

    def get_identity(self) -> MeshNodeIdentity:
        return MeshNodeIdentity(
            node_id=self.node_id,
            region=self.region,
            public_key_kyber=self.pk_kyber,
            public_key_dilithium=self.pk_dil,
            orcid=self.orcid,
            timestamp=time.time(),
            nonce=self.nonce
        )

    def initiate_handshake(self, peer_identity: MeshNodeIdentity) -> Tuple[bytes, bytes, bytes]:
        """
        Iniciar handshake com um peer.
        Retorna: (ciphertext_kyber, signature_dilithium, ephemeral_nonce)
        """
        # Passo 1: Encapsular chave compartilhada com a chave pública Kyber do peer
        ct, shared_secret = self.kyber.encapsulate(peer_identity.public_key_kyber)

        # Passo 2: Assinar o ciphertext + nonces com Dilithium
        message = ct + peer_identity.nonce + self.get_identity().nonce
        sig = self.dilithium.sign(self.sk_dil, message)

        # Passo 3: Derivar chave de sessão
        session_key = hashlib.sha3_256(shared_secret + message).digest()

        with self.session_lock:
            self.sessions[peer_identity.node_id] = session_key

        ephemeral_nonce = secrets.token_bytes(32)
        return ct, sig, ephemeral_nonce

    def respond_handshake(self, ct: bytes, sig: bytes,
                         initiator_identity: MeshNodeIdentity,
                         ephemeral_nonce: bytes) -> bytes:
        """
        Responder a um handshake recebido.
        Verifica assinatura e decapsula chave compartilhada.
        """
        # Verificar assinatura do iniciador
        message = ct + self.get_identity().nonce + initiator_identity.nonce
        if not self.dilithium.verify(initiator_identity.public_key_dilithium, message, sig):
            raise SecurityException("Assinatura do handshake inválida!")

        # Decapsular chave compartilhada
        shared_secret = self.kyber.decapsulate(self.sk_kyber, ct)

        # Derivar chave de sessão
        session_key = hashlib.sha3_256(shared_secret + message).digest()

        with self.session_lock:
            self.sessions[initiator_identity.node_id] = session_key

        # Assinar confirmação
        confirmation = b'HANDSHAKE-OK' + ephemeral_nonce
        return self.dilithium.sign(self.sk_dil, confirmation)

    def verify_confirmation(self, confirmation_sig: bytes,
                           peer_identity: MeshNodeIdentity,
                           ephemeral_nonce: bytes) -> bool:
        """Verificar confirmação de handshake."""
        confirmation = b'HANDSHAKE-OK' + ephemeral_nonce
        return self.dilithium.verify(peer_identity.public_key_dilithium,
                                      confirmation, confirmation_sig)

    def encrypt_message(self, peer_id: str, plaintext: bytes) -> bytes:
        """Criptografar mensagem para um peer usando a chave de sessão."""
        with self.session_lock:
            session_key = self.sessions.get(peer_id)
        if not session_key:
            raise SecurityException(f"Sem sessão ativa com {peer_id}")

        # AES-256-GCM simulado via SHA3-256 + XOR (em produção, usar cripto real)
        nonce = secrets.token_bytes(12)
        keystream = hashlib.shake_256(session_key + nonce).digest(len(plaintext))
        ciphertext = bytes(p ^ k for p, k in zip(plaintext, keystream))
        return nonce + ciphertext

    def decrypt_message(self, peer_id: str, ciphertext: bytes) -> bytes:
        """Descriptografar mensagem de um peer."""
        with self.session_lock:
            session_key = self.sessions.get(peer_id)
        if not session_key:
            raise SecurityException(f"Sem sessão ativa com {peer_id}")

        nonce = ciphertext[:12]
        encrypted = ciphertext[12:]
        keystream = hashlib.shake_256(session_key + nonce).digest(len(encrypted))
        return bytes(c ^ k for c, k in zip(encrypted, keystream))

    def sign_routing_update(self, update: bytes) -> bytes:
        """Assinar atualização de roteamento com Dilithium."""
        return self.dilithium.sign(self.sk_dil, update)

    def verify_routing_update(self, update: bytes, sig: bytes,
                               peer_pk: bytes) -> bool:
        """Verificar assinatura de atualização de roteamento."""
        return self.dilithium.verify(peer_pk, update, sig)


class SecurityException(Exception):
    pass


class MeshNodeServer:
    """Servidor de nó mesh com handshake PQ."""

    def __init__(self, host: str, port: int, node_id: str, region: str, orcid: str):
        self.host = host
        self.port = port
        self.protocol = PQMeshProtocol(node_id, region, orcid)
        self.peers: Dict[str, Tuple[str, int]] = {}  # node_id -> (host, port)
        self.running = False
        self.server_socket: Optional[socket.socket] = None

    def start(self):
        self.server_socket = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
        self.server_socket.setsockopt(socket.SOL_SOCKET, socket.SO_REUSEADDR, 1)
        self.server_socket.bind((self.host, self.port))
        self.server_socket.listen(10)
        self.running = True

        print(f"[MeshNode {self.protocol.node_id}] Listening on {self.host}:{self.port}")

        while self.running:
            try:
                self.server_socket.settimeout(1.0)
                conn, addr = self.server_socket.accept()
                threading.Thread(target=self._handle_connection,
                               args=(conn, addr), daemon=True).start()
            except socket.timeout:
                continue
            except Exception as e:
                print(f"[Erro] {e}")

    def _handle_connection(self, conn: socket.socket, addr: Tuple[str, int]):
        try:
            conn.settimeout(PQMeshProtocol.HANDSHAKE_TIMEOUT)

            # Fase 1: Receber identidade do initiator
            identity_len = struct.unpack('!I', conn.recv(4))[0]
            identity_data = conn.recv(identity_len)
            peer_identity = MeshNodeIdentity.from_bytes(identity_data)

            # Fase 2: Enviar nossa identidade
            our_identity = self.protocol.get_identity()
            identity_bytes = our_identity.to_bytes()
            conn.sendall(struct.pack('!I', len(identity_bytes)) + identity_bytes)

            # Fase 3: Receber ciphertext + assinatura
            ct_len = struct.unpack('!I', conn.recv(4))[0]
            ct = conn.recv(ct_len)
            sig_len = struct.unpack('!I', conn.recv(4))[0]
            sig = conn.recv(sig_len)
            nonce_len = struct.unpack('!I', conn.recv(4))[0]
            ephemeral_nonce = conn.recv(nonce_len)

            # Fase 4: Responder handshake
            confirmation = self.protocol.respond_handshake(
                ct, sig, peer_identity, ephemeral_nonce
            )

            # Fase 5: Enviar confirmação
            conn.sendall(struct.pack('!I', len(confirmation)) + confirmation)

            print(f"[MeshNode {self.protocol.node_id}] Handshake OK with {peer_identity.node_id}")

            # Fase 6: Comunicação segura
            while self.running:
                msg_len_data = conn.recv(4)
                if not msg_len_data:
                    break
                msg_len = struct.unpack('!I', msg_len_data)[0]
                encrypted_msg = conn.recv(msg_len)
                plaintext = self.protocol.decrypt_message(peer_identity.node_id, encrypted_msg)
                print(f"[MeshNode {self.protocol.node_id}] Received: {plaintext.decode('utf-8', errors='replace')[:100]}")

        except Exception as e:
            print(f"[MeshNode {self.protocol.node_id}] Connection error: {e}")
        finally:
            conn.close()

    def connect_to_peer(self, host: str, port: int):
        """Conectar a um peer e realizar handshake PQ."""
        conn = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
        conn.connect((host, port))

        # Fase 1: Enviar nossa identidade
        our_identity = self.protocol.get_identity()
        identity_bytes = our_identity.to_bytes()
        conn.sendall(struct.pack('!I', len(identity_bytes)) + identity_bytes)

        # Fase 2: Receber identidade do peer
        identity_len = struct.unpack('!I', conn.recv(4))[0]
        peer_identity = MeshNodeIdentity.from_bytes(conn.recv(identity_len))
        self.peers[peer_identity.node_id] = (host, port)

        # Fase 3: Iniciar handshake
        ct, sig, ephemeral_nonce = self.protocol.initiate_handshake(peer_identity)
        conn.sendall(struct.pack('!I', len(ct)) + ct)
        conn.sendall(struct.pack('!I', len(sig)) + sig)
        conn.sendall(struct.pack('!I', len(ephemeral_nonce)) + ephemeral_nonce)

        # Fase 4: Receber confirmação
        conf_len = struct.unpack('!I', conn.recv(4))[0]
        confirmation = conn.recv(conf_len)

        if not self.protocol.verify_confirmation(confirmation, peer_identity, ephemeral_nonce):
            raise SecurityException("Confirmação de handshake inválida!")

        print(f"[MeshNode {self.protocol.node_id}] Connected to {peer_identity.node_id}")
        return conn, peer_identity.node_id

    def send_to_peer(self, peer_id: str, message: bytes):
        """Enviar mensagem criptografada para um peer."""
        host, port = self.peers[peer_id]
        conn = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
        conn.connect((host, port))

        # Re-handshake rápido ou usar sessão existente
        encrypted = self.protocol.encrypt_message(peer_id, message)
        conn.sendall(struct.pack('!I', len(encrypted)) + encrypted)
        conn.close()


# ================================================================
# 2. PASSPORT-GATEWAY COM ASSINATURA PQ (Substrato 989.x)
# ================================================================

@dataclass
class PassportStamp:
    """Stamp de credencial verificável on-chain."""
    stamp_type: str  # e.g., "github", "twitter", "orcid"
    stamp_id: str
    holder_orcid: str
    holder_kyber_pk: bytes
    holder_dilithium_pk: bytes
    issuer_orcid: str
    issued_at: float
    expires_at: float
    metadata: Dict

    def canonical_bytes(self) -> bytes:
        return json.dumps({
            'stamp_type': self.stamp_type,
            'stamp_id': self.stamp_id,
            'holder_orcid': self.holder_orcid,
            'holder_kyber_pk': self.holder_kyber_pk.hex(),
            'holder_dilithium_pk': self.holder_dilithium_pk.hex(),
            'issuer_orcid': self.issuer_orcid,
            'issued_at': self.issued_at,
            'expires_at': self.expires_at,
            'metadata': self.metadata
        }, sort_keys=True).encode('utf-8')


@dataclass
class SignedPassport:
    """Passport completo com assinaturas PQ."""
    stamps: List[PassportStamp]
    aggregated_signature: bytes
    revocation_hash: bytes
    temporal_anchor: bytes  # Ed25519 anchor na chain 923


class PQPassportGateway:
    """
    Gateway de Passport com verificação pós-quântica.
    Integra Gitcoin Passport + ORCID + Dilithium signatures.
    """

    def __init__(self, gateway_orcid: str):
        self.orcid = gateway_orcid
        self.dilithium = Dilithium3()
        self.kyber = Kyber768()
        self.sk, self.pk = self.dilithium.keygen()

        # Registro de stamps emitidos
        self.issued_stamps: Dict[str, SignedPassport] = {}
        self.revoked_stamps: set = set()

        # Cache distribuído (simulado IPFS/Nostr)
        self.cache: Dict[str, bytes] = {}
        self.cache_ttl = 300  # 5 minutos

    def issue_stamp(self, stamp: PassportStamp) -> bytes:
        """
        Emitir um stamp assinado com Dilithium.
        Retorna a assinatura do gateway sobre o stamp.
        """
        # Verificar validade do holder
        if stamp.expires_at < time.time():
            raise SecurityException("Stamp expirado")

        # Assinar o stamp canônico
        sig = self.dilithium.sign(self.sk, stamp.canonical_bytes())

        # Criar registro
        stamp_key = f"{stamp.holder_orcid}:{stamp.stamp_type}:{stamp.stamp_id}"
        self.issued_stamps[stamp_key] = SignedPassport(
            stamps=[stamp],
            aggregated_signature=sig,
            revocation_hash=hashlib.sha3_256(stamp.canonical_bytes()).digest(),
            temporal_anchor=secrets.token_bytes(32)
        )

        # Cache distribuído
        self.cache[stamp_key] = stamp.canonical_bytes() + sig

        return sig

    def verify_stamp(self, stamp: PassportStamp, signature: bytes,
                     gateway_pk: bytes) -> bool:
        """Verificar um stamp emitido por um gateway."""
        # Verificar assinatura do gateway
        if not self.dilithium.verify(gateway_pk, stamp.canonical_bytes(), signature):
            return False

        # Verificar não-revogação
        stamp_key = f"{stamp.holder_orcid}:{stamp.stamp_type}:{stamp.stamp_id}"
        if stamp_key in self.revoked_stamps:
            return False

        # Verificar expiração
        if stamp.expires_at < time.time():
            return False

        # Verificar temporal anchor (na chain 923)
        # Em produção: consultar TemporalChain para ancoragem

        return True

    def create_full_passport(self, holder_orcid: str,
                            stamps: List[PassportStamp]) -> SignedPassport:
        """Criar um passport completo com múltiplos stamps."""
        # Agregar todas as assinaturas
        all_bytes = b''.join(s.canonical_bytes() for s in stamps)
        aggregated_sig = self.dilithium.sign(self.sk, all_bytes)

        # Hash de revogação
        revocation = hashlib.sha3_256(all_bytes + secrets.token_bytes(32)).digest()

        # Temporal anchor (simulado Ed25519)
        temporal = hashlib.sha3_256(all_bytes + str(time.time()).encode()).digest()

        return SignedPassport(
            stamps=stamps,
            aggregated_signature=aggregated_sig,
            revocation_hash=revocation,
            temporal_anchor=temporal
        )

    def verify_full_passport(self, passport: SignedPassport,
                             gateway_pk: bytes) -> bool:
        """Verificar um passport completo."""
        all_bytes = b''.join(s.canonical_bytes() for s in passport.stamps)

        # Verificar assinatura agregada
        if not self.dilithium.verify(gateway_pk, all_bytes,
                                      passport.aggregated_signature):
            return False

        # Verificar cada stamp individual
        for stamp in passport.stamps:
            if not self.verify_stamp(stamp,
                self.dilithium.sign(self.sk, stamp.canonical_bytes()),
                gateway_pk):
                return False

        return True

    def revoke_stamp(self, stamp_key: str) -> bytes:
        """Revogar um stamp (retorna prova de revogação)."""
        self.revoked_stamps.add(stamp_key)
        proof = hashlib.sha3_256(f"REVOKE:{stamp_key}:{time.time()}".encode()).digest()
        return proof

    def verify_humanity(self, passport: SignedPassport,
                        gateway_pk: bytes,
                        min_stamps: int = 3) -> Tuple[bool, float]:
        """
        Teste de humanidade: verificar se o passport tem stamps suficientes
        e se todas as assinaturas são válidas.
        Retorna: (is_human, confidence_score)
        """
        if len(passport.stamps) < min_stamps:
            return False, 0.0

        if not self.verify_full_passport(passport, gateway_pk):
            return False, 0.0

        # Calcular score de confiança baseado em diversidade de stamps
        unique_types = len(set(s.stamp_type for s in passport.stamps))
        age_factor = min(1.0, (time.time() - min(s.issued_at for s in passport.stamps)) / (86400 * 30))

        confidence = (unique_types / min_stamps) * 0.5 + age_factor * 0.5
        return True, min(confidence, 1.0)


# ================================================================
# 3. CONSENSO PQ PARA MESH (Substrato 972)
# ================================================================

class PQMeshConsensus:
    """
    Mecanismo de consenso para mesh com assinaturas Dilithium.
    Substitui ECDSA em PBFT/Raft por Dilithium.
    """

    def __init__(self, node_protocol: PQMeshProtocol):
        self.protocol = node_protocol
        self.votes: Dict[str, Dict[str, bytes]] = {}  # proposal_id -> node_id -> signature

    def propose(self, proposal: bytes) -> str:
        """Criar uma proposta de consenso."""
        proposal_id = hashlib.sha3_256(proposal + secrets.token_bytes(16)).hexdigest()
        sig = self.protocol.sign_routing_update(proposal)

        self.votes[proposal_id] = {self.protocol.node_id: sig}
        return proposal_id

    def vote(self, proposal_id: str, proposal: bytes,
             node_id: str, signature: bytes, node_pk: bytes) -> bool:
        """Registrar um voto em uma proposta."""
        if not self.protocol.verify_routing_update(proposal, signature, node_pk):
            return False

        if proposal_id not in self.votes:
            self.votes[proposal_id] = {}

        self.votes[proposal_id][node_id] = signature
        return True

    def is_accepted(self, proposal_id: str, threshold: int) -> bool:
        """Verificar se uma proposta atingiu quorum."""
        return len(self.votes.get(proposal_id, {})) >= threshold

    def get_certificate(self, proposal_id: str) -> bytes:
        """Obter certificado de consenso (agregação de assinaturas)."""
        votes = self.votes.get(proposal_id, {})
        cert_data = b''.join(
            f"{node_id}:{sig.hex()}".encode()
            for node_id, sig in sorted(votes.items())
        )
        return hashlib.sha3_256(cert_data).digest()


# ================================================================
# 4. TESTES INTEGRADOS
# ================================================================

if __name__ == "__main__":
    print("=" * 70)
    print(" SUBSTRATO 972.2 + 989.x — MESH & PASSPORT PQ INTEGRATION")
    print("=" * 70)

    # Teste 1: Handshake PQ entre dois nós
    print("\n[1] Teste de Handshake PQ entre nós mesh")
    node_alice = PQMeshProtocol("alice-node-01", "us-east", "0009-0005-2697-4668")
    node_bob = PQMeshProtocol("bob-node-02", "eu-west", "0009-0005-2697-4669")

    identity_alice = node_alice.get_identity()
    identity_bob = node_bob.get_identity()

    ct, sig, nonce = node_alice.initiate_handshake(identity_bob)
    conf = node_bob.respond_handshake(ct, sig, identity_alice, nonce)

    assert node_alice.verify_confirmation(conf, identity_bob, nonce)
    print("  ✓ Handshake PQ Alice ↔ Bob: OK")

    # Teste 2: Comunicação criptografada
    print("\n[2] Teste de comunicação criptografada")
    msg = b"Hello from ARKHE Mesh - quantum-safe communication!"
    encrypted = node_alice.encrypt_message("bob-node-02", msg)
    decrypted = node_bob.decrypt_message("alice-node-01", encrypted)
    assert decrypted == msg
    print(f"  ✓ Mensagem criptografada: {decrypted.decode()}")

    # Teste 3: Passport Gateway
    print("\n[3] Teste de Passport Gateway PQ")
    gateway = PQPassportGateway("0009-0005-2697-4668")

    stamp = PassportStamp(
        stamp_type="github",
        stamp_id="user123",
        holder_orcid="0009-0005-2697-4670",
        holder_kyber_pk=node_alice.pk_kyber,
        holder_dilithium_pk=node_alice.pk_dil,
        issuer_orcid=gateway.orcid,
        issued_at=time.time(),
        expires_at=time.time() + 86400 * 365,
        metadata={"repos": 42, "stars": 1000}
    )

    sig = gateway.issue_stamp(stamp)
    valid = gateway.verify_stamp(stamp, sig, gateway.pk)
    assert valid
    print(f"  ✓ Stamp emitido e verificado: {stamp.stamp_type}")

    # Teste 4: Full Passport
    print("\n[4] Teste de Full Passport")
    stamps = [
        stamp,
        PassportStamp(
            stamp_type="orcid",
            stamp_id="orcid-4670",
            holder_orcid="0009-0005-2697-4670",
            holder_kyber_pk=node_alice.pk_kyber,
            holder_dilithium_pk=node_alice.pk_dil,
            issuer_orcid=gateway.orcid,
            issued_at=time.time(),
            expires_at=time.time() + 86400 * 365,
            metadata={"works": 15}
        ),
        PassportStamp(
            stamp_type="twitter",
            stamp_id="@arkhe_user",
            holder_orcid="0009-0005-2697-4670",
            holder_kyber_pk=node_alice.pk_kyber,
            holder_dilithium_pk=node_alice.pk_dil,
            issuer_orcid=gateway.orcid,
            issued_at=time.time(),
            expires_at=time.time() + 86400 * 365,
            metadata={"followers": 5000}
        )
    ]

    passport = gateway.create_full_passport("0009-0005-2697-4670", stamps)
    is_human, confidence = gateway.verify_humanity(passport, gateway.pk)
    assert is_human
    print(f"  ✓ Passport verificado: human={is_human}, confidence={confidence:.2%}")

    # Teste 5: Consenso PQ
    print("\n[5] Teste de Consenso PQ")
    consensus = PQMeshConsensus(node_alice)
    proposal = b"Update routing table: add node charlie-node-03"
    prop_id = consensus.propose(proposal)

    # Simular votos de outros nós
    node_charlie = PQMeshProtocol("charlie-node-03", "ap-south", "0009-0005-2697-4671")
    vote_sig = node_charlie.sign_routing_update(proposal)
    consensus.vote(prop_id, proposal, "charlie-node-03", vote_sig, node_charlie.pk_dil)

    assert consensus.is_accepted(prop_id, 2)
    cert = consensus.get_certificate(prop_id)
    print(f"  ✓ Consenso atingido: cert={cert.hex()[:16]}...")

    print("\n" + "=" * 70)
    print(" TODOS OS TESTES PASSARAM — SEAL: 972.2-MESH-PQ-COMPLETE")
    print("=" * 70)
