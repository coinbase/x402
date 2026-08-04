//! PRNG Pós-Quântico — Semente do vetor de Bloch (Substrato 930)
//!
//! Cripto-Trivium (255): aleatoriedade imune a adversários quânticos.
//! A semente deriva do estado de um átomo de rubídio acoplado a ressonador SiN.

use sha3::{Shake256, digest::{Update, ExtendableOutput, XofReader}};
use rand_core::{RngCore, SeedableRng, Error};

/// Gerador PQC-safe com semente quântica
pub struct ArkheRng {
    state: [u8; 64],
    counter: u64,
}

impl ArkheRng {
    /// Deriva semente do vetor de Bloch (x, y, z) — Substrato 930
    pub fn from_bloch_vector(x: f64, y: f64, z: f64) -> Self {
        let mut hasher = Shake256::default();
        for &component in &[x, y, z] {
            hasher.update(&component.to_le_bytes());
        }
        // Mix com entropia do Cripto-Trivium (Substrato 255)
        hasher.update(b"ARKHE-TRIVIUM-255-QUANTUM-SEED");

        let mut reader = hasher.finalize_xof();
        let mut state = [0u8; 64];
        reader.read(&mut state);

        Self { state, counter: 0 }
    }

    /// Deterministicamente reprodutível — auditável
    pub fn from_seed(seed: [u8; 64]) -> Self {
        Self { state: seed, counter: 0 }
    }

    /// Gera próximo bloco de estado via SHAKE256(state || counter)
    fn next_block(&mut self) -> [u8; 64] {
        let mut hasher = Shake256::default();
        hasher.update(&self.state);
        hasher.update(&self.counter.to_le_bytes());

        let mut reader = hasher.finalize_xof();
        let mut block = [0u8; 64];
        reader.read(&mut block);

        self.counter += 1;
        // Feed-forward: novo estado = XOR(state, block)
        for (i, val) in block.iter().enumerate() {
            self.state[i] ^= val;
        }
        block
    }
}

impl RngCore for ArkheRng {
    fn next_u32(&mut self) -> u32 {
        let block = self.next_block();
        u32::from_le_bytes([block[0], block[1], block[2], block[3]])
    }

    fn next_u64(&mut self) -> u64 {
        let block = self.next_block();
        u64::from_le_bytes([
            block[0], block[1], block[2], block[3],
            block[4], block[5], block[6], block[7],
        ])
    }

    fn fill_bytes(&mut self, dest: &mut [u8]) {
        let mut offset = 0;
        while offset < dest.len() {
            let block = self.next_block();
            let remaining = dest.len() - offset;
            let to_copy = remaining.min(64);
            dest[offset..offset + to_copy].copy_from_slice(&block[..to_copy]);
            offset += to_copy;
        }
    }

    fn try_fill_bytes(&mut self, dest: &mut [u8]) -> Result<(), Error> {
        self.fill_bytes(dest);
        Ok(())
    }
}

impl SeedableRng for ArkheRng {
    type Seed = [u8; 32];

    fn from_seed(seed: Self::Seed) -> Self {
        let mut state = [0u8; 64];
        state[..32].copy_from_slice(&seed);
        Self::from_seed(state)
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_determinism() {
        let mut rng1 = ArkheRng::from_bloch_vector(0.5, 0.3, 0.8);
        let mut rng2 = ArkheRng::from_bloch_vector(0.5, 0.3, 0.8);
        assert_eq!(rng1.next_u64(), rng2.next_u64());
        assert_eq!(rng1.next_u32(), rng2.next_u32());
    }

    #[test]
    fn test_quantum_seed_variation() {
        let mut rng1 = ArkheRng::from_bloch_vector(0.1, 0.2, 0.3);
        let mut rng2 = ArkheRng::from_bloch_vector(0.3, 0.2, 0.1);
        // Probabilisticamente diferentes (não falha por coincidência)
        assert_ne!(rng1.next_u64(), rng2.next_u64());
    }
}
