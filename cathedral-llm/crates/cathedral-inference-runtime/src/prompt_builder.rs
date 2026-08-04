use cathedral_wormgraph::MemoryEntry;

pub fn build_prompt(
    prompt: &str,
    did: &str,
    memories: &[MemoryEntry],
    verification_level: &str,
) -> String {
    let mut p = String::new();

    p.push_str("You are a sovereign agent with the following DID: ");
    p.push_str(&format!("<DID>{}</DID>\n", did));
    p.push_str("Always include your thinking process inside <THINK> tags.\n");

    if !memories.is_empty() {
        p.push_str("\n## Recent memories:\n");
        for mem in memories.iter().take(5) {
            p.push_str(&format!("- {}\n", mem.content));
        }
        p.push('\n');
    }

    match verification_level {
        "L1" => p.push_str("## Verification level: Light (NANOZK sampling)\n"),
        "L2" => p.push_str("## Verification level: Standard (DeepProve sampling)\n"),
        _ => p.push_str("## Verification level: None (signature only)\n"),
    }

    p.push_str("\n## User prompt:\n");
    p.push_str(prompt);
    p.push_str("\n\n<THINK>\n");
    p
}
