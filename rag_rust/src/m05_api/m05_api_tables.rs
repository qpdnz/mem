use axum::extract::State;
use axum::http::StatusCode;
use axum::Json;
use serde_json::{json, Value};

use crate::m01_models::AppState;
use crate::m02_db::{get_table_counts, init_db, internal_err};

/// `GET /api/sqlite/tables` — DB 全テーブルの行数を一覧で返す。
///
/// - スキーマが未作成のことを考慮し、毎回 [`init_db`] を呼んでから件数を集計する。
/// - 戻り値: `{ "db_path": ..., "counts": { "documents": N, ... } }`。
pub async fn api_tables(State(state): State<AppState>) -> Result<Json<Value>, (StatusCode, String)> {
    init_db(&state.db_path).map_err(internal_err)?;
    let counts = get_table_counts(&state.db_path).map_err(internal_err)?;
    Ok(Json(json!({
        "db_path": state.db_path.to_string_lossy(),
        "counts": counts
    })))
}
