//! Cathedral ARKHE v14.1 — Cognitive Singularity Engine (CSE)
//!
//! Esta crate integra todos os componentes da v14.1:
//! - MoE Cognitive Orchestrator
//! - Thinking Engine (Chain-of-Thought)
//! - Spatial Attention Engine (MSA-style)
//! - Multi-Token Prediction (MTP)
//! - SAHOO+ (Alinhamento Adaptativo)
//! - Cathedral Code Agent 2.0 (CCA 2.0)
//!
//! Reutiliza os substratos da v13.1 (Trinity, EAC, Mesh, Tools).

pub mod moe;
pub mod thinking;
pub mod attention;
pub mod mtp;
pub mod sahoo;
pub mod agent;
pub mod llm;

// Reexportações para facilitar o uso
pub use moe::*;
pub use thinking::*;
pub use attention::*;
pub use mtp::*;
pub use sahoo::*;
pub use agent::*;
pub use llm::*;

// Reexportações dos substratos reutilizados
pub use cathedral_trinity as trinity;
pub use cathedral_eac as eac;
pub use cathedral_mesh as mesh;
pub use cathedral_tools as tools;
