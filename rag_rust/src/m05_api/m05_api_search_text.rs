use std::cmp::Ordering;

use axum::extract::State;
use axum::http::StatusCode;
use axum::Json;
use rusqlite::{params, Row};
use serde_json::{json, Value};

use crate::m01_models::{AppState, SearchResultRow, SearchTextRequest};
use crate::m02_db::{db_conn, internal_err};
use crate::m04_embedding::{
    analyze_proper_noun_ratio_by_language, build_query_embedding_with_sudachi, cosine_similarity,
};
use crate::m06_query_normalizer::normalize_query_text;

/// `POST /api/sqlite/search-text` — クエリ文字列によるベクトル類似検索エンドポイント。
///
/// 処理の流れ:
/// 1. リクエストの `query_text` を受け取る。
/// 2. 同義語辞書で正規化し、置換ログを記録する（[`normalize_query_text`]）。
/// 3. Sudachi＋簡易ルールで 5 次元の疑似埋め込みを作る（[`build_query_embedding_with_sudachi`]）。
/// 4. `documents.status = 'approved'` の `embeddings`/`chunks`/`documents` を JOIN して候補を取得。
///    `visibility` 指定があればフィルタする。
/// 5. 各候補のコサイン類似度を計算して降順ソート、`top_k`（既定 5、最低 1）件を返す。
///
/// - 戻り値: 検索結果、解析情報（採用された解析器・トークン・置換ログ）、処理時間 (`elapsed_ms`)、デバッグ情報。
pub async fn api_search_text(
    State(state): State<AppState>,
    Json(req): Json<SearchTextRequest>,
) -> Result<Json<Value>, (StatusCode, String)> {
    let top_k = req.top_k.unwrap_or(5).max(1);
    let (normalized_query, replacements) =
        normalize_query_text(&req.query_text, &state.query_synonyms);
    let (query_embedding, mut query_analysis) =
        build_query_embedding_with_sudachi(&normalized_query);
    let original_lang_stats = analyze_proper_noun_ratio_by_language(&req.query_text);
    let normalized_lang_stats = analyze_proper_noun_ratio_by_language(&normalized_query);
    if let Some(obj) = query_analysis.as_object_mut() {
        obj.insert("original_query".to_string(), json!(req.query_text));
        obj.insert("normalized_query".to_string(), json!(normalized_query));
        obj.insert("replacements".to_string(), json!(replacements));
        obj.insert("language_stats_original".to_string(), original_lang_stats);
        obj.insert("language_stats_normalized".to_string(), normalized_lang_stats);
    }
    let conn = db_conn(&state.db_path).map_err(internal_err)?;

    let mut sql = String::from(
        r#"
        SELECT
            e.embedding_model,
            e.embedding_json,
            c.id AS chunk_id,
            c.chunk_index,
            c.content,
            c.section_title,
            d.id AS document_id,
            d.title AS document_title,
            d.visibility
        FROM embeddings e
        JOIN chunks c ON e.chunk_id = c.id
        JOIN documents d ON c.document_id = d.id
        WHERE d.status = 'approved'
        "#,
    );
    if req.visibility.is_some() {
        sql.push_str(" AND d.visibility = ?1");
    }

    let start = std::time::Instant::now();
    let mut items = Vec::<SearchResultRow>::new();
    let mut stmt = conn.prepare(&sql).map_err(internal_err)?;
    if let Some(v) = &req.visibility {
        let rows = stmt
            .query_map(params![v], |r| map_result_row(r, &query_embedding))
            .map_err(internal_err)?;
        for r in rows {
            items.push(r.map_err(internal_err)?);
        }
    } else {
        let rows = stmt
            .query_map([], |r| map_result_row(r, &query_embedding))
            .map_err(internal_err)?;
        for r in rows {
            items.push(r.map_err(internal_err)?);
        }
    }

    items.sort_by(|a, b| {
        b.similarity
            .partial_cmp(&a.similarity)
            .unwrap_or(Ordering::Equal)
    });

    let candidate_count = items.len();
    let results: Vec<SearchResultRow> = items.into_iter().take(top_k).collect();
    let elapsed_ms = start.elapsed().as_millis();
    let process_steps = vec![
        "1) query_text を受け取る",
        "2) query_text を簡易embeddingに変換する（デモ用）",
        "3) embeddings/chunks/documents を参照して候補を取得する",
        "4) embedding_json を配列に戻す",
        "5) cosine similarity を計算する",
        "6) documents.status = approved のみ残す",
        "7) 類似度順に並べて top_k を返す",
    ];

    Ok(Json(json!({
        "query_embedding": query_embedding,
        "query_analysis": query_analysis,
        "results": results,
        "count": results.len(),
        "elapsed_ms": elapsed_ms,
        "process_steps": process_steps,
        "debug": {
            "candidate_count": candidate_count,
            "returned_count": results.len(),
            "top_k": top_k,
            "visibility": req.visibility,
        }
    })))
}

/// 1 行の SQL 結果を [`SearchResultRow`] へ写像する内部ヘルパー。
///
/// - `embedding_json` をパースし、クエリ埋め込みとのコサイン類似度を計算して `similarity` に詰める。
/// - JSON パース失敗時は空ベクトルになり、結果的に類似度は 0.0 になる（行は捨てない）。
fn map_result_row(row: &Row<'_>, query_embedding: &[f64]) -> rusqlite::Result<SearchResultRow> {
    let emb_json: String = row.get(1)?;
    let emb: Vec<f64> = serde_json::from_str(&emb_json).unwrap_or_default();
    let sim = cosine_similarity(query_embedding, &emb);
    Ok(SearchResultRow {
        similarity: sim,
        document_id: row.get(6)?,
        document_title: row.get(7)?,
        chunk_id: row.get(2)?,
        chunk_index: row.get(3)?,
        content: row.get(4)?,
        section_title: row.get(5)?,
        visibility: row.get(8)?,
        embedding_model: row.get(0)?,
    })
}
