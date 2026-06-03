use std::fs;
use std::path::PathBuf;

use rusqlite::{Connection, params};

use crate::m01_models::SeedHistoryRecord;
use crate::m02_db::{db_conn, now_iso};
use crate::m04_embedding::build_query_embedding_with_sudachi;

/// デモ用のサンプルデータを DB に投入する（既存データは全削除してから入れ直す）。
///
/// - 引数 `repeat_count`: 「請求」「認証」カテゴリのチャンクを追加でこの回数だけ複製する（負荷検証用）。
/// - 投入対象: `documents` / `chunks` / `embeddings`、および `samples/support_histories_seed.json` の追加履歴。
/// - 副作用: `raw_inquiries`, `rag_queries` も含めて全テーブルを `DELETE` する。本番では呼ばないこと。
pub fn seed_sample_data(db_path: &PathBuf, repeat_count: usize) -> rusqlite::Result<()> {
    let conn = db_conn(db_path)?;
    conn.execute("DELETE FROM embeddings", [])?;
    conn.execute("DELETE FROM chunks", [])?;
    conn.execute("DELETE FROM documents", [])?;
    conn.execute("DELETE FROM raw_inquiries", [])?;
    conn.execute("DELETE FROM rag_queries", [])?;

    let ts = now_iso();
    conn.execute(
        "INSERT INTO documents VALUES (?1,?2,?3,?4,?5,?6,?7,?8)",
        params!["doc_001", "請求書の宛名変更対応", "請求", "cs_only", "approved", "faq", ts, ts],
    )?;
    let ts = now_iso();
    conn.execute(
        "INSERT INTO documents VALUES (?1,?2,?3,?4,?5,?6,?7,?8)",
        params!["doc_002", "ログインできない時の対応", "認証", "cs_only", "approved", "faq", ts, ts],
    )?;
    let ts = now_iso();
    conn.execute(
        "INSERT INTO documents VALUES (?1,?2,?3,?4,?5,?6,?7,?8)",
        params!["doc_003", "社内メモ（未承認）", "内部", "admin_only", "draft", "memo", ts, ts],
    )?;

    insert_chunk_with_emb(
        &conn,
        "chunk_001",
        "doc_001",
        1,
        "顧客から請求書の宛名変更を依頼された場合は、本人確認後、契約名義と請求先情報を確認する。",
        vec![0.91, 0.05, 0.02, 0.01, 0.0],
    )?;
    insert_chunk_with_emb(
        &conn,
        "chunk_002",
        "doc_001",
        2,
        "契約名義の変更を伴う場合は、営業担当または管理部に確認する。",
        vec![0.84, 0.09, 0.03, 0.01, 0.01],
    )?;
    insert_chunk_with_emb(
        &conn,
        "chunk_003",
        "doc_002",
        1,
        "顧客がログインできない場合は、メールアドレス、アカウント状態、パスワード再設定履歴を確認する。",
        vec![0.05, 0.9, 0.02, 0.02, 0.01],
    )?;

    for i in 0..repeat_count {
        insert_chunk_with_emb(
            &conn,
            &format!("chunk_billing_{i:04}"),
            "doc_001",
            100 + i as i64,
            &format!("請求書の宛名変更手順 補足 {}: 本人確認の記録を残し、承認ルートを確認する。", i + 1),
            vec![0.88, 0.07, 0.02, 0.01, 0.0],
        )?;
        insert_chunk_with_emb(
            &conn,
            &format!("chunk_auth_{i:04}"),
            "doc_002",
            200 + i as i64,
            &format!("ログイン障害対応 補足 {}: ロック状態と多要素認証の失敗回数を確認する。", i + 1),
            vec![0.06, 0.87, 0.02, 0.03, 0.02],
        )?;
    }

    let extra_histories = load_seed_histories();
    for (doc_idx, h) in extra_histories.iter().enumerate() {
        let doc_id = format!("doc_ext_{:03}", doc_idx + 1);
        let ts = now_iso();
        conn.execute(
            "INSERT INTO documents VALUES (?1,?2,?3,?4,?5,?6,?7,?8)",
            params![
                doc_id,
                h.title,
                h.category,
                h.visibility,
                h.status,
                h.source_type,
                ts,
                ts
            ],
        )?;

        for (chunk_idx, chunk_text) in h.chunks.iter().enumerate() {
            let emb = infer_embedding_from_text(chunk_text);
            insert_chunk_with_emb(
                &conn,
                &format!("chunk_ext_{:03}_{:03}", doc_idx + 1, chunk_idx + 1),
                &doc_id,
                (chunk_idx + 1) as i64,
                chunk_text,
                emb,
            )?;
        }
    }
    Ok(())
}

/// `samples/support_histories_seed.json` から追加のサポート履歴シードを読み込む。
///
/// ファイル不在・JSON 不正の場合は空 Vec を返し、シード処理は継続できる。
fn load_seed_histories() -> Vec<SeedHistoryRecord> {
    let path = PathBuf::from("samples/support_histories_seed.json");
    match fs::read_to_string(path) {
        Ok(text) => serde_json::from_str::<Vec<SeedHistoryRecord>>(&text).unwrap_or_default(),
        Err(_) => Vec::new(),
    }
}

/// シード用チャンクテキストから簡易埋め込みベクトルを生成する。
///
/// 内部的にはクエリ用と同じ [`build_query_embedding_with_sudachi`] を流用しているため、
/// 検索時のクエリと近い空間にチャンクが配置される（デモ用途）。
fn infer_embedding_from_text(text: &str) -> Vec<f64> {
    let (vec, _) = build_query_embedding_with_sudachi(text);
    vec
}

/// 1 件のチャンクと、それに紐づく埋め込みベクトルを同時に INSERT するヘルパー。
///
/// 保存ルール（このプロジェクトの現在仕様）:
/// - ベクトルは `Vec<f64>` のまま持ち、`serde_json::to_string` で JSON 配列文字列に変換する。
/// - 変換した文字列は `embeddings.embedding_json`（TEXT）へ保存する。
/// - `embeddings.id` は常に `emb_{chunk_id}` 形式で採番する。
/// - `embeddings.chunk_id` で `chunks.id` に紐付ける（1 チャンクに 1 ベクトル）。
/// - `embeddings.embedding_model` は固定値 `"dummy-embedding-v1"` を入れる（デモ用）。
/// - JSON 化に失敗した場合はフォールバックで `"[]"` を保存する。
///
/// 付随ルール:
/// - `chunks.section_title` は固定で `"基本手順"`。
/// - `chunks.metadata_json` は固定で `{"source":"seed"}`。
fn insert_chunk_with_emb(
    conn: &Connection,
    chunk_id: &str,
    doc_id: &str,
    chunk_index: i64,
    content: &str,
    emb: Vec<f64>,
) -> rusqlite::Result<()> {
    let ts = now_iso();
    conn.execute(
        "INSERT INTO chunks VALUES (?1,?2,?3,?4,?5,?6,?7,?8)",
        params![
            chunk_id,
            doc_id,
            chunk_index,
            content,
            "基本手順",
            "{\"source\":\"seed\"}",
            ts,
            ts
        ],
    )?;
    let emb_json = serde_json::to_string(&emb).unwrap_or_else(|_| "[]".to_string());
    conn.execute(
        "INSERT INTO embeddings VALUES (?1,?2,?3,?4,?5)",
        params![
            format!("emb_{chunk_id}"),
            chunk_id,
            "dummy-embedding-v1",
            emb_json,
            now_iso()
        ],
    )?;
    Ok(())
}
