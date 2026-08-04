pub mod mhd;
pub mod shadow;
pub mod observer;
pub mod timechain;
pub mod retro;
pub mod storage;
pub mod network;
pub mod consensus;
pub mod utxo;
pub mod accelerate;

pub use mhd::{EvoField, PlasmaConfig, ReconnectionDetector};
pub use shadow::{Shadow, ShadowHealer};
pub use observer::ObserverState;
pub use timechain::{TimeBlock, ChernSimonsOracle, ChernSimonsMiner, ShadowHash};
pub use retro::{EchoSignal, RetroCausalChannel};
pub use storage::{ShadowStore, ShadowSnapshot};

pub const CHERN_SIMONS_KAPPA: f64 = 1.0;
pub const DEFAULT_VALIDATION_TOLERANCE: f64 = 1e-3;
