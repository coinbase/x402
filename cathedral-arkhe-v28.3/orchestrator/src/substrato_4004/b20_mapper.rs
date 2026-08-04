//! src/substrato_4004/b20_mapper.rs
//! Mapeia Actions do Cathedral para operações B20

use ethers::types::{Address, Bytes, U256};
use serde::{Deserialize, Serialize};

/// Operação B20 mapeada a partir de uma Cathedral Action
#[derive(Debug, Clone, Serialize, Deserialize)]
pub enum B20Operation {
    /// Transfer com memo e policy check
    Transfer {
        token: Address,
        from: Address,
        to: Address,
        amount: U256,
        memo: Option<[u8; 32]>,
        policy_scope: PolicyScope,
    },
    /// Mint com supply cap check e memo
    Mint {
        token: Address,
        to: Address,
        amount: U256,
        memo: Option<[u8; 32]>,
    },
    /// Burn (caller ou blocked account)
    Burn {
        token: Address,
        from: Address,
        amount: U256,
        memo: Option<[u8; 32]>,
        burn_type: BurnType,
    },
    /// Update policy scope
    UpdatePolicy {
        token: Address,
        scope: PolicyScope,
        policy_id: u64,
    },
    /// Pause/Unpause granular
    Pause {
        token: Address,
        features: Vec<PausableFeature>,
        pause: bool,
    },
    /// Update multiplier (Asset variant)
    UpdateMultiplier {
        token: Address,
        new_multiplier: U256, // WAD precision
    },
    /// Announcement (Asset variant)
    Announce {
        token: Address,
        internal_calls: Vec<Bytes>,
        id: u64,
        description: String,
        uri: String,
    },
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub enum PolicyScope {
    TransferSender,
    TransferReceiver,
    TransferExecutor,
    MintReceiver,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub enum BurnType {
    Caller,  // burn próprio
    Blocked, // burnBlocked (freeze-and-seize)
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub enum PausableFeature {
    Transfer,
    Mint,
    Burn,
}

/// Mapeia Action do Cathedral para B20Operation
pub struct B20TokenMapper {
    ethical_filter: Arc<EthicalFilter>,
    policy_registry: Arc<PolicyRegistryClient>,
}

impl B20TokenMapper {
    pub async fn map_action(&self, action: &Action) -> Result<B20Operation, MapperError> {
        // 1. Avalia ética primeiro
        match self.ethical_filter.evaluate(action).await {
            FilterVerdict::Passed => {}
            FilterVerdict::Failed(v) => return Err(MapperError::EthicalViolation(v)),
        }

        // 2. Mapeia tipo de ação
        match action.action_type.as_str() {
            "payment_b20" => {
                let token = extract_address(action, "token")?;
                let from = extract_address(action, "from")?;
                let to = extract_address(action, "to")?;
                let amount = extract_u256(action, "amount")?;
                let memo = extract_optional_memo(action)?;

                // Verifica políticas
                let sender_policy = self
                    .policy_registry
                    .get_policy(token, PolicyScope::TransferSender)
                    .await?;

                if !self
                    .policy_registry
                    .is_authorized(sender_policy, from)
                    .await?
                {
                    return Err(MapperError::PolicyDenied("sender".to_string()));
                }

                Ok(B20Operation::Transfer {
                    token,
                    from,
                    to,
                    amount,
                    memo,
                    policy_scope: PolicyScope::TransferSender,
                })
            }
            "mint_b20" => {
                let token = extract_address(action, "token")?;
                let to = extract_address(action, "to")?;
                let amount = extract_u256(action, "amount")?;
                let memo = extract_optional_memo(action)?;

                // Verifica supply cap
                let current_supply = self.get_total_supply(token).await?;
                let cap = self.get_supply_cap(token).await?;

                if current_supply + amount > cap {
                    return Err(MapperError::SupplyCapExceeded);
                }

                Ok(B20Operation::Mint {
                    token,
                    to,
                    amount,
                    memo,
                })
            }
            "freeze_and_seize" => {
                let token = extract_address(action, "token")?;
                let target = extract_address(action, "target")?;
                let amount = extract_u256(action, "amount")?;

                // Verifica se target está em blocklist
                let sender_policy = self
                    .policy_registry
                    .get_policy(token, PolicyScope::TransferSender)
                    .await?;

                if self
                    .policy_registry
                    .is_authorized(sender_policy, target)
                    .await?
                {
                    return Err(MapperError::NotBlocked(target));
                }

                Ok(B20Operation::Burn {
                    token,
                    from: target,
                    amount,
                    memo: Some(hash_memo("freeze-and-seize", action)),
                    burn_type: BurnType::Blocked,
                })
            }
            "update_policy" => {
                let token = extract_address(action, "token")?;
                let scope = extract_policy_scope(action)?;
                let policy_id = extract_u64(action, "policy_id")?;

                Ok(B20Operation::UpdatePolicy {
                    token,
                    scope,
                    policy_id,
                })
            }
            "pause_b20" => {
                let token = extract_address(action, "token")?;
                let features = extract_pausable_features(action)?;

                Ok(B20Operation::Pause {
                    token,
                    features,
                    pause: true,
                })
            }
            "unpause_b20" => {
                let token = extract_address(action, "token")?;
                let features = extract_pausable_features(action)?;

                Ok(B20Operation::Pause {
                    token,
                    features,
                    pause: false,
                })
            }
            "update_multiplier" => {
                let token = extract_address(action, "token")?;
                let multiplier = extract_u256(action, "multiplier")?;

                Ok(B20Operation::UpdateMultiplier {
                    token,
                    new_multiplier: multiplier,
                })
            }
            _ => Err(MapperError::UnsupportedActionType(
                action.action_type.clone(),
            )),
        }
    }
}
