sed -i 's/APPROVED = 1;/GOV_APPROVED = 1;/g' cathedral-arkhe/proto/cathedral/v1/bridge.proto
sed -i 's/REJECTED = 2;/GOV_REJECTED = 2;/g' cathedral-arkhe/proto/cathedral/v1/bridge.proto
sed -i 's/CONDITIONAL = 4;/GOV_CONDITIONAL = 4;/g' cathedral-arkhe/proto/cathedral/v1/bridge.proto

sed -i 's/APPROVED = 1;/META_APPROVED = 1;/g' cathedral-arkhe/proto/cathedral/v1/bridge.proto
sed -i 's/REJECTED = 2;/META_REJECTED = 2;/g' cathedral-arkhe/proto/cathedral/v1/bridge.proto
sed -i 's/CONDITIONAL = 4;/META_CONDITIONAL = 4;/g' cathedral-arkhe/proto/cathedral/v1/bridge.proto

sed -i 's/GovernanceVerdict::Approved/GovernanceVerdict::GovApproved/g' cathedral-arkhe/bridge/src/governance_hook.rs
sed -i 's/GovernanceVerdict::Conditional/GovernanceVerdict::GovConditional/g' cathedral-arkhe/bridge/src/governance_hook.rs
sed -i 's/GovernanceVerdict::Rejected/GovernanceVerdict::GovRejected/g' cathedral-arkhe/bridge/src/governance_hook.rs

sed -i 's/MetaGovernanceVerdict::Approved/MetaGovernanceVerdict::MetaApproved/g' cathedral-arkhe/bridge/src/governance_hook.rs
sed -i 's/MetaGovernanceVerdict::Conditional/MetaGovernanceVerdict::MetaConditional/g' cathedral-arkhe/bridge/src/governance_hook.rs
sed -i 's/MetaGovernanceVerdict::Rejected/MetaGovernanceVerdict::MetaRejected/g' cathedral-arkhe/bridge/src/governance_hook.rs
