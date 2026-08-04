use std::sync::atomic::AtomicU8;
use std::time::Duration;

pub struct CircuitBreaker {
    state: AtomicU8, // 0=Closed,1=Open,2=HalfOpen
    failure_threshold: usize,
    timeout: Duration,
}

pub struct RetryPolicy {
    max_attempts: usize,
    base_delay: Duration,
    max_delay: Duration,
    backoff_factor: f64,
}

impl RetryPolicy {
    pub fn with_jitter() -> Self { Self { max_attempts: 0, base_delay: Duration::from_secs(0), max_delay: Duration::from_secs(0), backoff_factor: 0.0 } }
}

#[async_trait::async_trait]
pub trait ResilientHttpClient {
    async fn get_with_retry(&self, url: &str) -> Result<(), String>;
}
