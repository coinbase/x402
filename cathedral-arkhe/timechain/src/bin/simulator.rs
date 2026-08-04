use ::timechain::*;
use ndarray::prelude::*;
use ndarray_linalg::SVD;
use std::sync::Arc;
use tokio::sync::Mutex;
use std::time::Duration;
use tokio::time::sleep;

#[tokio::main]
async fn main() {
    println!("=== Timechain (Arkhe) — Alpha Network Simulator ===");
    let config = PlasmaConfig::new(64, 128, 20.0, 0.01);
    let field = Arc::new(Mutex::new(EvoField::harris_sheet(config)));
    let mut detector = ReconnectionDetector::new(0.005);
    let mut observer = ObserverState::new();
    let mut channel = RetroCausalChannel::new(1.0, 0.5);
    let ux = Array2::zeros((config.nx, config.ny));
    let uy = Array2::zeros((config.nx, config.ny));
    let dt = 0.001;
    let total_steps = 3000;

    for step in 0..total_steps {
        {
            let mut f = field.lock().await;
            observer.apply_to_field(&mut f);
        }
        {
            let mut f = field.lock().await;
            f.advance(dt, &ux, &uy);
        }
        let h = { let f = field.lock().await; f.helicity() };
        let handover = {
            let f = field.lock().await;
            detector.detect(&f)
        };
        if handover {
            let f = field.lock().await;
            let (u_opt, s, vt_opt) = f.omega_x.svd(true, true).unwrap();
            let shadow = Shadow::from_svd(&u_opt.unwrap(), &s, &vt_opt.unwrap(), 10);
            let echo = EchoSignal::new(shadow.strength(), h, step as u64, vec![0.0; 10]);
            channel.emit(echo);
            println!("[⛓️ Handover] Bloco {} | H={:.6}", step, h);
        }
        let echos = channel.receive(step as f64 * dt);
        for echo in echos {
            if echo.strength > 0.1 {
                let mut f = field.lock().await;
                let (u_opt, s, vt_opt) = f.omega_x.svd(true, true).unwrap();
                let shadow = Shadow::from_svd(&u_opt.unwrap(), &s, &vt_opt.unwrap(), 5);
                let healer = ShadowHealer::new(0.1);
                healer.heal(&mut f, &shadow);
                println!("[💚 Cura] Eco recebido (altura {}) | strength={:.3}", echo.origin_height, echo.strength);
            }
        }
        observer.update(dt);
        if step % 100 == 0 {
            let energy = { let f = field.lock().await; f.energy() };
            println!("t={:.3} | E={:.4} | H={:.6} | 𝒜={:.3} | Handovers={}",
                     step as f64 * dt, energy, h, observer.attachment, detector.handover_count);
        }
        sleep(Duration::from_micros(1)).await;
    }
    println!("✅ Simulação concluída. Handovers totais: {}", detector.handover_count);
}
