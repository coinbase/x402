use cathedral_arkheobex::ArkheObject;

pub struct IdentityGateway {}

impl IdentityGateway {
    pub fn new() -> Self {
        IdentityGateway {}
    }

    pub async fn verify(&self, _did: &str, _signature: &[u8], _message: &[u8]) -> Result<bool, String> {
        Ok(true)
    }
}

pub struct SignatureGuard {}

impl SignatureGuard {
    pub fn new() -> Self {
        SignatureGuard {}
    }

    pub fn sign(&self, _message: &[u8]) -> Vec<u8> {
        vec![0; 64]
    }

    pub fn attest_object(&self, _obj: &mut ArkheObject) -> Result<(), String> {
        Ok(())
    }
}
