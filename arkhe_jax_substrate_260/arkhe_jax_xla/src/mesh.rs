//! Device Mesh — Particionamento de computação (pmap-like)
//!
//! Substrato 913 (World Model): distribuição alinhada à topologia causal.

use serde::{Serialize, Deserialize};

/// Especificação de sharding para um tensor
#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct ShardSpec {
    pub mesh_axes: Vec<String>,      // e.g., ["x", "y"]
    pub partition_spec: Vec<Option<String>>, // e.g., ["x", None]
}

/// Malha de dispositivos heterogéneos
pub struct DeviceMesh {
    pub devices: Vec<Device>,
    pub topology: MeshTopology,
}

#[derive(Clone, Debug)]
pub struct Device {
    pub id: usize,
    pub kind: DeviceKind,
    pub backend: String, // "wgpu", "cpu", "fhe"
}

#[derive(Clone, Debug, PartialEq, Eq)]
pub enum DeviceKind {
    Cpu,
    Gpu { vendor: String, model: String },
    FheNode { endpoint: String }, // Substrato 840
}

#[derive(Clone, Debug)]
pub struct MeshTopology {
    pub dims: Vec<usize>,
}

impl DeviceMesh {
    pub fn new(devices: Vec<Device>, dims: Vec<usize>) -> Self {
        Self { devices, topology: MeshTopology { dims } }
    }

    /// Particiona shape segundo especificação de sharding
    pub fn partition(&self, shape: &[usize], spec: &ShardSpec) -> Vec<Vec<usize>> {
        let mut shards = vec![shape.to_vec()];
        for (dim, axis) in spec.partition_spec.iter().enumerate() {
            if let Some(axis_name) = axis {
                let axis_idx = spec.mesh_axes.iter().position(|a| a == axis_name).unwrap_or(0);
                let n_parts = self.topology.dims.get(axis_idx).copied().unwrap_or(1);
                let mut new_shards = Vec::new();
                for s in &shards {
                    let dim_size = s[dim];
                    let part_size = dim_size / n_parts;
                    for _p in 0..n_parts {
                        let mut new_s = s.clone();
                        new_s[dim] = part_size;
                        new_shards.push(new_s);
                    }
                }
                shards = new_shards;
            }
        }
        shards
    }
}
