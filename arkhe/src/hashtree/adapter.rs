pub struct HashTreeStorage {}
impl HashTreeStorage {
    pub fn new(_path: &str) -> Result<Self, String> { Ok(Self {}) }
    pub async fn list_entries(&self, _path: &str) -> Result<Vec<String>, String> { Ok(vec![]) }
    pub async fn get_bytes(&self, _path: &str) -> Result<Vec<u8>, String> { Ok(vec![]) }
    pub async fn put_bytes(&self, _path: &str, _bytes: &[u8]) -> Result<(), String> { Ok(()) }
}
