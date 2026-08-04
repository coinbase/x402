use serde::{Deserialize, Serialize};
use std::fs;
use std::path::PathBuf;
use crate::shadow::Shadow;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ShadowSnapshot {
    pub height: u64,
    pub shadow: Shadow,
    pub timestamp: f64,
}

pub struct ShadowStore {
    pub dir: PathBuf,
}

impl ShadowStore {
    pub fn new(dir: PathBuf) -> Self {
        fs::create_dir_all(&dir).unwrap();
        Self { dir }
    }
    pub fn save(&self, snapshot: &ShadowSnapshot) -> Result<(), std::io::Error> {
        let path = self.dir.join(format!("shadow_{}.bin", snapshot.height));
        let bytes = bincode::serialize(snapshot).unwrap();
        fs::write(path, bytes)
    }
    pub fn load(&self, height: u64) -> Result<ShadowSnapshot, std::io::Error> {
        let path = self.dir.join(format!("shadow_{}.bin", height));
        let bytes = fs::read(path)?;
        Ok(bincode::deserialize(&bytes).unwrap())
    }
    pub fn list(&self) -> Vec<u64> {
        let mut heights = Vec::new();
        for entry in fs::read_dir(&self.dir).unwrap() {
            let entry = entry.unwrap();
            let name = entry.file_name().to_string_lossy().to_string();
            if let Some(stripped) = name.strip_prefix("shadow_").and_then(|s| s.strip_suffix(".bin")) {
                if let Ok(h) = stripped.parse::<u64>() {
                    heights.push(h);
                }
            }
        }
        heights.sort();
        heights
    }
}
