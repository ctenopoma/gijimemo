mod settings;
mod meeting;
mod llm;
mod issuer;

pub use settings::*;
pub use meeting::*;
pub use llm::*;
pub use issuer::*;

use serde::{Deserialize, Serialize};

// ─── Shared data structs ─────────────────────────────────────────────────────

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct Settings {
    pub llm_api_key: String,
    pub llm_endpoint: String,
    pub llm_model: String,
    pub prompt_template: String,
    pub always_on_top: bool,
    pub auto_transparent: bool,
    pub inactive_opacity: f64,
    pub dark_mode: bool,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct CardImage {
    pub id: String,
    pub data: String,
    pub order_index: i64,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct AgendaCard {
    pub id: String,
    pub meeting_id: String,
    pub title: String,
    pub content: String,
    pub order_index: i64,
    pub images: Vec<CardImage>,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct Meeting {
    pub id: String,
    pub title: String,
    pub held_at: String,
    pub action_items: String,
    pub created_at: String,
    pub updated_at: String,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct MeetingWithCards {
    pub meeting: Meeting,
    pub cards: Vec<AgendaCard>,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct MeetingListItem {
    pub id: String,
    pub title: String,
    pub held_at: String,
    pub updated_at: String,
    pub card_count: i64,
}

// ─── LLM helpers ─────────────────────────────────────────────────────────────

pub(crate) fn build_llm_client(_endpoint: &str) -> Result<reqwest::Client, String> {
    reqwest::Client::builder()
        .no_proxy()
        .build()
        .map_err(|e| format!("HTTPクライアント構築失敗: {}", e))
}

pub(crate) fn normalize_endpoint(endpoint: &str) -> String {
    endpoint
        .replace("://localhost:", "://127.0.0.1:")
        .replace("://localhost/", "://127.0.0.1/")
        .replace("://localhost", "://127.0.0.1")
}

pub(crate) fn ensure_chat_completions_url(endpoint: &str) -> String {
    let trimmed = endpoint.trim_end_matches('/');
    if trimmed.ends_with("/chat/completions") {
        trimmed.to_string()
    } else {
        format!("{}/chat/completions", trimmed)
    }
}
