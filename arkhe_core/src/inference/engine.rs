use arkhe_cognitive::swireasoning::{SwiReasoningConfig, ReasoningMode};
use arkhe_security::tee::{TEEContext, EnclaveType};
use arkhe_chain::pqc::sphincs::{SphincsPlusKey, SphincsPlusSignature};

/// Inference engine variants for the Arkhe Cathedral ecosystem.
/// Extended from v12.10.1 (6 variants) to v12.10.3 (7 variants).
#[derive(Debug, Clone, PartialEq, Eq, Hash)]
pub enum InferenceEngine {
    /// Local WASM execution (no external dependency)
    LocalWasm,

    /// Kimi K2.6 (Moonshot AI, 1T/32B MoE, 262K context)
    KimiK26,

    /// Kimi K2.7 Code (Moonshot AI, 1T/32B MoE, 262K context, $4/M)
    /// Substrato 1104.1 — v12.10.1
    KimiK27Code,

    /// Claude Fable 5 (Anthropic)
    ClaudeFable5,

    /// GPT-5.5 (OpenAI)
    GPT55,

    /// Llama 4 Maverick (Meta)
    Llama4Maverick,

    /// Rio-3.5-Open-397B (IplanRIO/Prefeitura do Rio)
    /// Substrato 1104.2 — v12.10.3
    /// 397B total / 17B active, 1M context, MIT license, SwiReasoning native
    Rio35Open397B,
}

impl InferenceEngine {
    /// Returns the canonical Hugging Face model ID or API endpoint.
    pub fn model_id(&self) -> &'static str {
        match self {
            Self::LocalWasm => "arkhe://local/wasm",
            Self::KimiK26 => "https://api.moonshot.cn/v1/models/kimi-k2-6",
            Self::KimiK27Code => "https://api.moonshot.cn/v1/models/kimi-k2-7-code",
            Self::ClaudeFable5 => "https://api.anthropic.com/v1/models/claude-fable-5",
            Self::GPT55 => "https://api.openai.com/v1/models/gpt-5.5",
            Self::Llama4Maverick => "https://api.together.ai/v1/models/llama-4-maverick",
            Self::Rio35Open397B => "prefeitura-rio/Rio-3.5-Open-397B",
        }
    }

    /// Returns the SwiReasoning configuration for this engine.
    /// Rio-3.5 has native SwiReasoning; others use Arkhe cognitive overlay.
    pub fn swi_config(&self) -> SwiReasoningConfig {
        match self {
            Self::Rio35Open397B => SwiReasoningConfig {
                // Native SwiReasoning — entropy thresholds calibrated
                // for Portuguese technical/legal domain (lusófono)
                entropy_ref_x1000: 420,        // 0.42 * 1000 (tuned for PT)
                max_switches: 8,               // Rio-3.5 native supports up to 12
                block_size: 64,              // block-wise confidence estimation
                latent_depth: 3,             // hidden-space exploration depth
                explicit_commit_threshold: 750, // 0.75 confidence to commit
                language_bias: LanguageBias::PortugueseTechnical,
                tee_enforced: true,
                pqc_anchor: true,
            },
            Self::KimiK27Code => SwiReasoningConfig {
                entropy_ref_x1000: 380,
                max_switches: 6,
                block_size: 32,
                latent_depth: 2,
                explicit_commit_threshold: 700,
                language_bias: LanguageBias::General,
                tee_enforced: true,
                pqc_anchor: true,
            },
            _ => SwiReasoningConfig::default(),
        }
    }

    /// Capability scoring for task routing (0.0–1.0).
    pub fn capability_score(&self, task: &Task) -> f64 {
        match (self, task.domain) {
            (Self::Rio35Open397B, Domain::PortugueseLegal) => 0.92,
            (Self::Rio35Open397B, Domain::PortugueseTechnical) => 0.90,
            (Self::Rio35Open397B, Domain::AgenticCoding) => 0.80,
            (Self::Rio35Open397B, Domain::MultimodalVision) => 0.78,
            (Self::Rio35Open397B, Domain::Mathematics) => 0.94,
            (Self::Rio35Open397B, Domain::STEM) => 0.88,
            (Self::KimiK27Code, Domain::Mathematics) => 0.95,
            (Self::KimiK27Code, Domain::AgenticCoding) => 0.85,
            (Self::KimiK27Code, Domain::PortugueseLegal) => 0.72,
            (Self::ClaudeFable5, Domain::ReasoningUltra) => 0.95,
            (Self::GPT55, Domain::ApexBenchmark) => 0.98,
            _ => 0.75,
        }
    }

    /// Cost per million output tokens (USD). Rio-3.5 = 0.0 (MIT license).
    pub fn cost_per_million(&self) -> f64 {
        match self {
            Self::LocalWasm => 0.0,
            Self::Rio35Open397B => 0.0,     // Infrastructure only
            Self::KimiK27Code => 4.0,
            Self::KimiK26 => 3.5,
            Self::ClaudeFable5 => 8.0,
            Self::GPT55 => 12.0,
            Self::Llama4Maverick => 1.2,
        }
    }

    /// Returns whether the engine requires trust-remote-code.
    /// SECURITY: Only Rio-3.5 currently requires this — mitigated by TEE + FIG.
    pub fn requires_trust_remote_code(&self) -> bool {
        matches!(self, Self::Rio35Open397B)
    }

    /// Returns the TEE enclave type required for secure execution.
    pub fn tee_requirement(&self) -> TEEContext {
        match self {
            Self::Rio35Open397B => TEEContext {
                enclave_type: EnclaveType::SGX2,
                attestation: AttestationMode::DCAP,
                hard_reset_crypto: true,  // FIG 1091.0 integration
                zeroize_on_anomaly: true,
            },
            _ => TEEContext::default(),
        }
    }
}

/// Language bias for SwiReasoning calibration.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum LanguageBias {
    General,
    PortugueseTechnical,
    PortugueseLegal,
    ChineseTechnical,
    EnglishScientific,
}