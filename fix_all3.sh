sed -i 's/pub mod fault_injection;//g' cathedral-arkhe/test-utils/src/lib.rs

# Let's fix cem-adapter
sed -i 's/let wormgraph = Arc::new(WormGraphClient::new());/let wormgraph = Arc::new(WormGraphClient::new_with_storage(Arc::new(arkhe_wormgraph::storage_file::HardenedFileStorage::new(arkhe_wormgraph::storage_file::FileStorageConfig::default()).unwrap())));/g' cathedral-arkhe/cem-adapter/src/lib.rs
# But wait, cem-adapter needs to `use arkhe_wormgraph::storage_file::HardenedFileStorage`? No, it's returning a Result, better to mock or simplify.
sed -i 's/let wormgraph = Arc::new(WormGraphClient::new());/let wormgraph = Arc::new(WormGraphClient::new_with_storage(Arc::new(arkhe_wormgraph::storage_file::HardenedFileStorage::new(arkhe_wormgraph::storage_file::FileStorageConfig::default()).await.unwrap())));/g' cathedral-arkhe/cem-adapter/src/lib.rs

# Let's fix test-utils mock_council Eq for f64
sed -i 's/Eq//g' cathedral-arkhe/test-utils/src/mock_council.rs

# Let's fix test-utils mock_council rng Send
sed -i 's/let mut rng = rand::thread_rng();//g' cathedral-arkhe/test-utils/src/mock_council.rs
sed -i 's/rng.gen_bool/rand::thread_rng().gen_bool/g' cathedral-arkhe/test-utils/src/mock_council.rs
sed -i 's/let rep = 0.6 + rand::thread_rng().gen_range(0.0..0.35);/let rep: f64 = 0.6 + rand::thread_rng().gen_range(0.0..0.35);/g' cathedral-arkhe/test-utils/src/mock_council.rs

# Add async-channel back to sail-zk-pipeline, but correctly
echo 'async-channel = "1.9.0"' >> cathedral-arkhe/sail-zk-pipeline/Cargo.toml

# We also need to fix `job_tx_ac = job_tx.clone()` type annotations in sail-zk-pipeline
sed -i 's/let (job_tx, job_rx) = async_channel::unbounded();/let (job_tx, job_rx) = async_channel::unbounded::<ZkProofJob>();/g' cathedral-arkhe/sail-zk-pipeline/src/lib.rs
