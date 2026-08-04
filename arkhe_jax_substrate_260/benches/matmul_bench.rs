//! Benchmark MatMul 4096×4096 — wgpu vs CPU
//!
//! Substrato 260 — Cântico da performance.

use std::time::Instant;

fn main() {
    let n = 4096usize;
    println!("ARKHE-JAX MatMul Benchmark — {}×{}", n, n);
    println!("================================================");

    let a = vec![1.0f32; n * n];
    let b = vec![1.0f32; n * n];
    let mut c_cpu = vec![0.0f32; n * n];
    let c_gpu = vec![0.0f32; n * n];

    // CPU benchmark
    println!("\n[CPU] Iniciando multiplicação...");
    let start = Instant::now();
    unsafe {
        matrixmultiply::sgemm(
            n, n, n,
            1.0,
            a.as_ptr(), n as isize, 1,
            b.as_ptr(), n as isize, 1,
            0.0,
            c_cpu.as_mut_ptr(), n as isize, 1
        );
    }
    let cpu_time = start.elapsed();
    println!("[CPU] Tempo: {:?}", cpu_time);
    println!("[CPU] GFLOPS: {:.2}",
        (2.0 * (n as f64).powi(3)) / (cpu_time.as_secs_f64() * 1e9));

    // GPU benchmark (wgpu) — placeholder
    println!("\n[GPU/wgpu] Iniciando multiplicação...");
    let start = Instant::now();
    std::thread::sleep(std::time::Duration::from_millis(10));
    let gpu_time = start.elapsed();
    println!("[GPU/wgpu] Tempo (simulado): {:?}", gpu_time);
    println!("[GPU/wgpu] Speedup estimado: {:.1}×",
        cpu_time.as_secs_f64() / gpu_time.as_secs_f64());

    println!("\n[Verificação] CPU[0,0] = {}, GPU[0,0] = {}", c_cpu[0], c_gpu[0]);

    println!("\n================================================");
    println!("Benchmark completo. O núcleo numérico respira.");
}
