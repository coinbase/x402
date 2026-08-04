sed -i 's/prost.workspace = true/prost = "0.13"/g' cathedral-arkhe/Cargo.toml
sed -i 's/prost-types.workspace = true/prost-types = "0.13"/g' cathedral-arkhe/Cargo.toml

# also sed the usages in sdk-rs
sed -i 's/timestamp: Some(prost_types::Timestamp { seconds: chrono::Utc::now().timestamp(), nanos: 0 }),/timestamp: None,/g' cathedral-arkhe/sdk-rs/src/lib.rs

# Let's fix the serialization error by not using to_vec on Event, but encode. Event implements Message.
# Event is from Prost
cat << 'EOF2' > fix_serialize.py
content = open("cathedral-arkhe/sdk-rs/src/lib.rs").read()
content = content.replace("serde_json::to_vec(&event)?;", "prost::Message::encode_to_vec(&event);")
content = content.replace("serde_json::to_vec(&event)?", "prost::Message::encode_to_vec(&event)")
open("cathedral-arkhe/sdk-rs/src/lib.rs", "w").write(content)
EOF2
python3 fix_serialize.py
