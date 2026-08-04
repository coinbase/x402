//! SuccessRecorder Híbrido – Tenta SQLite primeiro, cai para JSON automaticamente.
//! Ideal para ambientes de desenvolvimento e produção.

use std::path::Path;

use crate::recorder::success_recorder::SuccessRecorder as JsonRecorder;           // JSON
use crate::recorder::success_recorder_sqlite::SuccessRecorder as SqliteRecorder; // SQLite

/// Enum interno para selecionar o backend
pub enum RecorderBackend {
    Sqlite(SqliteRecorder),
    Json(JsonRecorder),
}

/// SuccessRecorder Híbrido
pub struct SuccessRecorder {
    backend: RecorderBackend,
}

impl SuccessRecorder {
    /// Cria um SuccessRecorder híbrido.
    /// - Se `SUCCESS_RECORDER_DB` estiver definido → tenta SQLite
    /// - Caso contrário ou se falhar → usa JSON (SUCCESS_RECORDER_PATH ou padrão)
    pub fn new() -> Self {
        // 1. Tenta SQLite primeiro
        if let Ok(db_path) = std::env::var("SUCCESS_RECORDER_DB") {
            if let Ok(sqlite) = SqliteRecorder::new(&db_path) {
                println!("[SuccessRecorder] Usando backend SQLite: {}", db_path);
                return Self {
                    backend: RecorderBackend::Sqlite(sqlite),
                };
            } else {
                eprintln!("[SuccessRecorder] Falha ao abrir SQLite em {}. Usando JSON como fallback.", db_path);
            }
        }

        // 2. Fallback para JSON
        let json_path = std::env::var("SUCCESS_RECORDER_PATH").ok();
        let json_recorder = JsonRecorder::new(json_path.as_deref());

        println!("[SuccessRecorder] Usando backend JSON: {:?}", json_path);

        Self {
            backend: RecorderBackend::Json(json_recorder),
        }
    }

    // ============================================================
    // Métodos de gravação (delegam para o backend ativo)
    // ============================================================

    pub fn record_round(&mut self, round: u32, acceptance_rate: f32, memory_proof_used: bool) {
        match &mut self.backend {
            RecorderBackend::Sqlite(r) => {
                let _ = r.record_round(round, acceptance_rate, 0.0, 0.0, memory_proof_used);
            }
            RecorderBackend::Json(r) => {
                r.record_round(round, acceptance_rate, memory_proof_used);
            }
        }
    }

    pub fn flush(&self) {
        if let RecorderBackend::Json(r) = &self.backend {
            r.flush();
        }
        // SQLite já persiste automaticamente
    }

    // ============================================================
    // Métodos de consulta (apenas SQLite possui consultas ricas)
    // ============================================================

    pub fn average_acceptance_rate(&self, last_n: Option<u32>) -> f32 {
        match &self.backend {
            RecorderBackend::Sqlite(r) => r.average_acceptance_rate(last_n).unwrap_or(0.0),
            RecorderBackend::Json(r) => r.average_acceptance_rate(last_n),
        }
    }

    pub fn recent_hub_stats(&self, last_rounds: u32) -> Result<Vec<(String, f32, u32, f32)>, rusqlite::Error> {
        match &self.backend {
            RecorderBackend::Sqlite(r) => r.recent_hub_stats(last_rounds),
            RecorderBackend::Json(_) => Ok(Vec::new()), // JSON não tem essa consulta
        }
    }

    pub fn get_top_performing_hubs(&self, min_rounds: u32) -> Vec<(String, f32, u32)> {
        match &self.backend {
            RecorderBackend::Sqlite(r) => r.get_top_performing_hubs(min_rounds).unwrap_or_default(),
            RecorderBackend::Json(_) => Vec::new(),
        }
    }

    // Adicione aqui outros métodos de consulta conforme necessário
}
