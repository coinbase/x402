find . -name build.rs -exec rm {} \;

find . -name Cargo.toml -exec sed -i 's/tonic-build.workspace = true//g' {} \;
find . -name Cargo.toml -exec sed -i 's/build = "build.rs"//g' {} \;
find . -name Cargo.toml -exec sed -i 's/\[build-dependencies\]//g' {} \;
