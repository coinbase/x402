// octra_fhe_client/src/lib.rs
// Octra FHE Client — Interface Rust para HFHE (Hypergraph FHE)
// Substrate 840-OCTRA-FHE-BRIDGE

use serde::{Deserialize, Serialize};
use sha3::{Sha3_256, Digest};
use std::collections::HashMap;

pub const FP_PRIME: u128 = (1u128 << 127) - 1;

#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct HyperVertex {
    pub id: u64,
    pub ciphertext: Vec<u8>,
    pub noise_level: f64,
    pub epoch: u64,
}

#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct HyperEdge {
    pub id: u64,
    pub gate_type: GateType,
    pub input_vertices: Vec<u64>,
    pub output_vertex: u64,
    pub is_active: bool,
}

#[derive(Clone, Debug, Serialize, Deserialize)]
pub enum GateType {
    And, Or, Xor, Not, Nand, Nor, Xnor,
    Add, Mul, Sub,
}

#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct HfheCircuit {
    pub circuit_id: String,
    pub vertices: HashMap<u64, HyperVertex>,
    pub edges: Vec<HyperEdge>,
    pub max_noise: f64,
    pub bootstrap_threshold: f64,
}

#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct FheKeyMaterial {
    pub public_key: Vec<u8>,
    pub evaluation_key: Vec<u8>,
    pub epoch: u64,
    pub key_hash: String,
}

pub struct OctraFheClient {
    pub node_endpoint: String,
    pub circle_id: String,
    pub key_material: Option<FheKeyMaterial>,
    pub current_epoch: u64,
}

impl OctraFheClient {
    pub fn new(endpoint: &str, circle_id: &str) -> Self {
        Self {
            node_endpoint: endpoint.to_string(),
            circle_id: circle_id.to_string(),
            key_material: None,
            current_epoch: 0,
        }
    }

    pub fn encrypt_value(&self, value: u64, public_key: &[u8]) -> Vec<HyperVertex> {
        let mut vertices = Vec::new();
        for i in 0..64 {
            let bit = ((value >> i) & 1) as u8;
            let ciphertext = self.encrypt_bit(bit, public_key, i);
            vertices.push(HyperVertex {
                id: i as u64,
                ciphertext,
                noise_level: 0.0,
                epoch: self.current_epoch,
            });
        }
        vertices
    }

    fn encrypt_bit(&self, bit: u8, pk: &[u8], position: usize) -> Vec<u8> {
        let mut hasher = Sha3_256::new();
        hasher.update(&[bit]);
        hasher.update(pk);
        hasher.update(&position.to_le_bytes());
        hasher.finalize().to_vec()
    }

    pub fn build_and_gate(&self, a: u64, b: u64, output: u64) -> HyperEdge {
        HyperEdge {
            id: output,
            gate_type: GateType::And,
            input_vertices: vec![a, b],
            output_vertex: output,
            is_active: false,
        }
    }

    pub fn build_or_gate(&self, a: u64, b: u64, output: u64) -> HyperEdge {
        HyperEdge {
            id: output,
            gate_type: GateType::Or,
            input_vertices: vec![a, b],
            output_vertex: output,
            is_active: false,
        }
    }

    pub fn evaluate_circuit(&mut self, circuit: &mut HfheCircuit) -> Result<Vec<u8>, FheError> {
        for edge in &mut circuit.edges {
            match edge.gate_type {
                GateType::And => {
                    edge.is_active = self.check_vertices_active(&circuit.vertices, &edge.input_vertices)
                        && edge.input_vertices.len() == 2;
                }
                GateType::Or => {
                    edge.is_active = self.check_any_vertex_active(&circuit.vertices, &edge.input_vertices);
                }
                GateType::Xor => {
                    let active_count = self.count_active(&circuit.vertices, &edge.input_vertices);
                    edge.is_active = active_count == 1;
                }
                GateType::Not => {
                    if let Some(first) = edge.input_vertices.first() {
                        edge.is_active = !self.is_vertex_active(&circuit.vertices, *first);
                    }
                }
                GateType::Add | GateType::Mul | GateType::Sub => {
                    edge.is_active = self.evaluate_arithmetic(circuit, edge)?;
                }
                _ => {}
            }
        }
        if circuit.max_noise > circuit.bootstrap_threshold {
            self.bootstrap_circuit(circuit)?;
        }
        Ok(self.extract_result(circuit))
    }

    fn check_vertices_active(&self, vertices: &HashMap<u64, HyperVertex>, ids: &[u64]) -> bool {
        ids.iter().all(|id| vertices.get(id).map(|v| v.noise_level < 10.0).unwrap_or(false))
    }

    fn check_any_vertex_active(&self, vertices: &HashMap<u64, HyperVertex>, ids: &[u64]) -> bool {
        ids.iter().any(|id| vertices.get(id).map(|v| v.noise_level < 10.0).unwrap_or(false))
    }

    fn count_active(&self, vertices: &HashMap<u64, HyperVertex>, ids: &[u64]) -> usize {
        ids.iter().filter(|id| vertices.get(*id).map(|v| v.noise_level < 10.0).unwrap_or(false)).count()
    }

    fn is_vertex_active(&self, vertices: &HashMap<u64, HyperVertex>, id: u64) -> bool {
        vertices.get(&id).map(|v| v.noise_level < 10.0).unwrap_or(false)
    }

    fn evaluate_arithmetic(&self, _circuit: &HfheCircuit, _edge: &HyperEdge) -> Result<bool, FheError> {
        Ok(true)
    }

    fn bootstrap_circuit(&mut self, circuit: &mut HfheCircuit) -> Result<(), FheError> {
        for (_, vertex) in &mut circuit.vertices {
            vertex.noise_level = 0.0;
            vertex.epoch = self.current_epoch;
        }
        circuit.max_noise = 0.0;
        Ok(())
    }

    fn extract_result(&self, circuit: &HfheCircuit) -> Vec<u8> {
        circuit.vertices.values().map(|v| v.ciphertext.clone()).flatten().collect()
    }

    pub fn serialize_for_arkhe(&self, circuit: &HfheCircuit) -> Result<String, FheError> {
        let json = serde_json::to_string(circuit)
            .map_err(|e| FheError::SerializationError(e.to_string()))?;
        Ok(base64::encode(json))
    }
}

#[derive(Debug)]
pub enum FheError {
    EncryptionError(String),
    EvaluationError(String),
    BootstrapError(String),
    SerializationError(String),
    NetworkError(String),
}

impl std::fmt::Display for FheError {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            FheError::EncryptionError(s) => write!(f, "Encryption error: {}", s),
            FheError::EvaluationError(s) => write!(f, "Evaluation error: {}", s),
            FheError::BootstrapError(s) => write!(f, "Bootstrap error: {}", s),
            FheError::SerializationError(s) => write!(f, "Serialization error: {}", s),
            FheError::NetworkError(s) => write!(f, "Network error: {}", s),
        }
    }
}

impl std::error::Error for FheError {}