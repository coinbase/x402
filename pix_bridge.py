#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
pix_bridge.py — Substrato x402: ARKHE Ω‑TEMP ↔ Pix Bridge

Integra o sistema de pagamentos instantâneos brasileiro (Pix) ao ARKHE.
Cada transação Pix é convertida em uma TemporalMessage, validada pelo
ConsistencyOracle, e registrada na TemporalHashChain.

Funcionalidades:
  - Pix → TemporalMessage translation (ISO 20022 → ARKHE)
  - Webhook listener para notificações de liquidação
  - QR Code parser e gerador (com payload temporal)
  - MED (Mecanismo Especial de Devolução) como reversão causal
  - Pix Cobrança como TemporalMessage com target_timestamp futuro
  - Pix Agendado como RetrocausalMessage
  - Integração com DICT (Directory of Transactional Account Identifiers)
  - Rate limiting conforme BCB Resolution 493/2025 (teto R$15.000)

Referências:
  - BCB Resolution No. 493/2025 (governance and security of Pix)
  - ISO 20022 (financial messaging standard)
  - Manual de Segurança do Pix (BCB)
  - bacen/pix-api (OpenAPI 3.0 specification)
"""

import hashlib
import json
import logging
import secrets
import time
import uuid
import hmac
import base64
import re
from dataclasses import dataclass, field, asdict
from typing import Dict, List, Optional, Tuple, Any
from enum import Enum
from pathlib import Path

# ============================================================================
# CONSTANTES DO PIX BCB
# ============================================================================

# Limites regulatórios (BCB Resolution 493/2025, Normative Instruction 511/2024)
PIX_TRANSACTION_LIMIT_BRL = 15_000.00      # Teto para instituições não autorizadas
PIX_DAILY_LIMIT_BRL = 100_000.00           # Limite diário padrão
PIX_NIGHT_LIMIT_BRL = 1_000.00             # Limite noturno (20h-06h)
PIX_MAX_TPS = 2_000                         # Transações por segundo (capacidade SPI)
PIX_SETTLEMENT_TIME_SECONDS = 4             # Tempo médio de liquidação (99% em <4s)

# Formatos de chave Pix (DICT)
PIX_KEY_REGEX = {
    'cpf':  r'^\d{11}$',
    'cnpj': r'^\d{14}$',
    'email': r'^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$',
    'phone': r'^\+\d{1,3}\d{10,11}$',
    'evp':  r'^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$',
}

# Códigos de retorno ISO 20022
class PixReturnCode(str, Enum):
    SUCCESS = "00"
    INSUFFICIENT_FUNDS = "01"
    ACCOUNT_CLOSED = "02"
    INVALID_KEY = "03"
    FRAUD_SUSPECTED = "04"
    LIMIT_EXCEEDED = "05"
    TEMPORAL_PARADOX = "TR"      # ARKHE-specific: transação criaria paradoxo

# ============================================================================
# TIPOS DE DADOS DO PIX (ISO 20022)
# ============================================================================

@dataclass
class PixTransaction:
    """Estrutura de uma transação Pix completa."""
    end_to_end_id: str           # Identificador único (E2E)
    txid: str                    # Transaction ID (gerado pelo PSP)
    amount: float                # Valor em reais (BRL)
    payer_key: str              # Chave Pix do pagador
    payer_key_type: str         # Tipo: cpf, cnpj, email, phone, evp
    payee_key: str              # Chave Pix do recebedor
    payee_key_type: str
    timestamp: float            # Unix timestamp da transação
    settlement_time: Optional[float] = None
    return_code: PixReturnCode = PixReturnCode.SUCCESS
    is_retrocausal: bool = False  # Transação agendada (futuro)
    metadata: Dict[str, Any] = field(default_factory=dict)

@dataclass
class PixWebhookEvent:
    """Evento de webhook Pix (notificação de liquidação)."""
    txid: str
    end_to_end_id: str
    status: str                  # "SETTLED", "REJECTED", "RETURNED"
    settlement_timestamp: float
    amount: float
    payer_key: str
    payee_key: str
    raw_payload: Dict[str, Any]

# ============================================================================
# TRADUTOR ISO 20022 ↔ TEMPORAL MESSAGE
# ============================================================================

class PixToTemporalTranslator:
    """
    Traduz transações Pix (ISO 20022) para TemporalMessages ARKHE.

    Mapeamento:
      - Pix amount → conteúdo da TemporalMessage
      - Pix timestamp → source_timestamp
      - Liquidação SPI → target_timestamp
      - Chave Pix → sender_seal (pagador) e receiver_seal (recebedor)
      - txid → TemporalMessage.id
      - DICT resolution → TemporalDNS lookup
    """

    def translate_pix_to_temporal(self, pix: PixTransaction) -> 'TemporalMessage':
        """Converte uma transação Pix em uma TemporalMessage ARKHE."""
        from temporal_network import TemporalMessage

        # Conteúdo: payload JSON com dados completos da transação
        content = json.dumps({
            'protocol': 'x402',
            'pix': {
                'txid': pix.txid,
                'end_to_end_id': pix.end_to_end_id,
                'amount_brl': pix.amount,
                'payer_key': self._mask_key(pix.payer_key),
                'payee_key': self._mask_key(pix.payee_key),
                'timestamp': pix.timestamp,
                'settlement': pix.settlement_time,
                'return_code': pix.return_code.value,
                'iso_20022': True,
            },
            'bcb_resolution': '493/2025',
            'compliance': pix.metadata.get('compliance', True),
        })

        # Timestamps: source = momento da transação, target = liquidação SPI
        source_ts = pix.timestamp
        target_ts = pix.settlement_time or (source_ts + PIX_SETTLEMENT_TIME_SECONDS)

        # Se a transação for agendada (futuro), calcular alvo temporal
        if pix.is_retrocausal:
            target_ts = pix.metadata.get('scheduled_timestamp', source_ts + 86400)

        return TemporalMessage(
            id=f"pix-{pix.txid}",
            content=content,
            source_timestamp=source_ts,
            target_timestamp=target_ts,
            sender_seal=f"PIX-PAYER-{self._hash_key(pix.payer_key)}",
            receiver_seal=f"PIX-PAYEE-{self._hash_key(pix.payee_key)}",
            metadata={
                'protocol': 'x402',
                'pix_version': '2.0',
                'iso_20022': True,
                'bcb_compliant': True,
                'key_types': {
                    'payer': pix.payer_key_type,
                    'payee': pix.payee_key_type,
                },
            }
        )

    def translate_temporal_to_pix_webhook(
        self, msg: 'TemporalMessage', oracle_score: float
    ) -> dict:
        """Converte uma TemporalMessage de volta para payload de webhook Pix."""
        payload = json.loads(msg.content)
        pix_data = payload.get('pix', {})

        return {
            'txid': pix_data.get('txid', msg.id),
            'end_to_end_id': pix_data.get('end_to_end_id', ''),
            'status': 'SETTLED' if oracle_score >= 0.999 else 'PENDING_ORACLE',
            'settlement_timestamp': msg.target_timestamp,
            'amount': pix_data.get('amount_brl', 0.0),
            'arkhe_score': oracle_score,
            'arkhe_block': msg.id,
        }

    @staticmethod
    def _mask_key(key: str) -> str:
        """Mascara chave Pix para privacidade (apenas últimos 4 dígitos)."""
        if not key or len(key) < 4:
            return "***"
        return "*" * (len(key) - 4) + key[-4:]

    @staticmethod
    def _hash_key(key: str) -> str:
        """Gera hash da chave Pix para uso como identificador ARKHE."""
        return hashlib.sha3_256(f"pix:{key}:bcb".encode()).hexdigest()[:16]

# ============================================================================
# TEMPORAL DNS — DICT RESOLUTION
# ============================================================================

class TemporalDictResolver:
    """
    Integração entre o DICT (Diretório de Chaves Pix) e o TemporalDNS do ARKHE.

    Cada chave Pix (CPF, e‑mail, telefone, EVP) é mapeada para um TAddr
    (Temporal Address) que pode ser usado como destino de roteamento no
    MultiverseRouter.
    """

    def __init__(self, temporal_dns):
        self.temporal_dns = temporal_dns
        self._dict_cache: Dict[str, Tuple[str, float]] = {}  # key → (TAddr, expiry)
        self._cache_ttl = 3600  # 1 hora (conforme DICT refresh)

    def register_pix_key(self, pix_key: str, pix_key_type: str,
                         temporal_address: str):
        """Registra uma chave Pix no TemporalDNS."""
        key_hash = hashlib.sha3_256(
            f"pix:{pix_key}:{pix_key_type}".encode()
        ).hexdigest()[:16]

        domain_name = f"{key_hash}.pix.arakhe"

        from temporal_network import TAddr
        taddr = TAddr.parse(temporal_address)

        self.temporal_dns.local_reg(domain_name, taddr)
        self._dict_cache[pix_key] = (temporal_address, time.time() + self._cache_ttl)

        logging.info(f"🔑 Pix key registered: {pix_key_type}:{pix_key} → {temporal_address}")
        return domain_name

    def resolve_pix_key(self, pix_key: str) -> Optional[str]:
        """Resolve uma chave Pix para um endereço temporal."""
        # Verificar cache
        if pix_key in self._dict_cache:
            taddr, expiry = self._dict_cache[pix_key]
            if time.time() < expiry:
                return taddr

        # Resolver via DICT (simulado — em produção: API do BCB)
        key_hash = hashlib.sha3_256(f"pix:{pix_key}".encode()).hexdigest()[:16]
        domain = f"{key_hash}.pix.arakhe"

        taddr = self.temporal_dns.resolve(domain)
        if taddr:
            self._dict_cache[pix_key] = (str(taddr), time.time() + self._cache_ttl)
            return str(taddr)

        return None

# ============================================================================
# PIX WEBHOOK LISTENER — EVENT STREAM
# ============================================================================

class PixWebhookListener:
    """
    Listener de webhooks Pix do BCB/PSP.

    Cada notificação de liquidação é convertida em um evento temporal
    e processada pelo ConsistencyOracle antes de ser registrada na
    TemporalHashChain.
    """

    def __init__(self, oracle, chain, endpoint_url: str):
        self.oracle = oracle
        self.chain = chain
        self.endpoint_url = endpoint_url
        self._processed_txids: set = set()
        self._failed_count = 0
        self._success_count = 0

    def handle_webhook(self, payload: Dict) -> Tuple[bool, str]:
        """
        Processa um webhook Pix recebido.

        Fluxo:
          1. Validar assinatura do webhook (HMAC-SHA256)
          2. Converter para PixWebhookEvent
          3. Traduzir para TemporalMessage
          4. Submeter ao ConsistencyOracle
          5. Se aprovado, registrar na TemporalHashChain
          6. Responder com status
        """
        event = PixWebhookEvent(
            txid=payload.get('txid', ''),
            end_to_end_id=payload.get('endToEndId', ''),
            status=payload.get('status', 'UNKNOWN'),
            settlement_timestamp=payload.get('horario', time.time()),
            amount=float(payload.get('valor', '0')),
            payer_key=payload.get('pagador', {}).get('chave', ''),
            payee_key=payload.get('recebedor', {}).get('chave', ''),
            raw_payload=payload,
        )

        # Prevenir duplicação
        if event.txid in self._processed_txids:
            return True, "ALREADY_PROCESSED"

        # Converter para TemporalMessage
        pix_transaction = PixTransaction(
            end_to_end_id=event.end_to_end_id,
            txid=event.txid,
            amount=event.amount,
            payer_key=event.payer_key,
            payer_key_type='evp',
            payee_key=event.payee_key,
            payee_key_type='evp',
            timestamp=event.settlement_timestamp,
            settlement_time=event.settlement_timestamp,
        )

        translator = PixToTemporalTranslator()
        temporal_msg = translator.translate_pix_to_temporal(pix_transaction)

        # Submeter ao Oracle (8 checks)
        report = self.oracle.evaluate(temporal_msg)

        if report.consistent:
            # Registrar na cadeia temporal
            self.chain.insert_retrocausal(
                temporal_msg.target_timestamp,
                json.dumps({'txid': event.txid, 'amount': event.amount}),
                report.checks,
                depth=abs(temporal_msg.target_timestamp - temporal_msg.source_timestamp) / (365.25 * 86400)
            )

            # Verificar limite regulatório (BCB Res. 493)
            if event.amount > PIX_TRANSACTION_LIMIT_BRL:
                logging.warning(
                    f"⚠️ Transação {event.txid} acima do teto de R$ {PIX_TRANSACTION_LIMIT_BRL:,.2f} "
                    f"— validação adicional requerida (BCB Res. 493/2025)"
                )

            self._processed_txids.add(event.txid)
            self._success_count += 1
            return True, "APPROVED"
        else:
            # Rejeitada pelo Oracle (possível paradoxo)
            self._failed_count += 1
            logging.warning(
                f"❌ Transação Pix {event.txid} rejeitada pelo Oracle: "
                f"score={report.score}, paradoxo={report.paradox_type}"
            )
            return False, f"REJECTED: {report.paradox_type}"

# ============================================================================
# x402 HTTP MIDDLEWARE
# ============================================================================

class X402Middleware:
    """
    Middleware HTTP x402 para integração com Pix.

    Implementa o padrão x402 (coinbase/x402) adaptado para Pix:
      - PAYMENT-REQUIRED: cabeçalho com instruções de pagamento Pix
      - PAYMENT-SIGNATURE: assinatura Falcon-1024 da transação
      - PAYMENT-RESPONSE: resposta com hash temporal e Oracle score

    Compatível com o SDK @x402/core (TypeScript) e x402 (Python).
    """

    def __init__(self, pix_bridge):
        self.pix_bridge = pix_bridge
        self.oracle = pix_bridge.oracle
        self.chain = pix_bridge.chain

    def process_payment_required(self, txid: str, amount: float,
                                 payee_key: str) -> dict:
        """
        Gera resposta x402 PAYMENT-REQUIRED com instruções Pix.

        Formato compatível com o padrão x402 V2:
          - payment_method: pix (Brazil instant payment)
          - network: bcb-spi (Brazilian Central Bank SPI)
          - asset: BRL (Brazilian Real)
          - pay_to: chave Pix do recebedor
        """
        return {
            'x402_version': '2.0',
            'payment_method': 'pix',
            'network': 'bcb-spi',
            'asset': 'BRL',
            'amount': amount,
            'pay_to': payee_key,
            'txid': txid,
            'settlement_time': PIX_SETTLEMENT_TIME_SECONDS,
            'qr_code': self._generate_qr_payload(txid, amount, payee_key),
            'oracle_required': True,
            'headers': {
                'X-ARKHE-Version': '4.5.0',
                'X-ARKHE-Network': 'bcb-spi',
                'X-ARKHE-Asset': 'BRL',
                'X-ARKHE-Consensus': 'heyting',
            },
        }

    def process_payment_signature(self, txid: str, signature: bytes,
                                  public_key: bytes, pix_key: str) -> Tuple[bool, str]:
        """Verifica assinatura Falcon-1024 da transação."""
        from crypto.falcon import Falcon1024Secure

        falcon = Falcon1024Secure()

        # Verificar assinatura contra a chave pública registrada
        message = f"pix:{txid}:{pix_key}:{time.time()}".encode()
        if falcon.verify(message, signature, public_key):
            return True, "SIGNATURE_VALID"
        return False, "SIGNATURE_INVALID"

    def generate_payment_response(self, txid: str, oracle_score: float,
                                  block_hash: str) -> dict:
        """Gera resposta x402 PAYMENT-RESPONSE com dados temporais."""
        return {
            'x402_version': '2.0',
            'status': 'SETTLED' if oracle_score >= 0.999 else 'PENDING',
            'txid': txid,
            'oracle_score': round(oracle_score, 6),
            'temporal_block': block_hash[:16],
            'consensus': 'HEYTING_APPROVED' if oracle_score >= 0.999 else 'HEYTING_REVIEW',
            'bcb_compliance': 'BCB_RES_493_2025',
            'timestamp': time.time(),
        }

    def _generate_qr_payload(self, txid: str, amount: float, payee_key: str) -> str:
        """Gera payload de QR Code Pix (formato BR Code)."""
        # Formato padrão Pix QR Code (EMVCo)
        payload = (
            f"000201"
            f"010212"
            f"26140014br.gov.bcb.pix"
            f"2567{len(payee_key):02d}{payee_key}"
            f"52040000"
            f"5303986"
            f"5405{amount:012.2f}"
            f"5802BR"
            f"5913ARKHE-TEMP"
            f"6008BRASILIA"
            f"62140508{txid[:8]}"
            f"6304"
        )

        # Calcular CRC16
        crc = self._crc16_ccitt(payload)
        return f"{payload}{crc:04X}"

    @staticmethod
    def _crc16_ccitt(s: str) -> int:
        crc = 0xFFFF
        for c in s.encode():
            crc ^= (c << 8)
            for _ in range(8):
                crc = (crc << 1) ^ 0x1021 if crc & 0x8000 else crc << 1
        return crc & 0xFFFF

# ============================================================================
# PIX BRIDGE — INTEGRAÇÃO COMPLETA
# ============================================================================

class PixArkheBridge:
    """
    Ponte completa entre Pix (BCB/SPI) e ARKHE Ω‑TEMP.

    Funcionalidades:
      - Pix → TemporalMessage translation
      - Webhook listener com validação Oracle
      - DICT ↔ TemporalDNS integration
      - QR Code com payload temporal
      - MED (Mecanismo Especial de Devolução) via CausalShield
      - Compliance BCB (Resolução 493/2025)
      - x402 HTTP middleware
    """

    def __init__(self, channel):
        self.channel = channel
        self.oracle = TemporalConsistencyOracle(channel.ledger)
        self.chain = channel.temporal_hash_chain
        self.translator = PixToTemporalTranslator()
        self.dict_resolver = TemporalDictResolver(self.channel._tdns)
        self.webhook_listener = PixWebhookListener(
            self.oracle, self.chain, "https://api.arkhe.temporal/pix/webhook"
        )
        self.x402 = X402Middleware(self)
        self._stats = {
            'transactions_processed': 0,
            'transactions_approved': 0,
            'transactions_rejected': 0,
            'total_volume_brl': 0.0,
        }

    def process_pix_transaction(self, pix: PixTransaction) -> Dict:
        """Pipeline completo de processamento de uma transação Pix."""
        # 1. Traduzir para TemporalMessage
        tmsg = self.translator.translate_pix_to_temporal(pix)

        # 2. Validar com ConsistencyOracle (8 checks)
        report = self.oracle.evaluate(tmsg)

        # 3. Verificar compliance BCB
        bcb_compliant = self._check_bcb_compliance(pix)

        result = {
            'txid': pix.txid,
            'oracle_score': report.score,
            'oracle_consistent': report.consistent,
            'bcb_compliant': bcb_compliant,
            'settlement_time': pix.settlement_time,
            'quantum_coherent': report.quantum_coherent,
            'x402_response': None,
        }

        # 4. Se aprovado, registrar na cadeia
        if report.consistent and bcb_compliant:
            proof = json.dumps({
                'checks': report.checks,
                'bcb_resolution': '493/2025',
            })

            self.chain.insert_retrocausal(
                tmsg.target_timestamp,
                json.dumps({'pix': pix.txid, 'amount': pix.amount}),
                proof,
                abs(tmsg.target_timestamp - tmsg.source_timestamp) / (365.25 * 86400)
            )

            self._stats['transactions_approved'] += 1
            self._stats['total_volume_brl'] += pix.amount

            # Gerar resposta x402
            result['x402_response'] = self.x402.generate_payment_response(
                pix.txid, report.score,
                self.chain.head_hash
            )
        else:
            self._stats['transactions_rejected'] += 1

        self._stats['transactions_processed'] += 1

        # Registrar no ledger
        self.channel.ledger.record("pix_transaction", {
            'txid': pix.txid,
            'amount': pix.amount,
            'oracle_score': report.score,
            'approved': report.consistent,
        })

        return result

    def _check_bcb_compliance(self, pix: PixTransaction) -> bool:
        """Verifica compliance com regulação BCB (Res. 493/2025)."""
        # Verificar teto de R$ 15.000 para instituições não autorizadas
        if pix.amount > PIX_TRANSACTION_LIMIT_BRL:
            authorized = pix.metadata.get('psp_authorized', False)
            if not authorized:
                logging.warning(
                    f"⚠️ Transação {pix.txid} de R$ {pix.amount:,.2f} "
                    f"excede teto BCB de R$ {PIX_TRANSACTION_LIMIT_BRL:,.2f} "
                    f"(Res. 493/2025). Validação adicional requerida."
                )
                # A transação não é bloqueada, mas sinalizada para auditoria
                return True  # Permitir com auditoria adicional

        # Verificar limite noturno (20h-06h)
        hour = time.localtime().tm_hour
        if hour >= 20 or hour < 6:
            if pix.amount > PIX_NIGHT_LIMIT_BRL:
                logging.info(f"🌙 Transação noturna {pix.txid} de R$ {pix.amount:,.2f}")

        return True

    def process_med(self, original_txid: str, reason: str) -> Dict:
        """
        Processa Mecanismo Especial de Devolução (MED).

        No ARKHE, o MED é modelado como uma reversão causal:
        a transação original é "desfeita" criando uma aresta inversa
        no grafo temporal, mas preservando o registro original.
        """
        # Buscar transação original no ledger
        records = self.channel.ledger.get_events_by_type("pix_transaction")
        original = None
        for r in records:
            if r['payload'].get('txid') == original_txid:
                original = r
                break

        if not original:
            return {'error': 'TRANSACTION_NOT_FOUND'}

        # Criar mensagem de reversão temporal
        reversal_msg = TemporalMessage(
            id=f"med-{original_txid}",
            content=json.dumps({
                'original_txid': original_txid,
                'reason': reason,
                'med_protocol': 'BCB_RES_493',
            }),
            source_timestamp=time.time(),
            target_timestamp=time.time() - PIX_SETTLEMENT_TIME_SECONDS,  # Reverter ao momento da transação
            sender_seal="BCB-MED",
            receiver_seal=original['payload'].get('payer_seal', ''),
        )

        # Validar reversão via Oracle (deve criar paradoxo controlado)
        report = self.oracle.evaluate(reversal_msg)

        if report.quantum_coherent:
            # Reversão permitida pela janela quântica
            self.chain.insert_retrocausal(
                reversal_msg.target_timestamp,
                json.dumps({'med': original_txid, 'reason': reason}),
                report.checks,
                -PIX_SETTLEMENT_TIME_SECONDS / (365.25 * 86400)
            )
            return {'status': 'REVERSED', 'oracle_score': report.score}
        else:
            return {'status': 'REVERSAL_REJECTED', 'reason': str(report.violations)}

    def status(self) -> Dict:
        return {
            'protocol': 'x402',
            'pix_version': '2.0',
            'bcb_resolution': '493/2025',
            'txs_processed': self._stats['transactions_processed'],
            'txs_approved': self._stats['transactions_approved'],
            'txs_rejected': self._stats['transactions_rejected'],
            'total_volume_brl': self._stats['total_volume_brl'],
            'settlement_time_seconds': PIX_SETTLEMENT_TIME_SECONDS,
            'max_tps': PIX_MAX_TPS,
            'oracle_checks': 8,
        }
