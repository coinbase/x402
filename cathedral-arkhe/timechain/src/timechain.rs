use serde::{Deserialize, Serialize};
use crate::mhd::EvoField;
use crate::shadow::Shadow;
use crate::retro::EchoSignal;
use crate::observer::ObserverState;
use sha2::{Sha256, Digest};
use std::time::SystemTime;

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq, Hash)]
pub struct ShadowHash(pub [u8; 32]);

impl ShadowHash {
    pub fn from_singular_values(tail_singular: &[f64]) -> Self {
        let mut hasher = Sha256::new();
        for &val in tail_singular {
            hasher.update(val.to_le_bytes());
        }
        let result = hasher.finalize();
        let mut hash = [0u8; 32];
        hash.copy_from_slice(&result);
        Self(hash)
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TimeBlock {
    pub height: u64,
    pub timestamp: i64,
    pub prev_hash: [u8; 32],
    pub helicity_before: f64,
    pub helicity_after: f64,
    pub delta_h: f64,
    pub shadow_state: ShadowHash,
    pub observer_attachment: f64,
    pub chern_simons_phase: f64,

    // Additional fields for compatibility
    pub timestamp_phase: f64,
    pub helicity: f64,
    pub delta_helicity: f64,
    pub shadow: Shadow,
    pub echo_signature: EchoSignal,
    pub transactions: Vec<String>,
}

impl TimeBlock {
    pub fn new(
        height: u64,
        prev_hash: [u8; 32],
        helicity_before: f64,
        helicity_after: f64,
        shadow_hash: ShadowHash,
        observer_attachment: f64,
        shadow: Shadow,
        echo_signature: EchoSignal,
    ) -> Self {
        let delta_h = helicity_after - helicity_before;
        Self {
            height,
            timestamp: chrono::Utc::now().timestamp(),
            prev_hash,
            helicity_before,
            helicity_after,
            delta_h,
            shadow_state: shadow_hash,
            observer_attachment,
            chern_simons_phase: 0.0,

            timestamp_phase: SystemTime::now()
                .duration_since(SystemTime::UNIX_EPOCH)
                .unwrap()
                .as_secs_f64(),
            helicity: helicity_after,
            delta_helicity: delta_h,
            shadow,
            echo_signature,
            transactions: Vec::new(),
        }
    }

    pub fn block_hash(&self) -> [u8; 32] {
        let mut hasher = Sha256::new();
        hasher.update(self.height.to_le_bytes());
        hasher.update(self.timestamp.to_le_bytes());
        hasher.update(self.prev_hash);
        hasher.update(self.delta_h.to_le_bytes());
        hasher.update(self.shadow_state.0);
        hasher.update(self.observer_attachment.to_le_bytes());
        hasher.update(self.chern_simons_phase.to_le_bytes());

        let result = hasher.finalize();
        let mut hash = [0u8; 32];
        hash.copy_from_slice(&result);
        hash
    }
}

pub struct ChernSimonsMiner {
    pub phase_tolerance: f64,
}

impl ChernSimonsMiner {
    pub fn new(difficulty: f64) -> Self {
        let tolerance = 0.1 * (1.0 - difficulty);
        Self { phase_tolerance: tolerance.max(1e-6) }
    }

    pub fn try_mine_block(
        &self,
        field: &EvoField,
        shadow: &Shadow,
        observer: &ObserverState,
        prev_hash: [u8; 32],
        height: u64,
        h_before: f64,
        echo_signature: EchoSignal,
    ) -> Option<TimeBlock> {
        let h_after = field.helicity();
        let delta_h = (h_after - h_before).abs();

        let cs_phase = (delta_h % (2.0 * std::f64::consts::PI)).abs();

        if observer.attachment > 0.5 {
            return None;
        }

        if cs_phase < self.phase_tolerance && shadow.energy_ratio < 0.2 {
            let tail = shadow.tail_singular.as_slice().unwrap_or(&[]);
            let shadow_hash = ShadowHash::from_singular_values(tail);

            let mut block = TimeBlock::new(
                height,
                prev_hash,
                h_before,
                h_after,
                shadow_hash,
                observer.attachment,
                shadow.clone(),
                echo_signature,
            );
            block.chern_simons_phase = cs_phase;
            return Some(block);
        }
        None
    }

    pub fn verify_block(&self, block: &TimeBlock) -> bool {
        if block.chern_simons_phase > self.phase_tolerance {
            return false;
        }
        if block.observer_attachment > 0.5 {
            return false;
        }
        let calculated_delta = (block.helicity_after - block.helicity_before).abs();
        if (calculated_delta - block.delta_h).abs() > 1e-6 {
            return false;
        }
        true
    }
}

pub struct ChernSimonsOracle {
    pub tolerance: f64,
}

impl ChernSimonsOracle {
    pub fn new(tolerance: f64) -> Self {
        Self { tolerance }
    }
    pub fn verify(&self, block: &TimeBlock, field: &EvoField) -> bool {
        let predicted_h = block.echo_signature.predicted_helicity;
        let actual_h = field.helicity();
        let delta = (predicted_h - actual_h).abs();
        delta < self.tolerance
    }
}
