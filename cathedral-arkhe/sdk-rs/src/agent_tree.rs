use anyhow::{bail, Result};
use std::collections::HashMap;

#[derive(Debug, Clone)]
pub struct AgentTreeNode {
    pub id: String,
    pub parent_id: Option<String>,
    pub children: Vec<AgentTreeNode>,
    pub role: String,
    pub metadata: HashMap<String, String>,
}

impl AgentTreeNode {
    pub fn new(id: &str, role: &str) -> Self {
        Self { id: id.to_string(), parent_id: None, children: Vec::new(), role: role.to_string(), metadata: HashMap::new() }
    }
}

#[derive(Debug, Clone)]
pub struct AgentTree {
    pub tree_id: String,
    pub root_id: String,
    pub nodes: HashMap<String, AgentTreeNode>,
}

impl AgentTree {
    pub fn new(tree_id: &str, root_id: &str, root_role: &str) -> Self {
        let root = AgentTreeNode::new(root_id, root_role);
        let mut nodes = HashMap::new();
        nodes.insert(root_id.to_string(), root);
        Self { tree_id: tree_id.to_string(), root_id: root_id.to_string(), nodes }
    }
    pub fn add_agent(&mut self, parent_id: Option<&str>, agent_id: &str, role: &str) -> Result<()> {
        if self.nodes.contains_key(agent_id) { bail!("Agent exists"); }
        let mut node = AgentTreeNode::new(agent_id, role);
        if let Some(parent) = parent_id {
            let parent_node = self.nodes.get_mut(parent).ok_or_else(|| anyhow::anyhow!("Parent not found"))?;
            node.parent_id = Some(parent.to_string());
            parent_node.children.push(node.clone());
        }
        self.nodes.insert(agent_id.to_string(), node);
        Ok(())
    }
}
