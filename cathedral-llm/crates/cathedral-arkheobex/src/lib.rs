pub struct ArkheObject {}

impl ArkheObject {
    pub fn new(_output: String, _did: &str) -> Self {
        ArkheObject {}
    }

    pub fn get_header(&self, _header_type: HeaderType) -> Option<&[u8]> {
        Some(&[0xF8, 0, 1, 2])
    }
}

pub enum HeaderType {
    PqcAttestation,
}
