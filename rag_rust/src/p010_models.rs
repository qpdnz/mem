use std::path::PathBuf;
use std::sync::Arc;
use std::collections::HashMap;

use serde::{Deserialize, Serialize};

#[derive(Clone)]
pub struct AppState {
    pub db_path: Arc<PathBuf>,
    pub query_synonyms: Arc<HashMap<String, Vec<String>>>,
}

#[derive(Debug, Deserialize)]
pub struct InitSeedQuery {
    pub repeat_count: Option<usize>,
}

#[derive(Debug, Deserialize)]
pub struct TableQuery {
    pub limit: Option<i64>,
    pub offset: Option<i64>,
}

#[derive(Debug, Deserialize)]
pub struct SearchTextRequest {
    pub query_text: String,
    pub top_k: Option<usize>,
    pub visibility: Option<String>,
}

#[derive(Debug, Serialize)]
pub struct SearchResultRow {
    pub similarity: f64,
    pub document_id: String,
    pub document_title: String,
    pub chunk_id: String,
    pub chunk_index: i64,
    pub content: String,
    pub section_title: Option<String>,
    pub visibility: Option<String>,
    pub embedding_model: String,
}

#[derive(Debug, Deserialize)]
pub struct SeedHistoryRecord {
    pub title: String,
    pub category: String,
    pub visibility: String,
    pub status: String,
    pub source_type: String,
    pub chunks: Vec<String>,
}
