//! src/substrato_4004/compliance_engine.rs
//! Engine de compliance que integra EthicalFilter com B20 policies

pub struct ComplianceEngine {
    ethical_filter: Arc<EthicalFilter>,
    policy_registry: Arc<PolicyRegistryClient>,
    b20_mapper: Arc<B20TokenMapper>,
    event_store: Arc<EventStore>,
}

impl ComplianceEngine {
    /// Avalia compliance completa: ética + políticas + pausa
    pub async fn evaluate_compliance(
        &self,
        action: &Action,
    ) -> Result<ComplianceVerdict, ComplianceError> {
        // 1. EthicalFilter
        let ethical = match self.ethical_filter.evaluate(action).await {
            FilterVerdict::Passed => EthicalCompliance::Passed,
            FilterVerdict::Failed(v) => EthicalCompliance::Failed(v),
        };

        // 2. Mapeia para B20Operation
        let b20_op = match self.b20_mapper.map_action(action).await {
            Ok(op) => op,
            Err(e) => return Err(ComplianceError::Mapping(e)),
        };

        // 3. Verifica policies
        let policy = self.check_policies(&b20_op).await?;

        // 4. Verifica pause state
        let pause = self.check_pause_state(&b20_op).await?;

        // 5. Verifica roles
        let role = self.check_roles(&b20_op, action).await?;

        let verdict = ComplianceVerdict {
            ethical,
            policy,
            pause,
            role,
            overall: ethical.is_passed()
                && policy.is_passed()
                && pause.is_passed()
                && role.is_passed(),
        };

        // Emite evento de compliance
        self.event_store
            .emit(OrchestratorEvent::ComplianceChecked {
                action_id: action.id.clone(),
                verdict: verdict.clone(),
                timestamp: chrono::Utc::now().timestamp(),
            })
            .await?;

        Ok(verdict)
    }

    async fn check_policies(&self, op: &B20Operation) -> Result<PolicyCompliance, ComplianceError> {
        match op {
            B20Operation::Transfer {
                token, from, to, ..
            } => {
                let sender_policy = self
                    .policy_registry
                    .get_policy(*token, PolicyScope::TransferSender)
                    .await?;
                let receiver_policy = self
                    .policy_registry
                    .get_policy(*token, PolicyScope::TransferReceiver)
                    .await?;

                let sender_ok = self
                    .policy_registry
                    .is_authorized(sender_policy, *from)
                    .await?;
                let receiver_ok = self
                    .policy_registry
                    .is_authorized(receiver_policy, *to)
                    .await?;

                if !sender_ok {
                    return Ok(PolicyCompliance::Denied(format!(
                        "sender {} blocked by policy {}",
                        from, sender_policy
                    )));
                }
                if !receiver_ok {
                    return Ok(PolicyCompliance::Denied(format!(
                        "receiver {} blocked by policy {}",
                        to, receiver_policy
                    )));
                }

                Ok(PolicyCompliance::Passed)
            }
            B20Operation::Mint { token, to, .. } => {
                let policy = self
                    .policy_registry
                    .get_policy(*token, PolicyScope::MintReceiver)
                    .await?;
                if !self.policy_registry.is_authorized(policy, *to).await? {
                    return Ok(PolicyCompliance::Denied(format!(
                        "mint receiver {} blocked",
                        to
                    )));
                }
                Ok(PolicyCompliance::Passed)
            }
            _ => Ok(PolicyCompliance::Passed),
        }
    }

    async fn check_pause_state(
        &self,
        op: &B20Operation,
    ) -> Result<PauseCompliance, ComplianceError> {
        let token = match op {
            B20Operation::Transfer { token, .. } => *token,
            B20Operation::Mint { token, .. } => *token,
            B20Operation::Burn { token, .. } => *token,
            _ => return Ok(PauseCompliance::Passed),
        };

        let b20 = IB20::new(token, self.provider.clone());
        let paused_features: u8 = b20.method("pausedFeatures", ())?.call().await?;

        let required_feature = match op {
            B20Operation::Transfer { .. } => PausableFeature::Transfer,
            B20Operation::Mint { .. } => PausableFeature::Mint,
            B20Operation::Burn { .. } => PausableFeature::Burn,
            _ => return Ok(PauseCompliance::Passed),
        };

        if paused_features & (1 << required_feature as u8) != 0 {
            return Ok(PauseCompliance::Paused(required_feature));
        }

        Ok(PauseCompliance::Passed)
    }

    async fn check_roles(
        &self,
        op: &B20Operation,
        action: &Action,
    ) -> Result<RoleCompliance, ComplianceError> {
        let required_role = match op {
            B20Operation::Mint { .. } => B20Constants::MINT_ROLE,
            B20Operation::Burn {
                burn_type: BurnType::Caller,
                ..
            } => B20Constants::BURN_ROLE,
            B20Operation::Burn {
                burn_type: BurnType::Blocked,
                ..
            } => B20Constants::BURN_BLOCKED_ROLE,
            B20Operation::Pause { pause: true, .. } => B20Constants::PAUSE_ROLE,
            B20Operation::Pause { pause: false, .. } => B20Constants::UNPAUSE_ROLE,
            B20Operation::UpdateMultiplier { .. } => B20Constants::OPERATOR_ROLE,
            _ => return Ok(RoleCompliance::Passed),
        };

        let caller = extract_address(action, "caller")?;
        let token = extract_address(action, "token")?;

        let b20 = IB20::new(token, self.provider.clone());
        let has_role: bool = b20
            .method("hasRole", (required_role, caller))?
            .call()
            .await?;

        if !has_role {
            return Ok(RoleCompliance::MissingRole(required_role));
        }

        Ok(RoleCompliance::Passed)
    }
}

#[derive(Debug, Clone)]
pub struct ComplianceVerdict {
    pub ethical: EthicalCompliance,
    pub policy: PolicyCompliance,
    pub pause: PauseCompliance,
    pub role: RoleCompliance,
    pub overall: bool,
}

#[derive(Debug, Clone)]
pub enum EthicalCompliance {
    Passed,
    Failed(Vec<LayerViolation>),
}

#[derive(Debug, Clone)]
pub enum PolicyCompliance {
    Passed,
    Denied(String),
}

#[derive(Debug, Clone)]
pub enum PauseCompliance {
    Passed,
    Paused(PausableFeature),
}

#[derive(Debug, Clone)]
pub enum RoleCompliance {
    Passed,
    MissingRole([u8; 32]),
}
