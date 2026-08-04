sed -i 's/APPROVED = 1;/GOV_APPROVED = 1;/g' proto/cathedral/v1/bridge.proto
sed -i 's/REJECTED = 2;/GOV_REJECTED = 2;/g' proto/cathedral/v1/bridge.proto
sed -i 's/CONDITIONAL = 4;/GOV_CONDITIONAL = 4;/g' proto/cathedral/v1/bridge.proto

sed -i 's/APPROVED = 1;/META_APPROVED = 1;/g' proto/cathedral/v1/bridge.proto
sed -i 's/REJECTED = 2;/META_REJECTED = 2;/g' proto/cathedral/v1/bridge.proto
sed -i 's/CONDITIONAL = 4;/META_CONDITIONAL = 4;/g' proto/cathedral/v1/bridge.proto

sed -i 's/GovernanceVerdict::Approved/GovernanceVerdict::GovApproved/g' bridge/src/governance_hook.rs
sed -i 's/GovernanceVerdict::Conditional/GovernanceVerdict::GovConditional/g' bridge/src/governance_hook.rs
sed -i 's/GovernanceVerdict::Rejected/GovernanceVerdict::GovRejected/g' bridge/src/governance_hook.rs

sed -i 's/MetaGovernanceVerdict::Approved/MetaGovernanceVerdict::MetaApproved/g' bridge/src/governance_hook.rs
sed -i 's/MetaGovernanceVerdict::Conditional/MetaGovernanceVerdict::MetaConditional/g' bridge/src/governance_hook.rs
sed -i 's/MetaGovernanceVerdict::Rejected/MetaGovernanceVerdict::MetaRejected/g' bridge/src/governance_hook.rs
