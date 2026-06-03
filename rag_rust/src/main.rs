mod m01_models;
mod m02_db;
mod m03_seed;
mod m04_embedding;
mod m05_api;
mod m06_query_normalizer;

// `std` は Rust 標準ライブラリ（.NET の BCL に近い）。
use std::path::PathBuf;
use std::sync::Arc;

// `m01_models` / `m02_db` / `m05_api` はこのプロジェクト内のモジュール。
use m01_models::AppState;
use m02_db::init_db;
use m05_api::build_api_router;
use m06_query_normalizer::load_query_synonyms;

// `tower_http` は外部クレート（NuGet パッケージ相当）。
// 静的ファイル配信用のサービスを提供する。
use tower_http::services::ServeDir;

/// アプリケーションのエントリポイント。
///
/// - `.env` を読み込み、SQLite 用ディレクトリと DB を初期化する。
/// - 同義語辞書 (`data/synonyms_ja.json`) を読み込み、共有状態 [`AppState`] を構築する。
/// - API ルーターを組み立て、未一致ルートは `static/` ディレクトリへフォールバック配信する。
/// - 環境変数 `HOST` / `PORT`（未指定時 127.0.0.1:8000）で axum サーバを起動する。
// `tokio` は外部クレート。非同期ランタイム（C# の async 実行基盤に近い）を起動する。
#[tokio::main]
async fn main() {
    // .env があれば読み込む（環境変数が優先される）。
    // シェルに残った古い環境変数より .env を優先する。
    dotenvy::dotenv_override().ok();

    // `PathBuf` は std のパス型。C# の `Path` と `string` の中間的な扱い。
    let db_path = PathBuf::from("data/rag_knowledge.db");

    // `std::fs` は標準ライブラリ。保存先フォルダを先に作る（既存ならOK）。
    std::fs::create_dir_all("data").ok();

    // DB 初期化（失敗時は panic して終了）。
    init_db(&db_path).expect("failed to init db");
    let query_synonyms = load_query_synonyms(&PathBuf::from("data/synonyms_ja.json"));

    // `Arc` は std の参照カウント共有ポインタ（C# の参照共有 + スレッド安全を明示したもの）。
    let state = AppState {
        db_path: Arc::new(db_path),
        query_synonyms: Arc::new(query_synonyms),
    };

    // API ルーターを構築して、未一致ルートは `static` 配下の配信にフォールバック。
    // `append_index_html_on_directories(true)`:
    // ディレクトリURLへのアクセス時に `/index.html` を自動で補う設定。
    // 例: `/docs/` に来たら実体として `static/docs/index.html` を探して返す。
    let api = build_api_router(state);
    let app = api.fallback_service(ServeDir::new("static").append_index_html_on_directories(true));

    let port = std::env::var("PORT")
        .ok()
        .and_then(|s| s.parse::<u16>().ok())
        .unwrap_or(8000);
    let host = std::env::var("HOST")
        .ok()
        .filter(|s| !s.trim().is_empty())
        .unwrap_or_else(|| "127.0.0.1".to_string());
    let bind_addr = format!("{host}:{port}");

    // `tokio::net::TcpListener` は外部クレート tokio の非同期ソケット待ち受け。
    let listener = tokio::net::TcpListener::bind(&bind_addr)
        .await
        .expect("bind failed");
    println!("Axum server started: http://{bind_addr}");

    // `axum` は外部クレート（Web フレームワーク）。HTTP サーバー本体を起動。
    axum::serve(listener, app).await.expect("serve failed");
}
