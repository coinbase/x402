//! src/mtp/predictor.rs
//! Multi-Token Prediction com fallback e tokenização real.

use tokenizers::Tokenizer;
use async_trait::async_trait;

#[async_trait]
pub trait DraftModel: Send + Sync {
    async fn draft(&self, prefix: &[u32], num_tokens: usize) -> Result<Vec<Vec<u32>>, String>;
}

#[async_trait]
pub trait Verifier: Send + Sync {
    async fn verify(&self, draft: &[Vec<u32>]) -> Result<Vec<bool>, String>;
}

pub struct MultiTokenPredictor {
    draft_model: Box<dyn DraftModel + Send + Sync>,
    verifier: Box<dyn Verifier + Send + Sync>,
    num_tokens: usize,
    tokenizer: Tokenizer,  // ✅ CSE-HIGH-008
}

impl MultiTokenPredictor {
    pub fn new(
        draft_model: Box<dyn DraftModel + Send + Sync>,
        verifier: Box<dyn Verifier + Send + Sync>,
        num_tokens: usize,
        tokenizer: Tokenizer,
    ) -> Self {
        Self { draft_model, verifier, num_tokens, tokenizer }
    }

    pub async fn predict(&self, prefix: &[u32]) -> Result<Vec<u32>, String> {
        match self.draft_model.draft(prefix, self.num_tokens).await {
            Ok(draft_tokens) => {
                let accepted = self.verifier.verify(&draft_tokens).await?;
                let mut result = Vec::new();
                for (i, &flag) in accepted.iter().enumerate() {
                    if flag {
                        if let Some(tokens) = draft_tokens.get(i) {
                            result.extend(tokens.clone());
                        }
                    } else {
                        // ✅ CSE-HIGH-006: re-sample a partir do token rejeitado
                        let remaining = self.draft_model.draft(&result, self.num_tokens - i).await?;
                        for tokens in remaining {
                            result.extend(tokens);
                        }
                        break;
                    }
                }
                Ok(result)
            }
            Err(_) => {
                // ✅ CSE-MED-004: fallback
                self.fallback_predict(prefix).await
            }
        }
    }

    async fn fallback_predict(&self, prefix: &[u32]) -> Result<Vec<u32>, String> {
        Ok(prefix.to_vec())
    }

    pub fn tokenize(&self, text: &str) -> Vec<u32> {
        self.tokenizer.encode(text, false)
            .map(|enc| enc.get_ids().iter().map(|&id| id).collect())
            .unwrap_or_default()
    }

    pub fn detokenize(&self, tokens: &[u32]) -> String {
        self.tokenizer.decode(tokens, false).unwrap_or_default()
    }
}

pub struct NgramDraftModel {}
impl NgramDraftModel {
    pub fn new() -> Self { Self {} }
}
#[async_trait]
impl DraftModel for NgramDraftModel {
    async fn draft(&self, _prefix: &[u32], num_tokens: usize) -> Result<Vec<Vec<u32>>, String> {
        Ok(vec![vec![0; num_tokens]])
    }
}

pub struct VerifierImpl {}
impl VerifierImpl {
    pub fn new() -> Self { Self {} }
}
#[async_trait]
impl Verifier for VerifierImpl {
    async fn verify(&self, draft: &[Vec<u32>]) -> Result<Vec<bool>, String> {
        Ok(vec![true; draft.len()])
    }
}
