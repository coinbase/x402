// contracts/agi-registry/src/lib.rs
//! CosmWasm contract for AGI agent registry via IBC

use cosmwasm_std::{
    entry_point, to_binary, Binary, Deps, DepsMut, Env, MessageInfo, Response, StdResult,
};
use cw_storage_plus::Map;
use schemars::JsonSchema;
use serde::{Deserialize, Serialize};

#[derive(Serialize, Deserialize, Clone, Debug, PartialEq, JsonSchema)]
pub struct AgentRecord {
    pub agent_id: String,        // hash da identidade
    pub arweave_txid: String,
    pub public_key: String,      // Ed25519 pubkey
    pub owner: String,           // bech32 address
    pub active: bool,
    pub last_updated: u64,
}

#[derive(Serialize, Deserialize, Clone, Debug, PartialEq, JsonSchema)]
pub struct InstantiateMsg {
    pub admin: String,
}

#[derive(Serialize, Deserialize, Clone, Debug, PartialEq, JsonSchema)]
#[serde(rename_all = "snake_case")]
pub enum ExecuteMsg {
    Register {
        agent_id: String,
        arweave_txid: String,
        public_key: String,
    },
    Update {
        agent_id: String,
        arweave_txid: String,
    },
    Deactivate {
        agent_id: String,
    },
}

#[derive(Serialize, Deserialize, Clone, Debug, PartialEq, JsonSchema)]
#[serde(rename_all = "snake_case")]
pub enum QueryMsg {
    GetAgent { agent_id: String },
    ListAgents { start_after: Option<String>, limit: Option<u32> },
}

pub const AGENTS: Map<&str, AgentRecord> = Map::new("agents");

#[entry_point]
pub fn instantiate(
    _deps: DepsMut,
    _env: Env,
    _info: MessageInfo,
    msg: InstantiateMsg,
) -> StdResult<Response> {
    // Inicializa admin
    Ok(Response::new().add_attribute("admin", msg.admin))
}

#[entry_point]
pub fn execute(deps: DepsMut, env: Env, info: MessageInfo, msg: ExecuteMsg) -> StdResult<Response> {
    match msg {
        ExecuteMsg::Register { agent_id, arweave_txid, public_key } => {
            let record = AgentRecord {
                agent_id: agent_id.clone(),
                arweave_txid,
                public_key,
                owner: info.sender.to_string(),
                active: true,
                last_updated: env.block.time.seconds(),
            };
            AGENTS.save(deps.storage, &agent_id, &record)?;
            Ok(Response::new().add_attribute("action", "register"))
        }
        ExecuteMsg::Update { agent_id, arweave_txid } => {
            let mut record = AGENTS.load(deps.storage, &agent_id)?;
            if record.owner != info.sender.to_string() {
                return Err(cosmwasm_std::StdError::generic_err("Unauthorized"));
            }
            record.arweave_txid = arweave_txid;
            record.last_updated = env.block.time.seconds();
            AGENTS.save(deps.storage, &agent_id, &record)?;
            Ok(Response::new().add_attribute("action", "update"))
        }
        ExecuteMsg::Deactivate { agent_id } => {
            let mut record = AGENTS.load(deps.storage, &agent_id)?;
            if record.owner != info.sender.to_string() {
                return Err(cosmwasm_std::StdError::generic_err("Unauthorized"));
            }
            record.active = false;
            AGENTS.save(deps.storage, &agent_id, &record)?;
            Ok(Response::new().add_attribute("action", "deactivate"))
        }
    }
}

#[entry_point]
pub fn query(deps: Deps, _env: Env, msg: QueryMsg) -> StdResult<Binary> {
    match msg {
        QueryMsg::GetAgent { agent_id } => {
            let agent = AGENTS.load(deps.storage, &agent_id)?;
            to_binary(&agent)
        }
        QueryMsg::ListAgents { start_after, limit } => {
            let start = start_after.as_deref();
            let agents: Vec<AgentRecord> = AGENTS
                .range(deps.storage, start, None, cosmwasm_std::Order::Ascending)
                .take(limit.unwrap_or(20) as usize)
                .map(|item| item.unwrap().1)
                .collect();
            to_binary(&agents)
        }
    }
}
