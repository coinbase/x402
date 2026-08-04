// Dummy implementation of TensorZkpClient
pub struct TensorZkpClient {}
impl TensorZkpClient {
    pub fn new(_model_path: &str) -> Result<Self, String> { Ok(Self {}) }
    pub async fn verify_payment_proof(&self, _proof: &str, _public: &str) -> Result<bool, String> { Ok(true) }
}
