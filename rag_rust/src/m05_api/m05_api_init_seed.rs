use axum::extract::{Query, State};
use axum::http::StatusCode;
use axum::Json;
use serde_json::{json, Value};

use crate::m01_models::{AppState, InitSeedQuery};
use crate::m02_db::{get_table_counts, init_db, internal_err};
use crate::m03_seed::seed_sample_data;

/// `POST /api/sqlite/init-seed` — DB を初期化し、サンプルデータを投入するエンドポイント。
///
/// - クエリパラメータ `repeat_count`（任意, 既定 50）: 大量データ用のチャンク複製回数。
/// - 戻り値: 投入後の各テーブルの件数を含む JSON。
/// - 注意: 既存データを全削除するため、開発・デモ用途のみで使用すること。
pub async fn api_init_seed(
    State(state): State<AppState>,
    Query(q): Query<InitSeedQuery>,
) -> Result<Json<Value>, (StatusCode, String)> {
    init_db(&state.db_path).map_err(internal_err)?;
    seed_sample_data(&state.db_path, q.repeat_count.unwrap_or(50)).map_err(internal_err)?;
    let counts = get_table_counts(&state.db_path).map_err(internal_err)?;
    Ok(Json(json!({
        "message": "initialized and seeded",
        "db_path": state.db_path.to_string_lossy(),
        "counts": counts
    })))
}
