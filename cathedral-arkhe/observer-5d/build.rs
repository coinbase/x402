fn main() -> Result<(), Box<dyn std::error::Error>> {
    tonic_build::configure()
        .build_server(false)
        .build_client(true)
        .compile(&["../proto/agent/v1/agent.proto"], &["../proto/"])?;
    println!("cargo:rerun-if-changed=../proto/agent/v1/agent.proto");
    Ok(())
}
