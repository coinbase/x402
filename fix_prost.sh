sed -i 's/pub struct MetaGovernanceResponse {/#[derive(Clone, PartialEq, ::prost::Message)]\npub struct MetaGovernanceResponse {/g' cathedral-arkhe/proto/cathedral/v1/bridge.proto # Wait, prost macros are added by tonic-build.
# Let's inspect cathedral-arkhe/wormgraph/src/lib.rs

# Let's see what's the issue with MetaGovernanceResponse
# Oh, it might be due to `MetaGovernanceVerdict` not deriving some things?
# Let's look at the actual error for MetaGovernanceResponse. It says "the trait `prost::message::Message` is not implemented for `MetaGovernanceResponse`"
