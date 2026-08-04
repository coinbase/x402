sed -i 's/EVENTS_ACCEPTED.inc_by(accepted as u64);/EVENTS_ACCEPTED.inc_by((accepted as u64) as f64);/g' cathedral-arkhe/bridge/src/grpc_service.rs
sed -i 's/EVENTS_REJECTED.inc_by(rejected.len() as u64);/EVENTS_REJECTED.inc_by((rejected.len() as u64) as f64);/g' cathedral-arkhe/bridge/src/grpc_service.rs

sed -i 's/req.new_config.as_ref()/Some(\&req.new_config)/g' cathedral-arkhe/bridge/src/grpc_service.rs

sed -i 's/MetaGovernanceVerdict::GovApproved/MetaGovernanceVerdict::MetaApproved/g' cathedral-arkhe/bridge/src/governance_hook.rs
sed -i 's/MetaGovernanceVerdict::GovConditional/MetaGovernanceVerdict::MetaConditional/g' cathedral-arkhe/bridge/src/governance_hook.rs
sed -i 's/MetaGovernanceVerdict::GovRejected/MetaGovernanceVerdict::MetaRejected/g' cathedral-arkhe/bridge/src/governance_hook.rs

sed -i 's/accept_compressed(tonic::codec::CompressionEncoding::Gzip)/layer(tower_http::compression::CompressionLayer::new())/g' cathedral-arkhe/bridge/src/main.rs

sed -i 's/use tracing::info;/use tracing::{info, error};/g' cathedral-arkhe/bridge/src/main.rs
