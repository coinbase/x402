use crate::auth::WalletAuth;
use crate::facilitator::http::RequestHook;
use http::header::{ACCEPT, AUTHORIZATION};

pub struct CoinbaseRequestHook {
    pub wallet_auth: WalletAuth,
}

#[async_trait::async_trait]
impl RequestHook for CoinbaseRequestHook {
    async fn on_request(
        &self,
        method: http::Method,
        url: &reqwest::Url,
        builder: reqwest::RequestBuilder,
    ) -> reqwest::RequestBuilder {
        // Coinbase JWT is bound to "METHOD host path"
        let method_str = method.as_str();
        let host = url.host_str().unwrap_or("api.cdp.coinbase.com");
        let path = url.path();

        let jwt = self.wallet_auth.generate_jwt(
            method_str,
            host,
            path,
            120
        ).expect("Generating JWT failed");

        builder
            .header(AUTHORIZATION, format!("Bearer {}", jwt))
            .header(ACCEPT, "application/json")
    }
}