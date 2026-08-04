use clap::Parser;
use tracing::{info, warn};
use std::collections::HashMap;

use arkhe::hashtree::adapter::HashTreeStorage;
use arkhe::evolution::desci_node_resource::DeSciNodeResource;

#[derive(Parser, Debug)]
#[clap(name = "migrate-pix-key")]
struct Args {
    #[clap(long, default_value = "./hashtree")]
    hashtree_path: String,

    #[clap(long)]
    dry_run: bool,

    #[clap(long)]
    mapping_file: Option<String>,
}

#[tokio::main]
async fn main() -> Result<(), String> {
    tracing_subscriber::fmt::init();

    let args = Args::parse();

    info!("🔍 Iniciando migração de pix_key...");
    if args.dry_run {
        info!("⚠️ Modo DRY RUN: nenhuma alteração será salva");
    }

    let storage = HashTreeStorage::new(&args.hashtree_path)
        .map_err(|e| format!("Erro ao carregar HashTree: {}", e))?;

    let mapping = if let Some(path) = &args.mapping_file {
        load_mapping(path).await?
    } else {
        HashMap::new()
    };

    let nodes_path = "desci/nodes/";
    let entries = storage.list_entries(nodes_path).await
        .map_err(|e| format!("Erro ao listar Nodes: {}", e))?;

    let mut updated = 0;
    let mut skipped = 0;

    for entry in entries {
        let node_id = entry.trim_start_matches(nodes_path).trim_end_matches('/');
        info!("📂 Processando Node: {}", node_id);

        let node_data = storage.get_bytes(&format!("{}{}/latest", nodes_path, node_id)).await;
        if node_data.is_err() {
            warn!("   ⚠️ Node sem versão 'latest', ignorado.");
            skipped += 1;
            continue;
        }

        let mut node: DeSciNodeResource = DeSciNodeResource::from_bytes(&node_data.unwrap())
            .map_err(|e| format!("Erro ao desserializar Node: {}", e))?;

        let has_pix = node.contributors.iter().any(|c| c.pix_key.is_some());
        if has_pix {
            info!("   ✅ Node já possui pix_key, ignorado.");
            skipped += 1;
            continue;
        }

        let mut changed = false;
        for contributor in &mut node.contributors {
            if let Some(pix_key) = mapping.get(&contributor.npub) {
                contributor.pix_key = Some(pix_key.clone());
                changed = true;
                info!("   ✅ pix_key adicionado para {}", contributor.npub);
            } else if !args.dry_run {
                let input = inquire::Text::new(&format!("Pix key para {}:", contributor.npub))
                    .prompt()
                    .ok();
                if let Some(key) = input {
                    if !key.is_empty() {
                        contributor.pix_key = Some(key);
                        changed = true;
                    }
                }
            }
        }

        if !changed {
            info!("   ⏭️ Nenhuma mudança necessária.");
            skipped += 1;
            continue;
        }

        if !args.dry_run {
            let bytes = node.to_bytes()?;
            storage.put_bytes(&format!("{}{}/latest", nodes_path, node_id), &bytes).await
                .map_err(|e| format!("Erro ao salvar Node: {}", e))?;
            info!("   💾 Node {} atualizado.", node_id);
            updated += 1;
        } else {
            info!("   🧪 DRY RUN: Node {} seria atualizado.", node_id);
            updated += 1;
        }
    }

    info!("✅ Migração concluída!");
    info!("   📊 Nodes atualizados: {}", updated);
    info!("   ⏭️ Nodes ignorados: {}", skipped);

    Ok(())
}

async fn load_mapping(path: &str) -> Result<HashMap<String, String>, String> {
    let content = tokio::fs::read_to_string(path).await
        .map_err(|e| format!("Erro ao ler arquivo: {}", e))?;
    let mut map = HashMap::new();
    for line in content.lines() {
        let parts: Vec<&str> = line.split(',').collect();
        if parts.len() >= 2 {
            map.insert(parts[0].to_string(), parts[1].to_string());
        }
    }
    Ok(map)
}
