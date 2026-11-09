use axum::routing::{get, post};
use axum::Router;

use crate::p010_models::AppState;

mod p010_init_seed;
mod p020_search_text;
mod p030_table_rows;
mod p040_tables;

/// すべての API ルートをまとめた axum の `Router` を構築する。
///
/// 登録ルート:
/// - `POST /api/sqlite/init-seed`: DB 初期化＋サンプルデータ投入
/// - `GET  /api/sqlite/tables`: 各テーブルの件数取得
/// - `GET  /api/sqlite/table/{table}`: 指定テーブルの行を取得
/// - `POST /api/sqlite/search-text`: クエリ文字列での類似検索
///
/// すべてのハンドラに [`AppState`] が共有状態として渡される。
pub fn build_api_router(state: AppState) -> Router {
    Router::new()
        .route("/api/sqlite/init-seed", post(p010_init_seed::api_init_seed))
        .route("/api/sqlite/tables", get(p040_tables::api_tables))
        .route(
            "/api/sqlite/table/{table}",
            get(p030_table_rows::api_table_rows),
        )
        .route(
            "/api/sqlite/search-text",
            post(p020_search_text::api_search_text),
        )
        .with_state(state)
}
