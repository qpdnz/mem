use serde_json::{Value, json};
use std::sync::{Once, OnceLock};
use sudachi::analysis::Mode as SudachiMode;
use sudachi::analysis::stateful_tokenizer::StatefulTokenizer;
use sudachi::config::Config;
use sudachi::dic::dictionary::JapaneseDictionary;

/// クエリ文字列を「簡易 5 次元ベクトル」に変換する（デモ用の擬似埋め込み）。
///
/// 次元の意味:
/// - `[0]` 請求系（請求書・宛名・名義 など）
/// - `[1]` 認証系（ログイン・パスワード・ロック など）
/// - `[2]` 個人情報系（メール・電話・本人確認 など）
/// - `[3]` ハウツー系（手順・方法・確認 など、重み 0.7）
/// - `[4]` バイアス項（常に少し加点）
///
/// - まず Sudachi で形態素解析を行い、失敗時はフォールバック分割を使う。
/// - どのカテゴリにもヒットしない場合は均等ベクトルで返してゼロベクトルを避ける。
/// - 最後に L2 正規化してから返す。
/// - 戻り値の `Value` は採用した解析器（`sudachi` or `fallback`）とトークン列のデバッグ情報。
pub fn build_query_embedding_with_sudachi(query_text: &str) -> (Vec<f64>, Value) {
    // まず Sudachi で形態素解析し、失敗時はフォールバック分割を使う。
    let (token_pool, analyzer_info) = sudachi_tokens_or_fallback(query_text);
    let mut vec = vec![0.0_f64, 0.0_f64, 0.0_f64, 0.0_f64, 0.1_f64];
    let text = query_text.trim();
    let billing = ["請求", "宛名", "名義", "請求先", "請求書"];
    let auth = ["ログイン", "パスワード", "アカウント", "認証", "ロック"];
    let pii = ["メール", "電話", "個人情報", "本人確認", "住所"];
    let howto = ["手順", "対応", "方法", "どう", "確認", "教えて"];

    for w in billing {
        if text.contains(w) || token_pool.iter().any(|t| t.contains(w)) {
            vec[0] += 1.0;
        }
    }
    for w in auth {
        if text.contains(w) || token_pool.iter().any(|t| t.contains(w)) {
            vec[1] += 1.0;
        }
    }
    for w in pii {
        if text.contains(w) || token_pool.iter().any(|t| t.contains(w)) {
            vec[2] += 1.0;
        }
    }
    for w in howto {
        if text.contains(w) || token_pool.iter().any(|t| t.contains(w)) {
            vec[3] += 0.7;
        }
    }
    if vec[0] == 0.0 && vec[1] == 0.0 && vec[2] == 0.0 && vec[3] == 0.0 {
        // どのカテゴリにもヒットしない場合は、ゼロベクトルを避けるため均等ベクトルにする。
        vec = vec![0.2, 0.2, 0.2, 0.2, 0.2];
    }
    // 比較時にスケール差が出にくいよう、L2正規化して返す。
    let norm = vec.iter().map(|x| x * x).sum::<f64>().sqrt();
    if norm == 0.0 {
        return (
            vec![0.2, 0.2, 0.2, 0.2, 0.2],
            json!({
                "analyzer": analyzer_info["analyzer"],
                "tokens": token_pool
            }),
        );
    }
    (
        vec.into_iter().map(|x| x / norm).collect(),
        json!({
            "analyzer": analyzer_info["analyzer"],
            "tokens": token_pool
        }),
    )
}


/// 入力テキストを形態素解析し、言語ごとの固有名詞率を算出する。
///
/// - 言語分類: `ja` / `en` / `other`（トークン文字種ベース）
/// - 比率: `proper_noun_ratio = proper_noun_tokens / token_count`
/// - Sudachi 失敗時はフォールバック分割で集計（固有名詞判定はできないため比率0）
pub fn analyze_proper_noun_ratio_by_language(input_text: &str) -> Value {
    match try_language_proper_noun_stats_sudachi(input_text) {
        Ok(stats) => stats,
        Err(err) => {
            let msg = format!("[analysis] sudachi unavailable: {err}");
            log_sudachi_error_once(&msg);
            fallback_language_stats(input_text, &err)
        }
    }
}

/// 2 つのベクトルのコサイン類似度を計算する。
///
/// - 値域: `-1.0 ～ 1.0`（1.0 に近いほど似ている）。
/// - 次元不一致・空配列・どちらかのノルムが 0 の場合は安全に 0.0 を返す。
pub fn cosine_similarity(a: &[f64], b: &[f64]) -> f64 {
    if a.len() != b.len() || a.is_empty() {
        return 0.0;
    }
    let dot = a.iter().zip(b.iter()).map(|(x, y)| x * y).sum::<f64>();
    let na = a.iter().map(|x| x * x).sum::<f64>().sqrt();
    let nb = b.iter().map(|x| x * x).sum::<f64>().sqrt();
    if na == 0.0 || nb == 0.0 {
        return 0.0;
    }
    dot / (na * nb)
}

/// Sudachi による形態素解析を試み、失敗時は単純分割へフォールバックする内部関数。
///
/// - 成功して結果が非空なら `("sudachi", tokens)` を返す。
/// - 成功したが空、または失敗時はフォールバック分割を返し、JSON に理由を埋める。
/// - `SUDACHI_STRICT=1` が設定されている場合、Sudachi の失敗時は panic させる（CI 用）。
fn sudachi_tokens_or_fallback(query_text: &str) -> (Vec<String>, Value) {
    match try_sudachi_tokens(query_text) {
        Ok(tokens) if !tokens.is_empty() => (
            tokens,
            json!({
                "analyzer": "sudachi",
                "note": sudachi_resolution_note()
            }),
        ),
        Ok(_) => (
            fallback_simple_tokens(query_text),
            json!({
                "analyzer": "fallback",
                "note": "sudachiの結果が空のためフォールバック"
            }),
        ),
        Err(err) => {
            let msg = format!("[embedding] sudachi unavailable: {err}");
            log_sudachi_error_once(&msg);
            if sudachi_strict_mode() {
                panic!("{msg}");
            }
            (
                fallback_simple_tokens(query_text),
                json!({
                    "analyzer": "fallback",
                    "note": format!("sudachi未使用: {err}; {}", sudachi_resolution_note())
                }),
            )
        }
    }
}

/// 環境変数 `SUDACHI_STRICT` が真値（`1`/`true`/`yes`/`on`）かを判定する。
///
/// 真の場合、Sudachi 初期化失敗時にフォールバックせず panic させる。
fn sudachi_strict_mode() -> bool {
    matches!(
        std::env::var("SUDACHI_STRICT")
            .ok()
            .as_deref()
            .map(|v| v.trim().to_ascii_lowercase()),
        Some(v) if v == "1" || v == "true" || v == "yes" || v == "on"
    )
}

/// Sudachi で形態素解析し、各形態素の `normalized_form` のトークン列を返す。
///
/// - 分割モードは `Mode::C`（細かすぎず粗すぎない）。
/// - `surface` ではなく `normalized_form` を使って表記ゆれを吸収する。
/// - 必要な環境変数:
///   - `SUDACHI_DICT_PATH`（辞書ファイルパス。未設定時は `data/sudachi/system*.dic` を探す）
///   - `SUDACHI_RESOURCE_DIR`（リソースディレクトリ。任意）
/// - 失敗時はエラーメッセージを文字列で返す（panic しない）。
fn try_sudachi_tokens(query_text: &str) -> Result<Vec<String>, String> {
    let runtime = sudachi_runtime()?;
    // 設定は起動後に固定し、各リクエストでは辞書を安全に作り直す。
    let dict = JapaneseDictionary::from_cfg(&runtime.cfg)
        .map_err(|e| format!("dictionary load error: {e}; {}", runtime.note))?;

    // 5) StatefulTokenizer を作成。Mode::C は細かすぎず粗すぎない分割モード。
    let mut tokenizer = StatefulTokenizer::new(dict, SudachiMode::C);
    tokenizer.set_debug(false);

    // 6) 解析対象テキストを tokenizer にセット。
    //    reset() で内部状態を初期化した上で入力文字列を差し込む。
    *tokenizer.reset() = query_text.to_string();

    // 7) 形態素解析を実行。
    tokenizer
        .do_tokenize()
        .map_err(|e| format!("tokenize error: {e}"))?;

    // 8) 解析結果（形態素リスト）を取り出す。
    let morphs = tokenizer
        .into_morpheme_list()
        .map_err(|e| format!("tokenize error: {e}"))?;

    // 9) 各形態素から normalized_form を取得して Vec<String> にする。
    //    表記ゆれを減らすため、surface ではなく normalized_form を使う。
    let tokens = morphs
        .iter()
        .map(|m| m.normalized_form().to_string())
        .filter(|t| !t.trim().is_empty())
        .collect::<Vec<_>>();

    Ok(tokens)
}


fn try_language_proper_noun_stats_sudachi(input_text: &str) -> Result<Value, String> {
    let runtime = sudachi_runtime()?;
    let dict = JapaneseDictionary::from_cfg(&runtime.cfg)
        .map_err(|e| format!("dictionary load error: {e}; {}", runtime.note))?;

    let mut tokenizer = StatefulTokenizer::new(dict, SudachiMode::C);
    tokenizer.set_debug(false);
    *tokenizer.reset() = input_text.to_string();
    tokenizer
        .do_tokenize()
        .map_err(|e| format!("tokenize error: {e}"))?;
    let morphs = tokenizer
        .into_morpheme_list()
        .map_err(|e| format!("tokenize error: {e}"))?;

    let mut ja_total = 0usize;
    let mut ja_proper = 0usize;
    let mut ja_entity_like = 0usize;
    let mut ja_noun = 0usize;
    let mut en_total = 0usize;
    let mut en_proper = 0usize;
    let mut en_entity_like = 0usize;
    let mut en_noun = 0usize;
    let mut other_total = 0usize;
    let mut other_proper = 0usize;
    let mut other_entity_like = 0usize;
    let mut other_noun = 0usize;
    let mut pos_major_counts = std::collections::BTreeMap::<String, usize>::new();
    let mut entity_like_type_counts = std::collections::BTreeMap::<String, usize>::new();
    let mut token_pos = Vec::<Value>::new();

    for m in morphs.iter() {
        let token = m.normalized_form().trim();
        if token.is_empty() {
            continue;
        }
        let pos = m.part_of_speech();
        let major = pos.first().map(|s| s.as_str()).unwrap_or("*");
        let sub1 = pos.get(1).map(|s| s.as_str()).unwrap_or("*");
        *pos_major_counts.entry(major.to_string()).or_insert(0) += 1;
        let is_noun = major == "名詞";
        let is_proper = pos.iter().any(|p| p == "固有名詞");
        let entity_like_type = classify_entity_like(token, major, sub1, is_proper);
        let is_entity_like = entity_like_type.is_some();
        if let Some(t) = entity_like_type {
            *entity_like_type_counts.entry(t.to_string()).or_insert(0) += 1;
        }
        let pii_type = detect_pii_type(token, major);
        let is_pii_like = pii_type.is_some();
        token_pos.push(json!({
            "token": token,
            "pos": pos,
            "is_proper_noun": is_proper,
            "is_entity_like": is_entity_like,
            "entity_like_type": entity_like_type,
            "is_pii_like": is_pii_like,
            "pii_type": pii_type
        }));
        match detect_token_language(token) {
            "ja" => {
                ja_total += 1;
                if is_noun {
                    ja_noun += 1;
                }
                if is_proper {
                    ja_proper += 1;
                }
                if is_entity_like {
                    ja_entity_like += 1;
                }
            }
            "en" => {
                en_total += 1;
                if is_noun {
                    en_noun += 1;
                }
                if is_proper {
                    en_proper += 1;
                }
                if is_entity_like {
                    en_entity_like += 1;
                }
            }
            _ => {
                other_total += 1;
                if is_noun {
                    other_noun += 1;
                }
                if is_proper {
                    other_proper += 1;
                }
                if is_entity_like {
                    other_entity_like += 1;
                }
            }
        }
    }

    let total_tokens = ja_total + en_total + other_total;
    let total_proper = ja_proper + en_proper + other_proper;
    let total_entity_like = ja_entity_like + en_entity_like + other_entity_like;
    let total_noun = ja_noun + en_noun + other_noun;
    let pos_major = pos_major_counts
        .into_iter()
        .map(|(k, v)| json!({ "pos_major": k, "count": v }))
        .collect::<Vec<_>>();
    let entity_type_counts = entity_like_type_counts
        .into_iter()
        .map(|(k, v)| json!({ "entity_like_type": k, "count": v }))
        .collect::<Vec<_>>();

    Ok(json!({
        "analyzer": "sudachi",
        "overall": {
            "token_count": total_tokens,
            "noun_count": total_noun,
            "proper_noun_count": total_proper,
            "proper_noun_ratio": ratio(total_proper, total_tokens),
            "entity_like_count": total_entity_like,
            "entity_like_ratio": ratio(total_entity_like, total_tokens),
        },
        "by_language": [
            language_stat_json("ja", ja_total, ja_noun, ja_proper, ja_entity_like),
            language_stat_json("en", en_total, en_noun, en_proper, en_entity_like),
            language_stat_json("other", other_total, other_noun, other_proper, other_entity_like),
        ],
        "bars": [
            language_bar("ja", ja_total, ja_proper, ja_entity_like),
            language_bar("en", en_total, en_proper, en_entity_like),
            language_bar("other", other_total, other_proper, other_entity_like),
        ],
        "pos_major_counts": pos_major,
        "entity_like_type_counts": entity_type_counts,
        "token_pos": token_pos
    }))
}

fn fallback_language_stats(input_text: &str, err: &str) -> Value {
    let tokens = fallback_simple_tokens(input_text);
    let mut ja_total = 0usize;
    let mut en_total = 0usize;
    let mut other_total = 0usize;
    for token in tokens {
        match detect_token_language(&token) {
            "ja" => ja_total += 1,
            "en" => en_total += 1,
            _ => other_total += 1,
        }
    }
    let total_tokens = ja_total + en_total + other_total;
    json!({
        "analyzer": "fallback",
        "note": format!("sudachi未使用: {err}; {}", sudachi_resolution_note()),
        "overall": {
            "token_count": total_tokens,
            "noun_count": 0,
            "proper_noun_count": 0,
            "proper_noun_ratio": 0.0,
            "entity_like_count": 0,
            "entity_like_ratio": 0.0,
        },
        "by_language": [
            language_stat_json("ja", ja_total, 0, 0, 0),
            language_stat_json("en", en_total, 0, 0, 0),
            language_stat_json("other", other_total, 0, 0, 0),
        ],
        "bars": [
            language_bar("ja", ja_total, 0, 0),
            language_bar("en", en_total, 0, 0),
            language_bar("other", other_total, 0, 0),
        ],
        "pos_major_counts": [],
        "entity_like_type_counts": [],
        "token_pos": []
    })
}

fn language_stat_json(
    language: &str,
    total: usize,
    noun: usize,
    proper: usize,
    entity_like: usize,
) -> Value {
    json!({
        "language": language,
        "token_count": total,
        "noun_count": noun,
        "proper_noun_count": proper,
        "proper_noun_ratio": ratio(proper, total),
        "entity_like_count": entity_like,
        "entity_like_ratio": ratio(entity_like, total),
    })
}

fn ratio(num: usize, den: usize) -> f64 {
    if den == 0 {
        0.0
    } else {
        num as f64 / den as f64
    }
}

fn language_bar(language: &str, total: usize, proper: usize, entity_like: usize) -> String {
    let pct = (ratio(proper, total) * 100.0).round() as usize;
    let cand_pct = (ratio(entity_like, total) * 100.0).round() as usize;
    let filled = (pct / 5).min(20);
    let empty = 20usize.saturating_sub(filled);
    format!(
        "{language}: strict[{}{}] {pct}% ({proper}/{total}) / candidate={cand_pct}% ({entity_like}/{total})",
        "#".repeat(filled),
        "-".repeat(empty)
    )
}

fn classify_entity_like(
    token: &str,
    major: &str,
    sub1: &str,
    is_proper: bool,
) -> Option<&'static str> {
    if major != "名詞" {
        return None;
    }
    if is_proper || sub1 == "固有名詞" {
        return Some("proper_noun");
    }

    // 法人名
    let has_katakana = token.chars().any(|c| matches!(c as u32, 0x30a0..=0x30ff));
    let has_corp_marker =
        token.contains("株式会社") || token.contains("有限会社") || token.contains("合同会社");
    if has_corp_marker || token.ends_with("Inc") || token.ends_with("Ltd") || token.ends_with("LLC")
    {
        return Some("organization");
    }

    // 店舗名
    let store_suffixes = [
        "店",
        "本店",
        "支店",
        "営業所",
        "出張所",
        "ショップ",
        "ストア",
        "商店",
        "百貨店",
    ];
    if store_suffixes.iter().any(|s| token.ends_with(s)) {
        return Some("store");
    }

    // 施設名
    let facility_suffixes = [
        "センター",
        "ビル",
        "病院",
        "クリニック",
        "ホテル",
        "駅",
        "空港",
        "大学",
        "学校",
        "園",
        "ホール",
        "美術館",
        "図書館",
        "会館",
        "タワー",
    ];
    if facility_suffixes.iter().any(|s| token.ends_with(s)) {
        return Some("facility");
    }

    // 人名敬称
    if token == "御中" || token == "様" || token == "殿" {
        return Some("person_or_org_honorific");
    }

    // カタカナ名詞は候補として残す（製品名/ブランド名の救済）
    if has_katakana {
        return Some("katakana_noun");
    }

    None
}

fn detect_pii_type(token: &str, major: &str) -> Option<&'static str> {
    let t = token.trim();
    if t.is_empty() {
        return None;
    }
    if t.contains('@') {
        return Some("email");
    }
    if t.chars().filter(|c| c.is_ascii_digit()).count() >= 10
        || t.contains("電話")
        || t.contains("携帯")
        || t.contains("TEL")
    {
        return Some("phone");
    }
    if t.contains("住所")
        || t.contains("都")
        || t.contains("道")
        || t.contains("府")
        || t.contains("県")
    {
        return Some("address");
    }
    if t.contains("生年月日") || t.contains("年齢") {
        return Some("profile");
    }
    if (t.contains("株式会社") || t.contains("有限会社") || t.contains("合同会社"))
        && major == "名詞"
    {
        return Some("organization");
    }
    if major == "名詞" && (t == "様" || t == "御中" || t == "殿") {
        return Some("person_hint");
    }
    None
}

fn detect_token_language(token: &str) -> &'static str {
    if token.chars().any(is_japanese_char) {
        "ja"
    } else if token.chars().any(|c| c.is_ascii_alphabetic()) {
        "en"
    } else {
        "other"
    }
}

fn is_japanese_char(c: char) -> bool {
    matches!(
        c as u32,
        0x3040..=0x309f  // Hiragana
            | 0x30a0..=0x30ff // Katakana
            | 0x3400..=0x4dbf // CJK Ext A
            | 0x4e00..=0x9fff // CJK Unified
            | 0xf900..=0xfaff // CJK Compatibility Ideographs
    )
}


struct SudachiRuntime {
    cfg: Config,
    note: String,
}

/// Sudachi のランタイム（設定 + メモ）を一度だけ初期化して共有する。
///
/// 内部で `OnceLock` を使い、辞書解決と `Config` 構築の重い処理を初回 1 度だけ実行する。
/// 失敗結果も保持されるため、毎回 同じエラーメッセージを返してログを最小化できる。
fn sudachi_runtime() -> Result<&'static SudachiRuntime, String> {
    static RUNTIME: OnceLock<Result<SudachiRuntime, String>> = OnceLock::new();
    let result = RUNTIME.get_or_init(init_sudachi_runtime);
    match result {
        Ok(runtime) => Ok(runtime),
        Err(err) => Err(err.clone()),
    }
}

/// Sudachi ランタイムを初期化する（[`sudachi_runtime`] の初回呼び出しからのみ呼ばれる）。
///
/// 辞書パスとリソースディレクトリを解決し、`Config` を構築する。診断用に `note` を保持する。
fn init_sudachi_runtime() -> Result<SudachiRuntime, String> {
    let dict_path = resolve_dict_path()?;
    let cfg = build_sudachi_config(&dict_path)?;
    let note = sudachi_resolution_note();
    Ok(SudachiRuntime { cfg, note })
}

/// Sudachi 辞書ファイルのパスを解決する。
///
/// 優先順:
/// 1. 環境変数 `SUDACHI_DICT_PATH`
/// 2. `data/sudachi/system.dic`
/// 3. `data/sudachi/system_core.dic`
/// 4. `data/sudachi/system_full.dic`
///
/// いずれも存在しない場合は、公開ログにローカルパスを出さない汎用エラーを返す。
fn resolve_dict_path() -> Result<std::path::PathBuf, String> {
    let candidates = [
        std::env::var("SUDACHI_DICT_PATH").ok(),
        Some("data/sudachi/system.dic".to_string()),
        Some("data/sudachi/system_core.dic".to_string()),
        Some("data/sudachi/system_full.dic".to_string()),
    ];

    for candidate in candidates.into_iter().flatten() {
        if candidate.trim().is_empty() {
            continue;
        }
        let path = std::path::PathBuf::from(candidate);
        if path.exists() {
            return Ok(path);
        }
    }

    Err(
        "dictionary file not found. set SUDACHI_DICT_PATH or place a dictionary under data/sudachi/"
            .to_string(),
    )
}

/// Sudachi の `Config` を構築する。
///
/// - `SUDACHI_RESOURCE_DIR` が指定され、その配下に `sudachi.json` がある場合はそちらを使う。
/// - それ以外の場合は組み込みデフォルト設定に、解決済み辞書パスを差し込む。
fn build_sudachi_config(dict_path: &std::path::Path) -> Result<Config, String> {
    let resource_dir = std::env::var("SUDACHI_RESOURCE_DIR")
        .ok()
        .map(|s| s.trim().to_string())
        .filter(|s| !s.is_empty());

    if let Some(resource_dir) = resource_dir {
        let resource_path = std::path::PathBuf::from(&resource_dir);
        let cfg_path = resource_path.join("sudachi.json");
        if cfg_path.exists() {
            return Config::new(
                Some(cfg_path),
                Some(resource_path),
                Some(dict_path.to_path_buf()),
            )
            .map_err(|e| format!("config load error: {e}"));
        }
    }

    Config::new_embedded()
        .map(|cfg| cfg.with_system_dic(dict_path.to_path_buf()))
        .map_err(|e| format!("config load error: {e}"))
}

/// Sudachi が使えない場合の最低限のフォールバック分割。
///
/// 空白および ASCII 記号で split し、空要素を除いたトークン列を返す。
/// 日本語の境界判定はしないため精度は低いが、最低限の動作を保証する。
fn fallback_simple_tokens(query_text: &str) -> Vec<String> {
    query_text
        .split(|c: char| c.is_whitespace() || c.is_ascii_punctuation())
        .filter(|s| !s.is_empty())
        .map(ToString::to_string)
        .collect()
}

/// Sudachi に関する設定の有無を表す診断文字列を作る。
///
/// 公開環境のレスポンスやログにローカルパスを出さないため、値そのものは含めない。
fn sudachi_resolution_note() -> String {
    let dict = if std::env::var("SUDACHI_DICT_PATH")
        .ok()
        .filter(|s| !s.trim().is_empty())
        .is_some()
    {
        "set"
    } else {
        "unset"
    };
    let res = if std::env::var("SUDACHI_RESOURCE_DIR")
        .ok()
        .filter(|s| !s.trim().is_empty())
        .is_some()
    {
        "set"
    } else {
        "unset"
    };
    format!("SUDACHI_DICT_PATH={dict}, SUDACHI_RESOURCE_DIR={res}")
}

/// Sudachi のエラーログをプロセス内で 1 回だけ出力する。
///
/// stderr/stdout の両方に書き込む（VS Code のデバッグコンソール設定で片方が見えない場合があるため）。
fn log_sudachi_error_once(msg: &str) {
    static LOG_ONCE: Once = Once::new();
    LOG_ONCE.call_once(|| {
        eprintln!("{msg}");
        // VS Code のデバッグコンソール設定によって stderr が見えないことがあるため stdout にも出す。
        println!("{msg}");
    });
}
