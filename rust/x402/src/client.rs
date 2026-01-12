use reqwest::{Client, RequestBuilder, Response, StatusCode};
use serde_json::json;
use crate::errors::{X402Error, X402Result};
use crate::schemes::evm::sign_transfer_with_authorization;
use crate::types::{AuthorizationV1, PayloadExactV1, PaymentPayload, PaymentPayloadV1, PaymentPayloadV2, PaymentRequired, PaymentRequirements, X402Header};
use alloy::signers::Signer;

pub struct X402Client {
    pub client: Client,
}

impl X402Client {
    pub fn new() -> Self {
        Self {
            client: Client::new()
        }
    }

    pub fn with_client(client: Client) -> Self {
        Self { client }
    }

    pub async fn execute<B, H, FutH> (
        &self,
        mut build_req: B,
        challenge_handler: H,
    ) -> X402Result<Response>
    where
        B: FnMut() -> RequestBuilder,
        H: Fn(PaymentRequired) -> FutH,
        FutH: Future<Output = X402Result<PaymentPayload>>,
    {
        // Make the first attempt with no payment
        let response = build_req().send().await?;

        // Handle x402 challenge
        if response.status() == StatusCode::PAYMENT_REQUIRED {
            if let Some(header) = response.headers().get("PAYMENT-REQUIRED") {
                let header_str = header.to_str()
                    .map_err(|e| X402Error::InvalidHeader(e.to_string()))?;
                let challenge = PaymentRequired::from_header(header_str)?;

                // Use signer to solve the challenge
                let payload = challenge_handler(challenge).await?;
                let signature_header = payload.to_header()?;

                // Retry with payment
                return Ok(build_req()
                    .header("PAYMENT-SIGNATURE", signature_header)
                    .send()
                    .await?);
            }
        }
        Ok(response)
    }

    pub async fn execute_with_evm_exact_v2<B, S>(
        &self,
        mut build_req: B,
        signer: S,
    ) -> X402Result<Response>
    where
        B: FnMut() -> RequestBuilder,
        S: Signer + Send + Sync + Clone,
    {
        let challenge_handler = move |challenge: PaymentRequired| {
            let wallet_signer = signer.clone();
            async move {
                evm_exact_build_payload(&wallet_signer, &challenge).await
            }
        };
        self.execute(build_req, challenge_handler).await
    }
}

pub async fn evm_exact_build_payload<S>(
    signer: &S,
    challenge: &PaymentRequired,
) -> X402Result<PaymentPayload>
where
    S: Signer + Send + Sync,
{
    let wallet_address = signer.address();

    let accepted = challenge
        .accepts
        .iter()
        .find_map(|req| match req {
            PaymentRequirements::V2(v2) => Some(PaymentRequirements::V2(v2.clone())),
            PaymentRequirements::V1(v1) => Some(PaymentRequirements::V1(v1.clone())),
        })
        .ok_or_else(|| {
            X402Error::ConfigError("no V1 or V2 payment requirements found in challenge".into())
        })?;

    match &accepted {
        PaymentRequirements::V2(payment_requirements) => {
            let (signature_hex, auth) = sign_transfer_with_authorization(
                signer,
                &wallet_address.to_string(),
                &accepted,
                payment_requirements.u64_network()?,
                None
            ).await.expect("sign_transfer_with_authorization failed");

            let authorization_json = json!({
               "from": wallet_address,
               "to": payment_requirements.pay_to,
               "value": payment_requirements.amount,
               "validAfter": auth.validAfter.to_string(),
               "validBefore": auth.validBefore.to_string(),
               "nonce": format!("0x{}", hex::encode(auth.nonce.as_slice())),
            });

            let evm_payload = json!({
                "signature": signature_hex,
                "authorization": authorization_json,
            });

            let payload = PaymentPayloadV2 {
                x402_version: challenge.x402_version,
                resource: challenge.resource.clone(),
                accepted: PaymentRequirements::V2(payment_requirements.clone()),
                payload: evm_payload,
                extensions: challenge.extensions.clone(),
            };
            Ok(PaymentPayload::V2(payload))
        },
        PaymentRequirements::V1(payment_requirements) => {
            let (signature_hex, auth) = sign_transfer_with_authorization(
                signer,
                &wallet_address.to_string(),
                &accepted,
                payment_requirements.u64_network()?,
                None
            ).await.expect("sign_transfer_with_authorization failed");

            let exact_payment_payload = PayloadExactV1 {
                signature: signature_hex,
                authorization: AuthorizationV1 {
                    from: wallet_address.to_string(),
                    to: payment_requirements.pay_to.clone(),
                    value: payment_requirements.max_amount_required.to_string(),
                    valid_after: auth.validAfter.to_string(),
                    valid_before: auth.validBefore.to_string(),
                    nonce: format!("0x{}", hex::encode(auth.nonce.as_slice())),
                },
            };
            let payload = PaymentPayloadV1 {
                x402_version: 1,
                scheme: payment_requirements.scheme.clone(),
                network: payment_requirements.network.clone(),
                payload: exact_payment_payload,
            };

            Ok(PaymentPayload::V1(payload))
        }
    }
}
