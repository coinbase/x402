// Dummy implementation of PearPass
pub struct PearPassAuth {}
impl PearPassAuth {
    pub fn new(_api_url: &str, _api_key: &str) -> Self { Self {} }
    pub async fn verify_proof(&self, _proof: &str) -> Result<bool, String> { Ok(true) }
}
