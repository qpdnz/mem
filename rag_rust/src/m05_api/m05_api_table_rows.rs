use axum::extract::{Path, Query, State};
use axum::http::StatusCode;
use axum::Json;
use rusqlite::params;
use serde_json::{json, Value};

use crate::m01_models::{AppState, TableQuery};
use crate::m02_db::{db_conn, internal_err, row_to_json};

/// `GET /api/sqlite/table/{table}` — 指定したテーブルの行を取得する。
///
/// - パスパラメータ `table`: 取得対象のテーブル名。
///   `documents` / `chunks` / `embeddings` / `raw_inquiries` / `rag_queries` のみ許可（それ以外は 400）。
/// - クエリパラメータ:
///   - `limit` (任意): 取得件数の上限。`0` 以下または未指定の場合は全件取得。
///     値があれば `1..=5000` にクランプする。
///   - `offset` (任意, 既定 0): スキップする件数。
/// - 並び順: `rowid DESC`（新しい順）。
/// - 戻り値: `{ table, limit, offset, total, rows }` の JSON。
pub async fn api_table_rows(
    State(state): State<AppState>,
    Path(table): Path<String>,
    Query(q): Query<TableQuery>,
) -> Result<Json<Value>, (StatusCode, String)> {
    let allowed = ["documents", "chunks", "embeddings", "raw_inquiries", "rag_queries"];
    if !allowed.contains(&table.as_str()) {
        return Err((StatusCode::BAD_REQUEST, "unknown table".to_string()));
    }

    let conn = db_conn(&state.db_path).map_err(internal_err)?;
    let total: i64 = conn
        .query_row(&format!("SELECT COUNT(*) FROM {table}"), [], |r| r.get(0))
        .map_err(internal_err)?;

    let fetch_all = q.limit.unwrap_or(0) <= 0;
    let mut rows_json = Vec::<Value>::new();
    if fetch_all {
        let mut stmt = conn
            .prepare(&format!("SELECT * FROM {table} ORDER BY rowid DESC"))
            .map_err(internal_err)?;
        let col_names: Vec<String> = stmt.column_names().iter().map(|s| s.to_string()).collect();
        let mapped = stmt
            .query_map([], |row| Ok(row_to_json(row, &col_names)))
            .map_err(internal_err)?;
        for item in mapped {
            rows_json.push(item.map_err(internal_err)?);
        }
    } else {
        let limit = q.limit.unwrap_or(50).clamp(1, 5000);
        let offset = q.offset.unwrap_or(0).max(0);
        let mut stmt = conn
            .prepare(&format!("SELECT * FROM {table} ORDER BY rowid DESC LIMIT ?1 OFFSET ?2"))
            .map_err(internal_err)?;
        let col_names: Vec<String> = stmt.column_names().iter().map(|s| s.to_string()).collect();
        let mapped = stmt
            .query_map(params![limit, offset], |row| Ok(row_to_json(row, &col_names)))
            .map_err(internal_err)?;
        for item in mapped {
            rows_json.push(item.map_err(internal_err)?);
        }
    }

    Ok(Json(json!({
        "table": table,
        "limit": if fetch_all { 0 } else { q.limit.unwrap_or(50) },
        "offset": q.offset.unwrap_or(0),
        "total": total,
        "rows": rows_json
    })))
}
