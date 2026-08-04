fn main() -> Result<(), Box<dyn std::error::Error>> {
    tonic_build::configure()
        .build_server(false)
        .build_client(true)
        .compile(&["../proto/cathedral/v1/bridge.proto"], &["../proto/"])?;
    println!("cargo:rerun-if-changed=../proto/cathedral/v1/bridge.proto");
    Ok(())
}
