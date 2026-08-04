//! src/substrato_9500_hierarchical_wormhole/hierarchical_wormhole.rs
//! Hierarchical Wormhole — compressão de abstrações
//! Selo: CATHEDRAL-ARKHE-AGI-WORMHOLE-v3.0.0-2026-06-19

use std::collections::HashMap;
use serde::{Serialize, Deserialize};

/// Representação de uma abstração
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Abstraction {
    pub id: String,
    pub content: String,            // representação textual da abstração
    pub hierarchy_level: u32,       // nível hierárquico (0 = mais concreto)
    pub children: Vec<Abstraction>, // abstrações filhas (mais detalhadas)
    pub parent_id: Option<String>,
    pub compressed_size: usize,     // tamanho em tokens após compressão
    pub semantic_hash: String,      // hash semântico (para dedup)
}

/// Hierarchical Wormhole Router
pub struct HierarchicalWormhole {
    abstraction_cache: HashMap<String, Abstraction>,
    max_level: u32,
    _compression_ratio_target: f32, // ex: 0.95 (economia de 95%)
}

impl HierarchicalWormhole {
    pub fn new(max_level: u32, compression_ratio_target: f32) -> Self {
        Self {
            abstraction_cache: HashMap::new(),
            max_level,
            _compression_ratio_target: compression_ratio_target,
        }
    }

    /// Comprime texto em uma hierarquia de abstrações
    pub fn compress(&mut self, text: &str) -> anyhow::Result<String> {
        // 1. Segmenta o texto em unidades semânticas (ex: sentenças)
        let sentences: Vec<&str> = text.split('.').map(|s| s.trim()).filter(|s| !s.is_empty()).collect();

        // 2. Constrói árvore de abstrações hierárquica
        let root = self.build_abstraction_tree(&sentences, 0)?;

        // 3. Serializa a abstração raiz em forma compacta
        let compressed = self.serialize_abstraction(&root);

        // 4. Armazena em cache
        let hash = blake3::hash(text.as_bytes());
        let key = hash.to_hex().to_string();
        self.abstraction_cache.insert(key, root);

        Ok(compressed)
    }

    /// Constrói árvore de abstrações recursivamente
    fn build_abstraction_tree(&mut self, segments: &[&str], level: u32) -> anyhow::Result<Abstraction> {
        if level >= self.max_level || segments.len() <= 2 {
            // Nível folha: concatena tudo
            let content = segments.join(". ");
            return Ok(Abstraction {
                id: format!("abs-{}-{}", level, segments.len()),
                content: content.clone(),
                hierarchy_level: level,
                children: Vec::new(),
                parent_id: None,
                compressed_size: content.len() / 4, // estimativa de tokens
                semantic_hash: blake3::hash(content.as_bytes()).to_hex().to_string(),
            });
        }

        // Agrupa segmentos em grupos semânticos (ex: por similaridade)
        let groups = self.group_semantic(segments, 2)?; // agrupa em 2 grupos
        let mut children = Vec::new();
        let mut child_contents = Vec::new();
        for group in groups {
            let child = self.build_abstraction_tree(&group, level + 1)?;
            child_contents.push(child.content.clone());
            children.push(child);
        }

        // Cria abstração pai
        let content = child_contents.join(" | ");
        Ok(Abstraction {
            id: format!("abs-{}-{}", level, segments.len()),
            content: content.clone(),
            hierarchy_level: level,
            children,
            parent_id: None,
            compressed_size: content.len() / 4,
            semantic_hash: blake3::hash(content.as_bytes()).to_hex().to_string(),
        })
    }

    /// Agrupamento semântico simples (por similaridade de palavras-chave)
    fn group_semantic<'a>(&self, segments: &[&'a str], num_groups: usize) -> anyhow::Result<Vec<Vec<&'a str>>> {
        // Simulação: distribui igualmente
        let mut groups = Vec::new();
        let chunk_size = (segments.len() + num_groups - 1) / num_groups;
        for chunk in segments.chunks(chunk_size) {
            groups.push(chunk.to_vec());
        }
        Ok(groups)
    }

    /// Serializa abstração em formato compacto (ex: JSON-like)
    fn serialize_abstraction(&self, abs: &Abstraction) -> String {
        if abs.children.is_empty() {
            format!("[{}]", abs.content)
        } else {
            let children_str: Vec<String> = abs.children.iter()
                .map(|c| self.serialize_abstraction(c))
                .collect();
            format!("({})", children_str.join(","))
        }
    }

    /// Descompressão: reconstrói texto a partir da abstração
    pub fn decompress(&self, compressed: &str) -> anyhow::Result<String> {
        // Simples: substitui parênteses por concatenação
        let text = compressed.replace('(', "").replace(')', "").replace(',', ". ");
        Ok(text)
    }

    /// Obtém a abstração de nível mais alto para um dado texto
    pub fn get_abstraction(&self, text: &str) -> Option<&Abstraction> {
        let hash = blake3::hash(text.as_bytes());
        let key = hash.to_hex().to_string();
        self.abstraction_cache.get(&key)
    }
}
