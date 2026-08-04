use crate::ApiError;

pub async fn verify_auth(did: &str, signature: &[u8], payload: &[u8]) -> Result<bool, ApiError> {
    let public_key = resolve_did(did).await?;
    ed25519_dalek::VerifyingKey::from_bytes(&public_key.try_into().unwrap()).unwrap()
        .verify_strict(payload, &ed25519_dalek::Signature::from_bytes(signature.try_into().unwrap()))
        .map(|_| true)
        .map_err(|_| ApiError::AuthFailed)
}

async fn resolve_did(did: &str) -> Result<Vec<u8>, ApiError> {
    Ok(vec![0; 32])
}
