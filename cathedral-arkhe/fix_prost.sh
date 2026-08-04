sed -i 's/prost = "0.13"/prost = { version = "0.13", features = ["derive"] }/g' Cargo.toml
