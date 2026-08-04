//! substrato-7001/src/mcp_polar_stdio.rs
//! Servidor MCP Polar via stdio (JSON-RPC 2.0)
//!
//! O OpenCode spawna este processo e comunica via stdin/stdout.
//! NÃO é um servidor HTTP.
//!
//! Uso (via opencode.json):
//!   "command": "cargo",
//!   "args": ["run", "--bin", "cathedral-polar-mcp", "--features", "mcp-server"]
//!
//! Selo: CATHEDRAL-ARKHE-POLAR-MCP-STDIO-v2.0.0-2026-06-19

use serde::{Deserialize, Serialize};
use serde_json::{json, Value};
use std::io::{self, BufRead, Write};
use tracing::{info, error, warn};

// ============================================================================
// 1. PROTOCOLO MCP (JSON-RPC 2.0 sobre stdio)
// ============================================================================

#[derive(Debug, Deserialize)]
struct JsonRpcRequest {
    jsonrpc: String,
    id: Option<Value>,
    method: String,
    #[serde(default)]
    params: Value,
}

#[derive(Debug, Serialize)]
struct JsonRpcResponse {
    jsonrpc: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    id: Option<Value>,
    #[serde(skip_serializing_if = "Option::is_none")]
    result: Option<Value>,
    #[serde(skip_serializing_if = "Option::is_none")]
    error: Option<JsonRpcError>,
}

#[derive(Debug, Serialize)]
struct JsonRpcError {
    code: i32,
    message: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    data: Option<Value>,
}

fn ok_response(id: Option<Value>, result: Value) -> JsonRpcResponse {
    JsonRpcResponse {
        jsonrpc: "2.0".to_string(),
        id,
        result: Some(result),
        error: None,
    }
}

fn err_response(id: Option<Value>, code: i32, message: &str) -> JsonRpcResponse {
    JsonRpcResponse {
        jsonrpc: "2.0".to_string(),
        id,
        result: None,
        error: Some(JsonRpcError {
            code,
            message: message.to_string(),
            data: None,
        }),
    }
}

// ============================================================================
// 2. CLIENTE POLAR (HTTP — endpoints corretos /v1/)
// ============================================================================

/// Cliente HTTP para a API Polar.
/// Correção v2.0.0: usa `/v1/` ao invés de `/api/v1/` (endpoint real do Polar)
struct PolarHttpClient {
    client: reqwest::Client,
    base_url: String,
    token: String,
    org_id: String,
}

impl PolarHttpClient {
    fn new() -> anyhow::Result<Self> {
        let token = std::env::var("POLAR_ACCESS_TOKEN")
            .map_err(|_| anyhow::anyhow!("POLAR_ACCESS_TOKEN não definido"))?;
        let org_id = std::env::var("POLAR_ORGANIZATION_ID")
            .map_err(|_| anyhow::anyhow!("POLAR_ORGANIZATION_ID não definido"))?;

        let client = reqwest::Client::builder()
            .timeout(std::time::Duration::from_secs(30))
            .user_agent("cathedral-arkhe-polar-mcp/2.0.0")
            .build()?;

        Ok(Self {
            client,
            base_url: std::env::var("POLAR_API_URL")
                .unwrap_or_else(|_| "https://api.polar.sh".to_string()),
            token,
            org_id,
        })
    }

    async fn post(&self, path: &str, body: &Value) -> anyhow::Result<Value> {
        let url = format!("{}{}", self.base_url.trim_end_matches('/'), path);
        let resp = self
            .client
            .post(&url)
            .bearer_auth(&self.token)
            .json(body)
            .send()
            .await?;

        let status = resp.status();
        let body: Value = resp.json().await?;

        if !status.is_success() {
            anyhow::bail!(
                "Polar API {} {}: {}",
                status.as_u16(),
                path,
                serde_json::to_string(&body).unwrap_or_default()
            );
        }
        Ok(body)
    }

    async fn get(&self, path: &str) -> anyhow::Result<Value> {
        let url = format!("{}{}", self.base_url.trim_end_matches('/'), path);
        let resp = self
            .client
            .get(&url)
            .bearer_auth(&self.token)
            .send()
            .await?;

        let status = resp.status();
        let body: Value = resp.json().await?;

        if !status.is_success() {
            anyhow::bail!("Polar API {} {}: {}", status.as_u16(), path, body);
        }
        Ok(body)
    }

    /// POST /v1/products — Cria produto
    async fn create_product(
        &self,
        name: &str,
        description: &str,
        amount: i64,
        currency: &str,
        recurring_interval: Option<&str>,
    ) -> anyhow::Result<Value> {
        let mut price = json!({
            "amount": amount,
            "currency": currency,
        });
        if let Some(interval) = recurring_interval {
            price["recurring_interval"] = json!(interval);
        }

        let body = json!({
            "name": name,
            "description": description,
            "is_recurring": recurring_interval.is_some(),
            "prices": [price],
        });

        self.post("/v1/products", &body).await
    }

    /// POST /v1/checkouts — Cria sessão de checkout
    async fn create_checkout(
        &self,
        product_id: &str,
        customer_email: Option<&str>,
        success_url: &str,
        cancel_url: &str,
    ) -> anyhow::Result<Value> {
        let mut body = json!({
            "product_id": product_id,
            "success_url": success_url,
            "cancel_url": cancel_url,
        });
        if let Some(email) = customer_email {
            body["customer_email"] = json!(email);
        }
        self.post("/v1/checkouts", &body).await
    }

    /// GET /v1/subscriptions — Lista assinaturas
    async fn list_subscriptions(
        &self,
        customer_id: Option<&str>,
        limit: u32,
    ) -> anyhow::Result<Value> {
        let mut path = format!("/v1/subscriptions?limit={}", limit);
        if let Some(cid) = customer_id {
            path.push_str(&format!("&customer_id={}", cid));
        }
        self.get(&path).await
    }

    /// GET /v1/orders — Lista pedidos
    async fn list_orders(&self, limit: u32) -> anyhow::Result<Value> {
        self.get(&format!("/v1/orders?limit={}", limit)).await
    }

    /// GET /v1/organizations/{id}/metrics — Métricas da org
    async fn get_org_metrics(&self) -> anyhow::Result<Value> {
        self.get(&format!("/v1/organizations/{}/metrics", self.org_id))
            .await
    }
}

// ============================================================================
// 3. TOOL DEFINITIONS (schema MCP)
// ============================================================================

fn tool_definitions() -> Vec<Value> {
    vec![
        json!({
            "name": "polar_create_product",
            "description": "Cria um produto digital no Polar para monetização de serviços ARKHE",
            "inputSchema": {
                "type": "object",
                "properties": {
                    "name": {
                        "type": "string",
                        "description": "Nome do produto (ex: 'Cathedral Audit Pro')"
                    },
                    "description": {
                        "type": "string",
                        "description": "Descrição do produto"
                    },
                    "amount": {
                        "type": "integer",
                        "description": "Preço em centavos (ex: 2000 = $20.00)"
                    },
                    "currency": {
                        "type": "string",
                        "description": "Moeda (padrão: usd)",
                        "default": "usd"
                    },
                    "recurring_interval": {
                        "type": "string",
                        "description": "Intervalo de recorrência: month, year, ou null para pagamento único",
                        "enum": ["month", "year", null]
                    }
                },
                "required": ["name", "amount"]
            }
        }),
        json!({
            "name": "polar_create_checkout",
            "description": "Gera um link de checkout Polar para um produto existente",
            "inputSchema": {
                "type": "object",
                "properties": {
                    "product_id": { "type": "string" },
                    "customer_email": { "type": "string" },
                    "success_url": {
                        "type": "string",
                        "default": "https://cathedral.arkhe/dashboard"
                    },
                    "cancel_url": {
                        "type": "string",
                        "default": "https://cathedral.arkhe/dashboard"
                    }
                },
                "required": ["product_id"]
            }
        }),
        json!({
            "name": "polar_list_subscriptions",
            "description": "Lista assinaturas ativas, filtrando por customer_id opcional",
            "inputSchema": {
                "type": "object",
                "properties": {
                    "customer_id": { "type": "string" },
                    "limit": { "type": "integer", "default": 100 }
                }
            }
        }),
        json!({
            "name": "polar_list_orders",
            "description": "Lista pedidos recentes com detalhes de faturamento",
            "inputSchema": {
                "type": "object",
                "properties": {
                    "limit": { "type": "integer", "default": 50 }
                }
            }
        }),
        json!({
            "name": "polar_get_metrics",
            "description": "Obtém métricas agregadas de faturamento (revenue, MRR, subscriptions)",
            "inputSchema": {
                "type": "object",
                "properties": {}
            }
        }),
        json!({
            "name": "polar_oss_distribute",
            "description": "Calcula e registra distribuição 1% OSS para contribuidores do Cathedral ARKHE",
            "inputSchema": {
                "type": "object",
                "properties": {
                    "order_amount_cents": {
                        "type": "integer",
                        "description": "Valor total do pedido em centavos"
                    },
                    "order_id": {
                        "type": "string",
                        "description": "ID do pedido no Polar"
                    },
                    "recipients": {
                        "type": "array",
                        "items": {
                            "type": "object",
                            "properties": {
                                "github_handle": { "type": "string" },
                                "share": { "type": "number", "description": "Fração (0.0-1.0)" }
                            },
                            "required": ["github_handle", "share"]
                        }
                    }
                },
                "required": ["order_amount_cents", "order_id", "recipients"]
            }
        }),
    ]
}

// ============================================================================
// 4. TOOL EXECUTION
// ============================================================================

async fn execute_tool(
    client: &PolarHttpClient,
    name: &str,
    params: &Value,
) -> Result<Value, (i32, String)> {
    match name {
        "polar_create_product" => {
            let name = params["name"].as_str()
                .ok_or((-32602, "Missing 'name'".into()))?;
            let description = params["description"].as_str().unwrap_or("");
            let amount = params["amount"].as_i64()
                .ok_or((-32602, "Missing 'amount'".into()))?;
            let currency = params["currency"].as_str().unwrap_or("usd");
            let recurring = params["recurring_interval"].as_str();

            client
                .create_product(name, description, amount, currency, recurring)
                .await
                .map_err(|e| (-32603, e.to_string()))
        }

        "polar_create_checkout" => {
            let product_id = params["product_id"].as_str()
                .ok_or((-32602, "Missing 'product_id'".into()))?;
            let email = params["customer_email"].as_str();
            let success = params["success_url"].as_str()
                .unwrap_or("https://cathedral.arkhe/dashboard");
            let cancel = params["cancel_url"].as_str()
                .unwrap_or("https://cathedral.arkhe/dashboard");

            client
                .create_checkout(product_id, email, success, cancel)
                .await
                .map_err(|e| (-32603, e.to_string()))
        }

        "polar_list_subscriptions" => {
            let customer_id = params["customer_id"].as_str();
            let limit = params["limit"].as_u64().unwrap_or(100) as u32;

            client
                .list_subscriptions(customer_id, limit)
                .await
                .map_err(|e| (-32603, e.to_string()))
        }

        "polar_list_orders" => {
            let limit = params["limit"].as_u64().unwrap_or(50) as u32;

            client
                .list_orders(limit)
                .await
                .map_err(|e| (-32603, e.to_string()))
        }

        "polar_get_metrics" => {
            client
                .get_org_metrics()
                .await
                .map_err(|e| (-32603, e.to_string()))
        }

        "polar_oss_distribute" => {
            let amount = params["order_amount_cents"].as_i64()
                .ok_or((-32602, "Missing 'order_amount_cents'".into()))?;
            let order_id = params["order_id"].as_str()
                .ok_or((-32602, "Missing 'order_id'".into()))?;
            let recipients = params["recipients"].as_array()
                .ok_or((-32602, "Missing 'recipients'".into()))?;

            let oss_total = (amount as f64 * 0.01).round() as i64;
            let total_share: f64 = recipients
                .iter()
                .filter_map(|r| r["share"].as_f64())
                .sum();

            if total_share == 0.0 {
                return Err((-32602, "Total share must be > 0".into()));
            }

            let mut distributions = Vec::new();
            for r in recipients {
                let handle = r["github_handle"].as_str().unwrap_or("unknown");
                let share = r["share"].as_f64().unwrap_or(0.0);
                let amt = ((oss_total as f64) * (share / total_share)).round() as i64;
                distributions.push(json!({
                    "github_handle": handle,
                    "amount_cents": amt,
                    "amount_usd": format!("{:.2}", amt as f64 / 100.0),
                    "share_pct": format!("{:.1}%", share * 100.0 / total_share * 100.0),
                }));
            }

            Ok(json!({
                "order_id": order_id,
                "order_amount_cents": amount,
                "oss_total_cents": oss_total,
                "oss_total_usd": format!("{:.2}", oss_total as f64 / 100.0),
                "distributions": distributions,
                "status": "calculated"
            }))
        }

        _ => Err((-32601, format!("Tool not found: {}", name))),
    }
}

// ============================================================================
// 5. LOOP PRINCIPAL (stdio)
// ============================================================================

#[tokio::main]
async fn main() -> anyhow::Result<()> {
    // Logging para stderr (não polui stdout = MCP channel)
    tracing_subscriber::fmt()
        .with_writer(io::stderr)
        .with_env_filter(
            tracing_subscriber::EnvFilter::try_from_default_env()
                .unwrap_or_else(|_| "info".into()),
        )
        .init();

    info!("cathedral-polar-mcp v2.0.0 iniciando (stdio mode)");

    let client = match PolarHttpClient::new() {
        Ok(c) => c,
        Err(e) => {
            error!("Falha ao inicializar cliente Polar: {}", e);
            std::process::exit(1);
        }
    };

    let stdin = io::stdin();
    let mut stdout = io::stdout();
    let reader = stdin.lock();

    info!("Aguardando requisições MCP via stdin...");

    for line in reader.lines() {
        let line = match line {
            Ok(l) => l,
            Err(e) => {
                error!("Erro lendo stdin: {}", e);
                break;
            }
        };

        let line = line.trim();
        if line.is_empty() {
            continue;
        }

        let req: JsonRpcRequest = match serde_json::from_str(line) {
            Ok(r) => r,
            Err(e) => {
                warn!("JSON inválido no stdin: {} — {}", e, &line[..line.len().min(200)]);
                let resp = err_response(None, -32700, &format!("Parse error: {}", e));
                let _ = writeln!(stdout, "{}", serde_json::to_string(&resp).unwrap());
                let _ = stdout.flush();
                continue;
            }
        };

        let id = req.id.clone();
        let method = req.method.clone();
        let params = req.params;

        info!("→ {} (id={:?})", method, id);

        let response = match method.as_str() {
            // MCP Protocol methods
            "initialize" => {
                ok_response(id, json!({
                    "protocolVersion": "2024-11-05",
                    "capabilities": {
                        "tools": {}
                    },
                    "serverInfo": {
                        "name": "cathedral-polar-mcp",
                        "version": "2.0.0"
                    }
                }))
            }

            "notifications/initialized" => {
                // Notification — sem resposta (JSON-RPC spec)
                continue;
            }

            "tools/list" => {
                ok_response(id, json!({ "tools": tool_definitions() }))
            }

            "tools/call" => {
                let tool_name = params["name"].as_str().unwrap_or("");
                let tool_params = &params["arguments"];

                match execute_tool(&client, tool_name, tool_params).await {
                    Ok(result) => ok_response(id, json!({
                        "content": [{ "type": "text", "text": serde_json::to_string_pretty(&result).unwrap() }]
                    })),
                    Err((code, msg)) => {
                        error!("Tool {} error: {}", tool_name, msg);
                        err_response(id, code, &msg)
                    }
                }
            }

            "ping" => ok_response(id, json!({})),

            _ => err_response(id, -32601, &format!("Method not found: {}", method)),
        };

        let output = serde_json::to_string(&response)
            .unwrap_or_else(|_| r#"{"jsonrpc":"2.0","error":{"code":-32603,"message":"Serialization error"}}"#.to_string());

        writeln!(stdout, "{}", output)?;
        stdout.flush()?;

        info!("← {} ({} bytes)", method, output.len());
    }

    info!("stdin encerrado, saindo.");
    Ok(())
}
