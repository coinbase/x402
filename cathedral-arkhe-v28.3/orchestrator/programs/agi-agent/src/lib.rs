// programs/agi-agent/src/lib.rs
//! AGI Agent Program for Solana
//! Execução rápida de ações de agentes com baixo custo

use anchor_lang::prelude::*;
// use anchor_lang::solana_program::keccak;

declare_id!("AGIAgent1111111111111111111111111111111111");

#[program]
pub mod agi_agent {
    use super::*;

    /// Inicializa o agente com identidade (ConsentTokenV3)
    pub fn initialize(ctx: Context<Initialize>, agent_id: [u8; 32], arweave_txid: [u8; 32]) -> Result<()> {
        let agent = &mut ctx.accounts.agent;
        agent.agent_id = agent_id;
        agent.arweave_txid = arweave_txid;
        agent.owner = ctx.accounts.owner.key();
        agent.is_active = true;
        agent.created_at = Clock::get()?.unix_timestamp;
        agent.last_action = 0;
        agent.action_count = 0;
        Ok(())
    }

    /// Executa uma ação (ex: transferir royalties, indexar, etc.)
    pub fn execute_action(ctx: Context<ExecuteAction>, action_type: u8, _payload: Vec<u8>) -> Result<()> {
        let agent = &mut ctx.accounts.agent;
        require!(agent.is_active, ErrorCode::AgentInactive);
        require!(ctx.accounts.owner.key() == agent.owner, ErrorCode::Unauthorized);

        // Verifica assinatura do payload (stub: usar ConsentTokenV3)
        // let token = ConsentTokenV3::from_bytes(&payload)?;
        // token.verify(...)?;

        agent.last_action = Clock::get()?.unix_timestamp;
        agent.action_count += 1;

        // Lógica específica por tipo de ação
        match action_type {
            1 => {
                // Ação: indexar embedding
                // Em produção: enviar para AO via cross-chain msg
            }
            2 => {
                // Ação: transferir royalties (USDC)
                // Em produção: usar token program
            }
            _ => return Err(ErrorCode::InvalidActionType.into()),
        }

        Ok(())
    }

    /// Atualiza identidade (vinculação a novo Arweave TX)
    pub fn update_identity(ctx: Context<UpdateIdentity>, new_arweave_txid: [u8; 32]) -> Result<()> {
        let agent = &mut ctx.accounts.agent;
        require!(ctx.accounts.owner.key() == agent.owner, ErrorCode::Unauthorized);
        agent.arweave_txid = new_arweave_txid;
        Ok(())
    }
}

// ─── Accounts ────────────────────────────────────────────────────────────

#[account]
pub struct AgentAccount {
    pub agent_id: [u8; 32],        // Hash da identidade
    pub arweave_txid: [u8; 32],    // Documento de identidade no Arweave
    pub owner: Pubkey,             // Dono do agente (Ethereum/Bitcoin)
    pub is_active: bool,
    pub created_at: i64,
    pub last_action: i64,
    pub action_count: u64,
}

#[derive(Accounts)]
pub struct Initialize<'info> {
    #[account(init, payer = owner, space = 8 + 32 + 32 + 32 + 1 + 8 + 8 + 8)]
    pub agent: Account<'info, AgentAccount>,
    #[account(mut)]
    pub owner: Signer<'info>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct ExecuteAction<'info> {
    #[account(mut)]
    pub agent: Account<'info, AgentAccount>,
    #[account(mut)]
    pub owner: Signer<'info>,
}

#[derive(Accounts)]
pub struct UpdateIdentity<'info> {
    #[account(mut)]
    pub agent: Account<'info, AgentAccount>,
    #[account(mut)]
    pub owner: Signer<'info>,
}

// ─── Errors ──────────────────────────────────────────────────────────────

#[error_code]
pub enum ErrorCode {
    #[msg("Agente está inativo")]
    AgentInactive,
    #[msg("Não autorizado")]
    Unauthorized,
    #[msg("Tipo de ação inválido")]
    InvalidActionType,
}
