pub struct JiraClient {}

impl JiraClient {
    pub fn new(_endpoint: &Option<String>, _token: &str) -> Self {
        Self {}
    }

    pub async fn create_issue(&self, _project_key: &str) -> anyhow::Result<()> {
        Ok(())
    }
}
