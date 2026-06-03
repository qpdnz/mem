use std::path::PathBuf;

use axum::http::StatusCode;
use chrono::Utc;
use rusqlite::Connection;
use serde_json::{Value, json};

/// SQLite データベースへの接続を開く。
///
/// - 引数 `db_path`: SQLite ファイルへのパス。存在しなければ新規作成される。
/// - 戻り値: 外部キー制約（`PRAGMA foreign_keys = ON`）を有効化済みの `Connection`。
/// - 失敗時は `rusqlite::Error` を返す（接続/PRAGMA 失敗）。
pub fn db_conn(db_path: &PathBuf) -> rusqlite::Result<Connection> {
    let conn = Connection::open(db_path)?;
    conn.pragma_update(None, "foreign_keys", "ON")?;
    Ok(conn)
}

/// 現在時刻を UTC の RFC3339 文字列（ISO8601 互換）で返す。
///
/// `created_at` / `updated_at` カラムへの書き込み用に使う。
pub fn now_iso() -> String {
    Utc::now().to_rfc3339()
}

/// データベースのスキーマを初期化する（`CREATE TABLE IF NOT EXISTS`）。
///
/// - 作成テーブル: `documents`, `chunks`, `embeddings`, `raw_inquiries`, `rag_queries`。
/// - 既存テーブルがあれば何もしないため、サーバ起動時に毎回呼んで安全。
/// - 起動時およびシード投入直前に呼び出される。
pub fn init_db(db_path: &PathBuf) -> rusqlite::Result<()> {
    let conn = db_conn(db_path)?;
    conn.execute_batch(
        r#"
        CREATE TABLE IF NOT EXISTS documents (
            id TEXT PRIMARY KEY,
            title TEXT NOT NULL,
            category TEXT,
            visibility TEXT,
            status TEXT,
            source_type TEXT,
            created_at TEXT,
            updated_at TEXT
        );
        CREATE TABLE IF NOT EXISTS chunks (
            id TEXT PRIMARY KEY,
            document_id TEXT NOT NULL,
            chunk_index INTEGER,
            content TEXT NOT NULL,
            section_title TEXT,
            metadata_json TEXT,
            created_at TEXT,
            updated_at TEXT,
            FOREIGN KEY (document_id) REFERENCES documents(id) ON DELETE CASCADE
        );
        CREATE TABLE IF NOT EXISTS embeddings (
            id TEXT PRIMARY KEY,
            chunk_id TEXT NOT NULL,
            embedding_model TEXT NOT NULL,
            embedding_json TEXT NOT NULL,
            created_at TEXT,
            FOREIGN KEY (chunk_id) REFERENCES chunks(id) ON DELETE CASCADE
        );
        -- raw_inquiries:
        --   raw_text(元文) と sanitized_text(正規化/マスク後文) を保持する想定テーブル。
        --   ただし現状コードでは、このテーブルへの INSERT/UPDATE の変換処理は未実装。
        CREATE TABLE IF NOT EXISTS raw_inquiries (
            id TEXT PRIMARY KEY,
            raw_text TEXT NOT NULL,
            sanitized_text TEXT,
            detected_pii_json TEXT,
            risk_level TEXT,
            review_status TEXT,
            created_at TEXT,
            updated_at TEXT
        );
        -- rag_queries:
        --   検索クエリと取得チャンク結果の監査ログ用途。
        --   query_embedding_json / retrieved_chunks_json を保持できるが、現状は保存処理未実装。
        CREATE TABLE IF NOT EXISTS rag_queries (
            id TEXT PRIMARY KEY,
            query_text TEXT NOT NULL,
            query_embedding_json TEXT,
            generated_answer TEXT,
            retrieved_chunks_json TEXT,
            created_at TEXT
        );
    "#,
    )?;
    Ok(())
}

/// 各テーブルの行数を取得して JSON オブジェクトで返す。
///
/// - 戻り値の形式: `{ "documents": N, "chunks": N, ... }`。
/// - 管理画面の概要表示やシード投入後の確認用エンドポイントで使う。
pub fn get_table_counts(db_path: &PathBuf) -> rusqlite::Result<Value> {
    let tables = ["documents", "chunks", "embeddings", "raw_inquiries", "rag_queries"];
    let conn = db_conn(db_path)?;
    let mut map = serde_json::Map::new();
    for t in tables {
        let c: i64 = conn.query_row(&format!("SELECT COUNT(*) FROM {t}"), [], |r| r.get(0))?;
        map.insert(t.to_string(), json!(c));
    }
    Ok(Value::Object(map))
}

/// SQLite の 1 行を `serde_json::Value`（オブジェクト）へ変換する汎用関数。
///
/// - 引数 `row`: 取得対象の行。
/// - 引数 `col_names`: 列名の配列（順序はクエリ結果と一致）。
/// - 型変換: NULL → `null`, INTEGER → 数値, REAL → 数値, TEXT → 文字列, BLOB → `"<blob>"`。
/// - 取得エラーが起きたセルは NULL として扱う（行全体は中断しない）。
pub fn row_to_json(row: &rusqlite::Row<'_>, col_names: &[String]) -> Value {
    let mut obj = serde_json::Map::new();
    for (idx, col) in col_names.iter().enumerate() {
        let v = match row.get_ref(idx) {
            Ok(rusqlite::types::ValueRef::Null) => Value::Null,
            Ok(rusqlite::types::ValueRef::Integer(v)) => json!(v),
            Ok(rusqlite::types::ValueRef::Real(v)) => json!(v),
            Ok(rusqlite::types::ValueRef::Text(v)) => json!(String::from_utf8_lossy(v).to_string()),
            Ok(rusqlite::types::ValueRef::Blob(_)) => json!("<blob>"),
            Err(_) => Value::Null,
        };
        obj.insert(col.to_string(), v);
    }
    Value::Object(obj)
}

/// 任意のエラーを HTTP 500（INTERNAL_SERVER_ERROR）に変換するヘルパー。
///
/// `Result::map_err(internal_err)` の形で各 API ハンドラから使う。
pub fn internal_err(e: impl std::fmt::Display) -> (StatusCode, String) {
    (StatusCode::INTERNAL_SERVER_ERROR, e.to_string())
}
