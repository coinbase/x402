# Fix prost compilation issues
sed -i 's/prost.workspace = true/prost = "0.13"\nprost-types = "0.13"/g' sdk-rs/Cargo.toml

# we need prost implementation on everything, so I'll create a script to remove the manually created protobuf code and use prost-build
