pub mod agents {
    pub mod llama_zip_agent;
}
pub mod agent_loop {
    pub struct AgentResult {
        pub final_answer: String,
        pub steps_taken: u32,
        pub tools_used: Vec<String>,
        pub latency_secs: f64,
        pub memory_consolidated: bool,
    }
    pub enum AgentError {
        ToolError(String),
    }
    impl From<String> for AgentError {
        fn from(s: String) -> Self {
            AgentError::ToolError(s)
        }
    }
    #[async_trait::async_trait]
    pub trait CathedralAgent {
        async fn run(&mut self, goal: &str) -> Result<AgentResult, AgentError>;
        fn id(&self) -> crate::orchestrator::AgentId;
    }
}
pub mod orchestrator {
    #[derive(Debug, Clone)]
    pub struct AgentId(String);
}

pub mod integrations {
    pub mod across {
        pub mod bridge;
    }
    pub mod asichain {
        pub mod agent;
    }
    pub mod bitcoin {
        pub mod cittamarket;
    }
    pub mod cosmos {
        pub mod ibc;
    }
    pub mod ethereum {
        pub mod identity;
    }
    pub mod oracles;
    pub mod solana {
        pub mod client;
    }
}
pub mod multi_chain {
    pub mod agent;
    pub mod executor;
}
pub mod substrato_4004;
pub mod substrato_8000;
