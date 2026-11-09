use std::collections::HashMap;
use std::path::Path;

use serde_json::Value;

/// 同義語辞書 JSON を読み込み、検索クエリ正規化用の HashMap に変換する。
///
/// - 引数 `path`: 同義語 JSON ファイルのパス（例: `data/synonyms_ja.json`）。
/// - 戻り値: キー＝元の表記、値＝同義語の配列。先頭要素を「代表表記」として使う。
/// - ファイル不在・JSON 不正・オブジェクト以外の場合は空の HashMap を返す（panic しない）。
pub fn load_query_synonyms(path: &Path) -> HashMap<String, Vec<String>> {
    let Ok(text) = std::fs::read_to_string(path) else {
        return HashMap::new();
    };
    let Ok(value) = serde_json::from_str::<Value>(&text) else {
        return HashMap::new();
    };
    let Some(obj) = value.as_object() else {
        return HashMap::new();
    };

    let mut map = HashMap::new();
    for (k, v) in obj {
        let key = k.trim();
        if key.is_empty() {
            continue;
        }
        let Some(arr) = v.as_array() else {
            continue;
        };
        let vals = arr
            .iter()
            .filter_map(|x| x.as_str())
            .map(str::trim)
            .filter(|x| !x.is_empty())
            .map(ToString::to_string)
            .collect::<Vec<_>>();
        if !vals.is_empty() {
            map.insert(key.to_string(), vals);
        }
    }
    map
}

/// クエリ文字列に対して同義語辞書を適用し、代表表記へ置換した正規化文字列を作る。
///
/// - 引数 `query`: ユーザー入力の検索クエリ。
/// - 引数 `synonyms`: [`load_query_synonyms`] が返した同義語辞書。
/// - 戻り値 `(normalized, replacements)`:
///   - `normalized`: 置換後のクエリ文字列。
///   - `replacements`: 適用された置換ログ（`"元 -> 先"` 形式）。デバッグ表示用。
/// - 値の先頭要素のみを代表表記として採用。`src == dst` の項目はスキップする。
pub fn normalize_query_text(
    query: &str,
    synonyms: &HashMap<String, Vec<String>>,
) -> (String, Vec<String>) {
    let mut normalized = query.to_string();
    let mut replacements = Vec::new();

    for (src, dsts) in synonyms {
        let Some(dst) = dsts.first() else {
            continue;
        };
        if src == dst {
            continue;
        }
        if normalized.contains(src) {
            normalized = normalized.replace(src, dst);
            replacements.push(format!("{src} -> {dst}"));
        }
    }

    (normalized, replacements)
}
