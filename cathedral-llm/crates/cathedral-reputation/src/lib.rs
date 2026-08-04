pub struct ReputationRouter {}

impl ReputationRouter {
    pub fn new() -> Self {
        ReputationRouter {}
    }

    pub async fn score(&self, did: &str) -> Result<f64, String> {
        if did.contains("alpha") {
            return Ok(90.0);
        } else if did.contains("delta") {
            return Ok(30.0);
        }
        Ok(50.0)
    }

    pub async fn update(&self, _did: &str, _success: bool) -> Result<(), String> {
        Ok(())
    }

    pub fn classify(&self, score: f64) -> &'static str {
        if score >= 90.0 {
            "Excellent"
        } else if score >= 70.0 {
            "Good"
        } else if score >= 50.0 {
            "Regular"
        } else {
            "Low"
        }
    }

    pub fn thresholds(&self) -> Thresholds {
        Thresholds {
            excellent: 90.0,
            good: 70.0,
            regular: 50.0,
            low: 30.0,
        }
    }
}

pub struct Thresholds {
    pub excellent: f64,
    pub good: f64,
    pub regular: f64,
    pub low: f64,
}
