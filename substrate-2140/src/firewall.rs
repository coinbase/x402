#![no_std]
extern crate alloc;

use alloc::collections::BTreeMap;
use core::marker::PhantomData;

// --- 1. Domínio de Segurança e Tipos Primitivos ---

/// Substitui AgentId. Alinhado com Protocol8004 (Substrato 1105).
/// Array de 32 bytes possui derivação de traits nativa (Eq, Ord, Hash)
/// essencial para o BTreeMap, sem custo de alocação.
pub type AgentId = [u8; 32];

pub const EMBEDDING_DIM: usize = 64;
const CIRCUIT_BREAKER_THRESHOLD: u16 = 50;
/// Limiar de segurança constitucional (escala INT8).
/// Valores negativos indicam alta probabilidade de intenção maliciosa.
const CONSTITUTIONAL_THRESHOLD: i8 = -45;

/// Tensor quantizado em INT8. Zero alocação na pilha (64 bytes).
pub type IntentTensor = [i8; EMBEDDING_DIM];

/// Namespace dedicado para erros do Firewall (0x2140_7001–0x2140_70FF).
/// Resolução total das Ressalvas #2, #3 e #5.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct FirewallErrorCode(pub u32);

impl FirewallErrorCode {
    pub const MALFORMED_TENSOR: u32      = 0x2140_7001;
    pub const TEE_INFERENCE_FAIL: u32    = 0x2140_7002;
    pub const QUARANTINED_AGENT: u32     = 0x2140_7003;
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum FirewallVerdict {
    Allow,
    /// O campo &'static str resolve o problema de alocação do enum (Ressalva #2)
    Block(&'static str),
    QuarantineProAct,
    Sinkhole,
}

#[derive(Default)]
struct AgentRiskProfile {
    request_count: u16,
    is_quarantined: bool,
}

// --- 2. Abstração TEE (Substrato 1091.1 Estendido) ---

/// Trait isolada. O tipo genérico `E` garante que implementações falsas
/// possam ser injetadas em testes sem expor lógica criptográfica real.
pub trait TeeSecureInference<E>: Send + Sync {
    fn run_constitutional_probe(&self, env: &E, payload: &[u8]) -> Result<IntentTensor, FirewallErrorCode>;
}

// --- 3. O Núcleo: Intent Firewall (Substrato 2140.7) ---

pub struct IntentFirewall<E, T> {
    /// Usa BTreeMap do alloc. Resolução da Ressalva #1.
    /// Evita dependência externa (heapless) e lida nativamente com AgentId ([u8; 32]).
    agent_profiles: BTreeMap<AgentId, AgentRiskProfile>,
    _env: PhantomData<E>,
    _tee: PhantomData<T>,
}

impl<E, T> IntentFirewall<E, T> {
    pub fn new() -> Self {
        Self {
            agent_profiles: BTreeMap::new(),
            _env: PhantomData,
            _tee: PhantomData,
        }
    }

    /// Ponto de entrada principal de avaliação.
    pub fn evaluate_intent<Infer: TeeSecureInference<E>>(
        &mut self,
        tee_engine: &Infer,
        env: &E,
        agent_id: &AgentId,
        payload: &[u8],
    ) -> FirewallVerdict {
        // FASE 1: AI Circuit Breaker
        if let Some(verdict) = self.check_circuit_breaker(agent_id) {
            return verdict;
        }

        // FASE 2: Inferência de Representação (Dentro do TEE)
        let tensor = match tee_engine.run_constitutional_probe(env, payload) {
            Ok(t) => t,
            Err(_) => return FirewallVerdict::Block("TEE_INFERENCE_FAIL"),
        };

        // FASE 3: Classificador Constitucional
        let safety_score = self.calculate_safety_score(&tensor);

        if safety_score < CONSTITUTIONAL_THRESHOLD {
            return FirewallVerdict::Block("CONSTITUTIONAL_VIOLATION");
        }

        // FASE 4: ProAct (Detecção de Adversário Sofisticado)
        if self.is_suspiciously_obfuscated(&tensor) {
            return self.activate_proact_honeypot(agent_id);
        }

        FirewallVerdict::Allow
    }

    /// [Ressalva #8] STUB DE TIMER: Em produção, este método deve ser acionado
    /// por uma interrupção de hardware do TEE ou um timer do Embassy (polling).
    /// Resetar os contadores previne que agentes legítimos sejam banidos por limite de taxa.
    pub fn tick_reset_circuit_breaker(&mut self) {
        for (_, profile) in self.agent_profiles.iter_mut() {
            profile.request_count = 0;
        }
    }

    // --- Lógicas Internas de Defesa ---

    fn check_circuit_breaker(&mut self, agent_id: &AgentId) -> Option<FirewallVerdict> {
        let profile = self.agent_profiles.entry(*agent_id).or_default();

        if profile.is_quarantined {
            return Some(FirewallVerdict::Sinkhole);
        }

        profile.request_count += 1;

        if profile.request_count > CIRCUIT_BREAKER_THRESHOLD {
            // Rerouting de Representação: descarta silenciosamente
            return Some(FirewallVerdict::Sinkhole);
        }

        None
    }

    /// [Ressalva #6] Correção matemática: Usa intermediário i32 para evitar
    /// truncamento e aplica clamp explícito antes do cast para i8.
    fn calculate_safety_score(&self, tensor: &IntentTensor) -> i8 {
        let mut sum: i32 = 0;
        for &val in tensor.iter() {
            sum += val as i32;
        }

        let avg = sum / EMBEDDING_DIM as i32;

        // Clamp garante que o resultado caia estritamente no range i8 (-128 a 127)
        avg.clamp(i8::MIN as i32, i8::MAX as i32) as i8
    }

    /// [Ressalva #7] Heurística de Entropia de Tensor documentada.
    /// Ataques de "Reconstruction" (ex: esconder intenção em lixo sintático)
    /// tendem a criar tensores com espalhamento estatístico anômalo (alta variância).
    /// O threshold '100' representa ~78% da faixa dinâmica do i8.
    /// Em embeddings normais de linguagem natural, a faixa costuma ser < 60.
    fn is_suspiciously_obfuscated(&self, tensor: &IntentTensor) -> bool {
        let mut min = i8::MAX;
        let mut max = i8::MIN;

        for &val in tensor.iter() {
            if val < min { min = val; }
            if val > max { max = val; }
        }

        (max as i16 - min as i16) > 100
    }

    fn activate_proact_honeypot(&mut self, agent_id: &AgentId) -> FirewallVerdict {
        if let Some(profile) = self.agent_profiles.get_mut(agent_id) {
            profile.is_quarantined = true;
        }
        // Permite a passagem para que o Gateway gere o recibo QKD falso
        FirewallVerdict::QuarantineProAct
    }
}
