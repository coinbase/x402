use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub enum ComponentType {
    Manuscript,
    Dataset,
    Code,
    Model,
    Pipeline,
    Figure,
    Supplementary,
    Custom(String),
    Software,
    Library,
    SmartContract,
    ApiSpec,
    Benchmark,
    Audio,
    Video,
    GenerativeArt,
    ThreeDModel,
    Prompt,
    PhysicalArtMap,
}

impl std::fmt::Display for ComponentType {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            Self::Manuscript => write!(f, "manuscript"),
            Self::Dataset => write!(f, "dataset"),
            Self::Code => write!(f, "code"),
            Self::Model => write!(f, "model"),
            Self::Pipeline => write!(f, "pipeline"),
            Self::Figure => write!(f, "figure"),
            Self::Supplementary => write!(f, "supplementary"),
            Self::Custom(s) => write!(f, "{}", s),
            Self::Software => write!(f, "software"),
            Self::Library => write!(f, "library"),
            Self::SmartContract => write!(f, "smart-contract"),
            Self::ApiSpec => write!(f, "api-spec"),
            Self::Benchmark => write!(f, "benchmark"),
            Self::Audio => write!(f, "audio"),
            Self::Video => write!(f, "video"),
            Self::GenerativeArt => write!(f, "generative-art"),
            Self::ThreeDModel => write!(f, "3d-model"),
            Self::Prompt => write!(f, "prompt"),
            Self::PhysicalArtMap => write!(f, "physical-art-map"),
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct RoyaltyConfig {
    pub enabled: bool,
    pub price_per_access: String,
    pub currency: String,
    pub chain: String,
    pub royalty_split: Vec<RoyaltySplit>,
    pub free_tier: Option<FreeTier>,
    pub picnic_basket: Option<String>,
    pub created_at: u64,
    pub updated_at: u64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct RoyaltySplit {
    pub npub: String,
    pub share: f32,
    pub orcid: Option<String>,
    pub eth_address: Option<String>,
    pub pix_key: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct FreeTier {
    pub max_free_accesses: u32,
    pub reset_interval: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ContributorCredit {
    pub npub: String,
    pub pix_key: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct DeSciNodeResource {
    pub node_id: String,
    pub dpid: Option<String>,
    pub title: String,
    pub contributors: Vec<ContributorCredit>,
    pub software_version: Option<String>,
    pub derived_from_dpid: Option<String>,
    pub spdx_license: Option<String>,
    pub copyright_holder: Option<String>,
    pub ai_generated: Option<bool>,
    pub training_data_provenance: Option<String>,
    pub royalty_config: Option<RoyaltyConfig>,
    pub royalty_basket: Option<String>,
    pub access_count: u64,
    pub total_revenue: String,
}

impl DeSciNodeResource {
    pub fn new(node_id: &str, title: &str, author_npub: &str, _author_orcid: Option<&str>) -> Self {
        Self {
            node_id: node_id.to_string(),
            dpid: None,
            title: title.to_string(),
            contributors: vec![ContributorCredit { npub: author_npub.to_string(), pix_key: None }],
            software_version: None,
            derived_from_dpid: None,
            spdx_license: None,
            copyright_holder: None,
            ai_generated: None,
            training_data_provenance: None,
            royalty_config: None,
            royalty_basket: None,
            access_count: 0,
            total_revenue: "0 USDC".to_string(),
        }
    }

    pub fn from_bytes(bytes: &[u8]) -> Result<Self, String> {
        serde_json::from_slice(bytes).map_err(|e| format!("Failed to parse: {}", e))
    }

    pub fn to_bytes(&self) -> Result<Vec<u8>, String> {
        serde_json::to_vec(self).map_err(|e| format!("Failed to serialize: {}", e))
    }
}
