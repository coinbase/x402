use tokio::net::UdpSocket;
use tokio::time::{sleep, Duration};
use std::collections::HashMap;
use std::net::SocketAddr;
use serde::{Serialize, Deserialize};
use crate::retro::EchoSignal;
use crate::timechain::TimeBlock;
use crate::mhd::{PlasmaConfig, EvoField};
use num_complex::Complex;
use rustfft::{FftPlanner, num_traits::Zero};
use std::sync::Arc;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub enum NetworkMessage {
    Heartbeat { node_id: u64, field_hash: [u8; 32], phase_time: f64 },
    Echo { echo: EchoSignal, block: TimeBlock },
    BlockRequest { height: u64 },
}

pub struct PeerInfo {
    pub node_id: u64,
    pub last_seen: f64,
}

impl PeerInfo {
    pub fn new(node_id: u64) -> Self {
        Self {
            node_id,
            last_seen: 0.0,
        }
    }
}

pub struct P2PNode {
    pub socket: Arc<UdpSocket>,
    pub node_id: u64,
    pub peers: HashMap<SocketAddr, PeerInfo>,
    pub config: PlasmaConfig,
    pub field: EvoField,
}

impl P2PNode {
    pub async fn new(addr: SocketAddr, config: PlasmaConfig) -> Self {
        let socket = UdpSocket::bind(addr).await.unwrap();
        let node_id = rand::random();
        let field = EvoField::random_harris(config);
        Self { socket: Arc::new(socket), node_id, peers: HashMap::new(), config, field }
    }

    pub async fn broadcast_echo(&mut self, echo: EchoSignal, block: TimeBlock) {
        let mut planner = FftPlanner::new();
        let fft = planner.plan_fft_forward(echo.pattern.len());

        let mut buffer: Vec<Complex<f64>> = echo.pattern.iter().map(|&x| Complex::new(x, 0.0)).collect();
        fft.process(&mut buffer);

        let mut max_amp = 0.0;
        let mut k_dominant = 1.0;
        for (i, c) in buffer.iter().enumerate() {
            let amp = c.norm();
            if amp > max_amp {
                max_amp = amp;
                k_dominant = (i + 1) as f64;
            }
        }

        let packet = NetworkMessage::Echo { echo, block };
        let serialized = bincode::serialize(&packet).unwrap();

        for (peer_addr, _info) in self.peers.iter() {
            let delay = 1.0 / (k_dominant.powf(1.0 / 3.0));
            let socket = Arc::clone(&self.socket);
            let data = serialized.clone();
            let target = *peer_addr;
            tokio::spawn(async move {
                sleep(Duration::from_secs_f64(delay * 0.1)).await;
                let _ = socket.send_to(&data, target).await;
            });
        }
    }

    pub async fn run(&mut self) {
        let mut buf = [0u8; 65536];
        loop {
            if let Ok((len, src)) = self.socket.recv_from(&mut buf).await {
                if let Ok(packet) = bincode::deserialize::<NetworkMessage>(&buf[..len]) {
                    self.handle_message(packet, src).await;
                }
            }
        }
    }

    async fn handle_message(&mut self, msg: NetworkMessage, src: SocketAddr) {
        match msg {
            NetworkMessage::Echo { echo, block } => {
                self.process_echo(echo, block).await;
            }
            NetworkMessage::Heartbeat { node_id, .. } => {
                self.peers.entry(src).or_insert_with(|| PeerInfo::new(node_id));
            }
            _ => {}
        }
    }

    async fn process_echo(&mut self, _echo: EchoSignal, _block: TimeBlock) {
        // Implementation for processing echo and reaching finality
    }
}
