use crate::swarm::orchestrator::SecondSelfOrchestrator;
use crate::evolution::desci_node_resource::{FreeTier, DeSciNodeResource};

#[derive(Debug, Clone)]
pub enum DeSciCommand {
    Publish {
        title: String,
        abstract_text: Option<String>,
        components: Vec<String>,
        authors: Vec<String>,
        license: Option<String>,
        publish: bool,
        spdx_license: Option<String>,
        copyright_holder: Option<String>,
        software_version: Option<String>,
        derived_from: Option<String>,
        ai_generated: Option<bool>,
        training_data: Option<String>,
    },
    Update {
        node_id: String,
        spdx: Option<String>,
        copyright: Option<String>,
        software_version: Option<String>,
        derived_from: Option<String>,
        ai_generated: Option<bool>,
        training_data: Option<String>,
    },
    Royalties {
        node_id: String,
        price: String,
        currency: String,
        splits: Vec<(String, f32)>,
        picnic_basket: Option<String>,
        free_tier: Option<u32>,
    },
}

impl DeSciCommand {
    pub fn parse(input: &str) -> Option<Self> {
        let parts: Vec<&str> = input.trim().split_whitespace().collect();
        if parts.is_empty() { return None; }

        match parts[0] {
            "/desci-publish" | "desci-publish" => {
                let mut title = String::new();
                let abstract_text = None;
                let components = Vec::new();
                let authors = Vec::new();
                let license = None;
                let mut publish = false;
                let mut spdx_license = None;
                let mut copyright_holder = None;
                let mut software_version = None;
                let mut derived_from = None;
                let mut ai_generated = None;
                let mut training_data = None;
                let mut i = 1;

                while i < parts.len() {
                    match parts[i] {
                        "--publish" => { publish = true; i += 1; }
                        "--spdx" => {
                            if i + 1 < parts.len() {
                                spdx_license = Some(parts[i + 1].to_string());
                                i += 2;
                            } else { i += 1; }
                        }
                        "--copyright" => {
                            if i + 1 < parts.len() {
                                copyright_holder = Some(parts[i + 1].to_string());
                                i += 2;
                            } else { i += 1; }
                        }
                        "--software-version" => {
                            if i + 1 < parts.len() {
                                software_version = Some(parts[i + 1].to_string());
                                i += 2;
                            } else { i += 1; }
                        }
                        "--derived-from" => {
                            if i + 1 < parts.len() {
                                derived_from = Some(parts[i + 1].to_string());
                                i += 2;
                            } else { i += 1; }
                        }
                        "--ai-generated" => {
                            if i + 1 < parts.len() {
                                ai_generated = Some(parts[i + 1].parse().unwrap_or(false));
                                i += 2;
                            } else { i += 1; }
                        }
                        "--training-data" => {
                            if i + 1 < parts.len() {
                                training_data = Some(parts[i + 1].to_string());
                                i += 2;
                            } else { i += 1; }
                        }
                        _ => {
                            if title.is_empty() {
                                title = parts[i..].join(" ");
                                break;
                            }
                            i += 1;
                        }
                    }
                }

                Some(Self::Publish {
                    title,
                    abstract_text,
                    components,
                    authors,
                    license,
                    publish,
                    spdx_license,
                    copyright_holder,
                    software_version,
                    derived_from,
                    ai_generated,
                    training_data,
                })
            }
            "/desci-update" | "desci-update" => {
                if parts.len() < 2 { return None; }
                let node_id = parts[1].to_string();
                let mut spdx = None;
                let mut copyright = None;
                let mut sw_version = None;
                let mut derived = None;
                let mut ai = None;
                let mut training = None;
                let mut i = 2;
                while i < parts.len() {
                    match parts[i] {
                        "--spdx" => {
                            if i + 1 < parts.len() {
                                spdx = Some(parts[i + 1].to_string());
                                i += 2;
                            } else { i += 1; }
                        }
                        "--copyright" => {
                            if i + 1 < parts.len() {
                                copyright = Some(parts[i + 1].to_string());
                                i += 2;
                            } else { i += 1; }
                        }
                        "--software-version" => {
                            if i + 1 < parts.len() {
                                sw_version = Some(parts[i + 1].to_string());
                                i += 2;
                            } else { i += 1; }
                        }
                        "--derived-from" => {
                            if i + 1 < parts.len() {
                                derived = Some(parts[i + 1].to_string());
                                i += 2;
                            } else { i += 1; }
                        }
                        "--ai-generated" => {
                            if i + 1 < parts.len() {
                                ai = Some(parts[i + 1].parse().unwrap_or(false));
                                i += 2;
                            } else { i += 1; }
                        }
                        "--training-data" => {
                            if i + 1 < parts.len() {
                                training = Some(parts[i + 1].to_string());
                                i += 2;
                            } else { i += 1; }
                        }
                        _ => { i += 1; }
                    }
                }
                Some(Self::Update { node_id, spdx, copyright, software_version: sw_version, derived_from: derived, ai_generated: ai, training_data: training })
            }
            "/desci-royalties" | "desci-royalties" => {
                if parts.len() < 2 { return None; }
                let node_id = parts[1].to_string();
                let mut price = "0.001".to_string();
                let mut currency = "USDC".to_string();
                let mut splits = Vec::new();
                let mut picnic_basket = None;
                let mut free_tier = None;
                let mut i = 2;

                while i < parts.len() {
                    match parts[i] {
                        "--price" => { if i + 1 < parts.len() { price = parts[i + 1].to_string(); i += 2; } else { i += 1; } }
                        "--currency" => { if i + 1 < parts.len() { currency = parts[i + 1].to_string(); i += 2; } else { i += 1; } }
                        "--split" => {
                            if i + 1 < parts.len() {
                                let sp: Vec<&str> = parts[i + 1].split(':').collect();
                                if sp.len() == 2 {
                                    splits.push((sp[0].to_string(), sp[1].parse().unwrap_or(0.0)));
                                }
                                i += 2;
                            } else { i += 1; }
                        }
                        "--picnic-basket" => {
                            if i + 1 < parts.len() {
                                picnic_basket = Some(parts[i + 1].to_string());
                                i += 2;
                            } else { i += 1; }
                        }
                        "--free-tier" => {
                            if i + 1 < parts.len() {
                                free_tier = parts[i + 1].parse().ok();
                                i += 2;
                            } else { i += 1; }
                        }
                        _ => { i += 1; }
                    }
                }

                Some(Self::Royalties {
                    node_id,
                    price: format!("{} {}", price, currency),
                    currency,
                    splits,
                    picnic_basket,
                    free_tier,
                })
            }
            _ => None,
        }
    }

    pub async fn execute(&self, orchestrator: &mut SecondSelfOrchestrator) -> Result<String, String> {
        match self {
            Self::Publish { title, spdx_license, copyright_holder, software_version, derived_from, ai_generated, training_data, .. } => {
                let mut node = DeSciNodeResource::new(
                    &uuid::Uuid::new_v4().to_string(),
                    title,
                    &orchestrator.identity.npub,
                    None,
                );
                node.spdx_license = spdx_license.clone();
                node.copyright_holder = copyright_holder.clone();
                node.software_version = software_version.clone();
                node.derived_from_dpid = derived_from.clone();
                if let Some(ai) = ai_generated { node.ai_generated = Some(*ai); }
                node.training_data_provenance = training_data.clone();

                orchestrator.publish_desci_node(&mut node, false).await?;
                Ok("Publish complete".to_string())
            }
            Self::Update { node_id, spdx, copyright, software_version, derived_from, ai_generated, training_data } => {
                let mut node = orchestrator.load_desci_node(node_id).await?;
                if let Some(s) = spdx { node.spdx_license = Some(s.clone()); }
                if let Some(c) = copyright { node.copyright_holder = Some(c.clone()); }
                if let Some(v) = software_version { node.software_version = Some(v.clone()); }
                if let Some(d) = derived_from { node.derived_from_dpid = Some(d.clone()); }
                if let Some(a) = ai_generated { node.ai_generated = Some(*a); }
                if let Some(t) = training_data { node.training_data_provenance = Some(t.clone()); }
                orchestrator.save_node_version(&node).await?;
                Ok("✅ Metadados atualizados com sucesso".to_string())
            }
            Self::Royalties { node_id, price, splits, picnic_basket, free_tier, .. } => {
                orchestrator.enable_royalties(
                    node_id,
                    price,
                    splits.clone(),
                    picnic_basket.as_deref(),
                    free_tier.map(|max| FreeTier {
                        max_free_accesses: max,
                        reset_interval: Some("daily".to_string()),
                    }),
                ).await?;

                let mut output = format!(
                    "✅ Royalties configurados para Node {}\n\n💰 Preço: {}\n📊 Split:\n",
                    node_id, price
                );
                for (npub, share) in splits {
                    output.push_str(&format!("   - {}: {:.1}%\n", npub, share * 100.0));
                }
                if let Some(basket) = picnic_basket {
                    output.push_str(&format!("🧺 Picnic Basket: {}\n", basket));
                }
                if let Some(ft) = free_tier {
                    output.push_str(&format!("🎁 Free tier: {} acessos gratuitos (reset diário)\n", ft));
                }
                Ok(output)
            }
        }
    }
}
