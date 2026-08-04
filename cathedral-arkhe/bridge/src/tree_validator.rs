use anyhow::{anyhow, bail, Result};
use std::collections::{HashMap, HashSet};

#[derive(Debug, Clone)]
pub struct ActiveAgentTree {
    pub tree_id: String,
    pub root_agent: String,
    pub members: HashSet<String>,
    pub parent_map: HashMap<String, String>,
    pub child_map: HashMap<String, Vec<String>>,
    pub role_map: HashMap<String, String>,
    pub depth_map: HashMap<String, u32>,
}

impl ActiveAgentTree {
    pub fn new(tree_id: &str, root_agent: &str, root_role: &str) -> Self {
        let mut members = HashSet::new();
        members.insert(root_agent.to_string());
        let mut role_map = HashMap::new();
        role_map.insert(root_agent.to_string(), root_role.to_string());
        Self {
            tree_id: tree_id.to_string(),
            root_agent: root_agent.to_string(),
            members,
            parent_map: HashMap::new(),
            child_map: HashMap::new(),
            role_map,
            depth_map: HashMap::from([(root_agent.to_string(), 0)]),
        }
    }
    pub fn add_member(&mut self, agent_id: &str, parent_id: Option<&str>, role: &str) -> Result<()> {
        if self.members.contains(agent_id) { bail!("Agent exists"); }
        if let Some(parent) = parent_id {
            if !self.members.contains(parent) { bail!("Parent not found"); }
            self.parent_map.insert(agent_id.to_string(), parent.to_string());
            self.child_map.entry(parent.to_string()).or_default().push(agent_id.to_string());
        }
        self.members.insert(agent_id.to_string());
        self.role_map.insert(agent_id.to_string(), role.to_string());
        self.depth_map.insert(agent_id.to_string(), self.calculate_depth(agent_id));
        Ok(())
    }
    pub fn calculate_depth(&self, agent_id: &str) -> u32 {
        let mut depth = 0;
        let mut current = agent_id;
        while let Some(parent) = self.parent_map.get(current) {
            depth += 1;
            current = parent;
        }
        depth
    }
    pub fn get_subtree(&self, root_id: &str) -> Vec<String> {
        let mut result = Vec::new();
        if !self.members.contains(root_id) { return result; }
        result.push(root_id.to_string());
        if let Some(children) = self.child_map.get(root_id) {
            for child in children {
                result.extend(self.get_subtree(child));
            }
        }
        result
    }
}

pub struct TreeManager {
    pub trees: HashMap<String, ActiveAgentTree>,
}

impl TreeManager {
    pub fn new() -> Self { Self { trees: HashMap::new() } }
    pub fn register_tree(&mut self, tree_id: &str, root_agent: &str, root_role: &str) -> Result<()> {
        if self.trees.contains_key(tree_id) { bail!("Tree exists"); }
        self.trees.insert(tree_id.to_string(), ActiveAgentTree::new(tree_id, root_agent, root_role));
        Ok(())
    }
    pub fn get_tree_mut(&mut self, tree_id: &str) -> Option<&mut ActiveAgentTree> {
        self.trees.get_mut(tree_id)
    }
    pub fn add_agent_to_tree(&mut self, tree_id: &str, agent_id: &str, parent_id: Option<&str>, role: &str) -> Result<()> {
         let tree = self.get_tree_mut(tree_id).ok_or_else(|| anyhow!("Tree not found"))?;
         tree.add_member(agent_id, parent_id, role)
    }
    pub fn create_agent_dynamic(
        &mut self,
        tree_id: &str,
        parent_id: &str,
        agent_id: &str,
        role: &str,
        _config: &HashMap<String, String>,
        recursive: bool,
    ) -> Result<Vec<String>> {
        let tree = self.get_tree_mut(tree_id).ok_or_else(|| anyhow!("Tree not found"))?;
        if !tree.members.contains(parent_id) { bail!("Parent not found"); }
        tree.add_member(agent_id, Some(parent_id), role)?;
        let mut created = vec![agent_id.to_string()];
        if recursive {
            let worker_id = format!("{}-worker", agent_id);
            tree.add_member(&worker_id, Some(agent_id), "worker")?;
            created.push(worker_id);
            let critic_id = format!("{}-critic", agent_id);
            tree.add_member(&critic_id, Some(agent_id), "critic")?;
            created.push(critic_id);
            let validator_id = format!("{}-validator", agent_id);
            tree.add_member(&validator_id, Some(agent_id), "validator")?;
            created.push(validator_id);
        }
        Ok(created)
    }
    pub fn apply_mutation_recursively(
        &mut self,
        tree_id: &str,
        agent_id: &str,
        mutation_type: &str,
        new_role: Option<&str>,
        _new_config: Option<&HashMap<String, String>>,
        _patch: Option<&str>,
    ) -> Result<u32> {
        let tree = self.get_tree_mut(tree_id).ok_or_else(|| anyhow!("Tree not found"))?;
        let subtree = tree.get_subtree(agent_id);
        let mut affected = 0;
        for id in subtree {
            match mutation_type {
                "change_role" => { if let Some(role) = new_role { tree.role_map.insert(id.clone(), role.to_string()); affected += 1; } }
                _ => bail!("Unsupported mutation type"),
            }
        }
        Ok(affected)
    }
}
