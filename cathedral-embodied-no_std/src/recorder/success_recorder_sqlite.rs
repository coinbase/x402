use rusqlite::{params, Connection, Result as SqlResult};
use std::path::Path;

pub struct SuccessRecorder {
    conn: Connection,
}

impl SuccessRecorder {
    /// Abre (ou cria) o banco SQLite e aplica o schema.
    pub fn new(db_path: &str) -> SqlResult<Self> {
        let conn = Connection::open(Path::new(db_path))?;
        conn.execute_batch(include_str!("success_recorder_schema.sql"))?;
        Ok(Self { conn })
    }

    // ========================================================
    // 1. Métodos de gravação
    // ========================================================

    /// Registra uma rodada cognitiva completa.
    pub fn record_round(
        &mut self,
        round: u32,
        acceptance_rate: f32,
        interference: f32,
        latency_ms: f64,
        proof_used: bool,
    ) -> SqlResult<()> {
        self.conn.execute(
            "INSERT OR REPLACE INTO rounds (round, acceptance, interference, latency_ms, proof_used)
             VALUES (?1, ?2, ?3, ?4, ?5)",
            params![round, acceptance_rate, interference, latency_ms, proof_used as i32],
        )?;
        Ok(())
    }

    /// Registra a performance de um hub em uma rodada.
    pub fn record_hub_performance(
        &mut self,
        hub: &str,
        round: u32,
        acceptance_rate: f32,
        volume: u32,
        roas: f32,
    ) -> SqlResult<()> {
        self.conn.execute(
            "INSERT OR REPLACE INTO hub_performance (hub, round, acceptance_rate, volume, roas)
             VALUES (?1, ?2, ?3, ?4, ?5)",
            params![hub, round, acceptance_rate, volume, roas],
        )?;
        Ok(())
    }

    /// Registra o resultado de uma recomendação (aceita ou não).
    pub fn record_recommendation(
        &mut self,
        round: u32,
        hub: &str,
        title: &str,
        url: &str,
        accepted: bool,
    ) -> SqlResult<()> {
        self.conn.execute(
            "INSERT INTO recommendations (round, hub, title, url, accepted)
             VALUES (?1, ?2, ?3, ?4, ?5)",
            params![round, hub, title, url, accepted as i32],
        )?;
        Ok(())
    }

    // ========================================================
    // 2. Consultas agregadas para AegisEvolution e dashboards
    // ========================================================

    /// Média da taxa de aceitação geral (opcionalmente sobre os últimos N rounds).
    pub fn average_acceptance_rate(&self, last_n: Option<u32>) -> SqlResult<f32> {
        let sql = match last_n {
            Some(n) => format!(
                "SELECT AVG(acceptance) FROM (SELECT acceptance FROM rounds ORDER BY round DESC LIMIT {})",
                n
            ),
            None => "SELECT AVG(acceptance) FROM rounds".to_string(),
        };
        let mut stmt = self.conn.prepare(&sql)?;
        let avg: Option<f32> = stmt.query_row([], |row| row.get(0))?;
        Ok(avg.unwrap_or(0.0))
    }

    /// Taxa de uso de memory proof nas últimas N rodadas.
    pub fn memory_proof_usage_rate(&self, last_n: u32) -> SqlResult<f32> {
        let sql = format!(
            "SELECT AVG(proof_used) FROM (SELECT proof_used FROM rounds ORDER BY round DESC LIMIT {})",
            last_n
        );
        let mut stmt = self.conn.prepare(&sql)?;
        let rate: Option<f32> = stmt.query_row([], |row| row.get(0))?;
        Ok(rate.unwrap_or(0.0))
    }

    /// Performance agregada dos hubs nas últimas `last_rounds` rodadas.
    /// Retorna (hub, avg_acceptance, total_volume, avg_roas).
    pub fn recent_hub_stats(&self, last_rounds: u32) -> SqlResult<Vec<(String, f32, u32, f32)>> {
        let mut stmt = self.conn.prepare(
            "SELECT hub, AVG(acceptance_rate), SUM(volume), AVG(roas)
             FROM hub_performance
             WHERE round >= (SELECT MAX(round) - ?1 + 1 FROM rounds)
             GROUP BY hub"
        )?;
        let rows = stmt.query_map(params![last_rounds], |row| {
            Ok((
                row.get::<_, String>(0)?,
                row.get::<_, f32>(1)?,
                row.get::<_, u32>(2)?,
                row.get::<_, f32>(3)?,
            ))
        })?;
        let mut result = Vec::new();
        for r in rows {
            result.push(r?);
        }
        Ok(result)
    }

    /// Taxa de aceitação de um hub específico nas últimas N rodadas.
    pub fn hub_acceptance_rate(&self, hub: &str, last_n: u32) -> SqlResult<f32> {
        let sql = format!(
            "SELECT AVG(acceptance_rate) FROM hub_performance WHERE hub = ?1 ORDER BY round DESC LIMIT {}",
            last_n
        );
        let mut stmt = self.conn.prepare(&sql)?;
        let avg: Option<f32> = stmt.query_row(params![hub], |row| row.get(0))?;
        Ok(avg.unwrap_or(0.0))
    }

    /// Volume total de recomendações por hub nas últimas rodadas.
    pub fn recommendation_volume_by_hub(&self, last_rounds: u32) -> SqlResult<Vec<(String, u32)>> {
        let mut stmt = self.conn.prepare(
            "SELECT hub, COUNT(*) FROM recommendations WHERE round >= (SELECT MAX(round) - ?1 + 1 FROM rounds) GROUP BY hub"
        )?;
        let rows = stmt.query_map(params![last_rounds], |row| {
            Ok((row.get::<_, String>(0)?, row.get::<_, u32>(1)?))
        })?;
        let mut result = Vec::new();
        for r in rows {
            result.push(r?);
        }
        Ok(result)
    }

    /// Proporção de recomendações aceitas por hub nas últimas rodadas.
    pub fn hub_acceptance_ratio(&self, last_rounds: u32) -> SqlResult<Vec<(String, f32)>> {
        let mut stmt = self.conn.prepare(
            "SELECT hub, AVG(accepted) FROM recommendations WHERE round >= (SELECT MAX(round) - ?1 + 1 FROM rounds) GROUP BY hub"
        )?;
        let rows = stmt.query_map(params![last_rounds], |row| {
            Ok((row.get::<_, String>(0)?, row.get::<_, f32>(1)?))
        })?;
        let mut result = Vec::new();
        for r in rows {
            result.push(r?);
        }
        Ok(result)
    }

    /// Lista as últimas rodadas registradas.
    pub fn get_recent_rounds(&self, limit: u32) -> SqlResult<Vec<(u32, f32, f32, f64, bool)>> {
        let mut stmt = self.conn.prepare(
            "SELECT round, acceptance, interference, latency_ms, proof_used FROM rounds ORDER BY round DESC LIMIT ?1"
        )?;
        let rows = stmt.query_map(params![limit], |row| {
            Ok((
                row.get::<_, u32>(0)?,
                row.get::<_, f32>(1)?,
                row.get::<_, f32>(2)?,
                row.get::<_, f64>(3)?,
                row.get::<_, i32>(4)? != 0,
            ))
        })?;
        let mut result = Vec::new();
        for r in rows {
            result.push(r?);
        }
        Ok(result)
    }

    /// Melhores hubs por taxa de aceitação (exige ao menos `min_rounds` participações).
    pub fn get_top_performing_hubs(&self, min_rounds: u32) -> SqlResult<Vec<(String, f32, u32)>> {
        let mut stmt = self.conn.prepare(
            "SELECT hub, AVG(acceptance_rate), COUNT(*)
             FROM hub_performance
             GROUP BY hub
             HAVING COUNT(*) >= ?1
             ORDER BY AVG(acceptance_rate) DESC"
        )?;
        let rows = stmt.query_map(params![min_rounds], |row| {
            Ok((row.get::<_, String>(0)?, row.get::<_, f32>(1)?, row.get::<_, u32>(2)?))
        })?;
        let mut result = Vec::new();
        for r in rows {
            result.push(r?);
        }
        Ok(result)
    }

    /// Método auxiliar para obter todas as recomendações de um round específico.
    pub fn get_recommendations_for_round(&self, round: u32) -> SqlResult<Vec<(String, String, bool)>> {
        let mut stmt = self.conn.prepare(
            "SELECT hub, url, accepted FROM recommendations WHERE round = ?1"
        )?;
        let rows = stmt.query_map(params![round], |row| {
            Ok((
                row.get::<_, String>(0)?,
                row.get::<_, String>(1)?,
                row.get::<_, i32>(2)? != 0,
            ))
        })?;
        let mut result = Vec::new();
        for r in rows {
            result.push(r?);
        }
        Ok(result)
    }
}
