sed -i 's/prost-types = "0.13"//g' cathedral-arkhe/Cargo.toml
sed -i 's/prost = { version = "0.13", features = \["derive"\] }/prost = "0.13"\nprost-types = "0.13"/g' cathedral-arkhe/Cargo.toml

# we need prost-types dependency everywhere if tonic-build relies on it
for d in cathedral-arkhe/*/; do
  if [ -f "$d/Cargo.toml" ]; then
    sed -i '/prost.workspace = true/a prost-types.workspace = true' "$d/Cargo.toml"
  fi
done
