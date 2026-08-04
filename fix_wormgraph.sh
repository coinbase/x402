sed -i 's/tonic = { workspace = true }//g' cathedral-arkhe/wormgraph/Cargo.toml
echo 'tonic.workspace = true' >> cathedral-arkhe/wormgraph/Cargo.toml
echo 'tonic-build.workspace = true' >> cathedral-arkhe/wormgraph/Cargo.toml

cat << 'EOF2' > cathedral-arkhe/wormgraph/build.rs
fn main() -> Result<(), Box<dyn std::error::Error>> {
    tonic_build::configure()
        .build_server(false)
        .build_client(true)
        .compile(&["../proto/cathedral/v1/bridge.proto"], &["../proto/"])?;
    println!("cargo:rerun-if-changed=../proto/cathedral/v1/bridge.proto");
    Ok(())
}
EOF2

sed -i 's/zk_pipeline: std::sync::Arc<arkhe_zk_circuits::ZkPipeline>,//g' cathedral-arkhe/wormgraph/src/reputation.rs
