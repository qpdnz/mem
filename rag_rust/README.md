# RAG Rust (Axum)

Python版のSQLite RAG検証機能を、Axumで置き換えた実装です。

## 公開リポジトリ向けの扱い

- `.env`、SQLite DB、Sudachi 辞書ファイルはコミットしないでください。
- `data/`、`*.db`、`*.dic` は `.gitignore` で除外しています。
- サンプル文はデモ用の架空データです。実在の問い合わせ、顧客名、メールアドレス、電話番号、住所は入れないでください。

## 起動

```powershell
cd rag_rust
cargo run
```

起動後:

- `http://localhost:8000` : Web UI（`PORT`で変更可）
- `http://localhost:8000/api/sqlite/tables` : API確認

## clone 後のセットアップ

このリポジトリには、SQLite DB と Sudachi 辞書ファイルは含めません。
DB は起動時に自動作成され、サンプルデータは seed で投入します。

### 1. 依存関係の取得

```powershell
cargo fetch
```

フロントエンド用の npm 依存は現状ほぼ使っていませんが、必要な場合だけ実行してください。

```powershell
npm install
```

### 2. 起動して DB を作る

```powershell
cargo run
```

初回起動時に `data/rag_knowledge.db` が作成されます。

### 3. サンプルデータを投入する

起動後、ブラウザで `http://localhost:8000` を開き、「初期化 + サンプル投入」を実行してください。
API から実行する場合は次の URL に `POST` します。

```powershell
Invoke-RestMethod -Method Post "http://localhost:8000/api/sqlite/init-seed?repeat_count=50"
```

投入元は `samples/support_histories_seed.json` です。

### 4. Sudachi 辞書を入れる（任意）

辞書がない場合も fallback 分割で動きます。日本語解析精度を上げたい場合だけ入れてください。

1. [WorksApplications/SudachiDict Releases](https://github.com/WorksApplications/SudachiDict/releases) から `core` または `full` の ZIP をダウンロード
2. ZIP を展開
3. 展開した `system_*.dic` を `data/sudachi/system.dic` に配置

PowerShell 例:

```powershell
New-Item -ItemType Directory -Force data\sudachi
Copy-Item path\to\system_core.dic data\sudachi\system.dic
```

別の場所に置く場合は `.env` または環境変数で指定します。

```powershell
Copy-Item .env.example .env
$env:SUDACHI_DICT_PATH = "data\sudachi\system.dic"
cargo run
```

Sudachi 辞書は WorksApplications/SudachiDict の配布物です。ライセンスと配布条件は配布元を確認してください。

## 実装済み

- SQLite初期化 + サンプル投入
- テーブル件数取得
- テーブル全件表示
- 日本語検索（query -> 簡易embedding変換）
- 類似度検索（cosine similarity）
- 検索ステップ表示
- 検索デバッグ樹形図表示
- 別ファイルサンプル投入（`samples/support_histories_seed.json`）

## API

- `POST /api/sqlite/init-seed?repeat_count=50`
- `GET /api/sqlite/tables`
- `GET /api/sqlite/table/{table}?limit=0&offset=0`
- `POST /api/sqlite/search-text`

## 実装ルール

- `src` 配下の機能分割は `mNN_<role>.rs` 形式を使う（例: `m01_models.rs`）。
- `NN` は 2 桁連番で、責務の小さい順に割り当てる。
- `main.rs` は起動処理と配線（ルーティング組み立て）に限定する。
- 機能追加時は既存モジュールへ責務単位で追加し、`main.rs` にロジックを戻さない。
そもそもこのプロジェクトに変換ルールどういうタグ付けがあるかないからわかりづらくなっているの?
## サンプル履歴の追加方法

`samples/support_histories_seed.json` に履歴を追記し、
Web画面の「初期化 + サンプル投入」を実行してください。

## 補足

現在の埋め込みはデモ用の簡易ルールベースです。
本番化では、埋め込みモデルへの置換と再インデックス運用が必要です。

## 変換ルール（現状）

<!-- raw_inquiries -> raw_inquiries の変換ルール -->
- `raw_inquiries` には `raw_text`（元文）と `sanitized_text`（マスク後文）を持つ設計だが、現状コードでは `INSERT` / 更新処理は未実装。
- つまり「raw を受けて sanitized を作って同テーブルに保存する」実処理は、現時点では動作していない（スキーマのみ存在）。

<!-- raw_inquiries -> chunks の変換ルール -->
- 現状コードでは `raw_inquiries` から `chunks` へ変換して保存する処理は未実装。
- `chunks` への投入は seed 処理（`src/m03_seed.rs`）からのみ行う。

## Sudachi 連携

日本語解析に Sudachi を使うように実装済みです。
辞書パスの優先順は次の通りです。

1. `SUDACHI_DICT_PATH`
2. `data/sudachi/system_full.dic`（プロジェクト相対）

どちらも無い場合は自動でフォールバックします。

必要な環境変数:

- `HOST` : 待受ホスト（任意。未設定時は `127.0.0.1`）
- `PORT` : 待受ポート（任意。未設定時は `8000`）
- `SUDACHI_DICT_PATH` : `system_*.dic` へのパス（任意。未設定時は既定パスを使用）
- `SUDACHI_RESOURCE_DIR` : Sudachi resourceディレクトリ（任意）

検索語の読み補正は `data/synonyms_ja.json` で管理できます（起動時に自動ロード）。

### 推奨配置

- 辞書ファイルを `data/sudachi/system.dic` に配置
- 追加リソースを使う場合は `data/sudachi/resources` を配置

`data/` は Git 管理外です。辞書や DB を共有したい場合は、リポジトリではなく配布元リンクや別ストレージを使ってください。

### 使い方（.env 共通）

1. `.env.example` を `.env` としてコピーして値を設定

```powershell
Copy-Item .env.example .env
```

```bash
cp .env.example .env
```

2. `cargo run` を実行（`main.rs` で `.env` を自動ロード）

```bash
cargo run
```

### 使い方（シェルで直接指定する場合）

PowerShell:

```powershell
$env:SUDACHI_DICT_PATH = "data\sudachi\system.dic"
$env:SUDACHI_RESOURCE_DIR = "data\sudachi\resources"
cargo run
```

Git Bash:

```bash
export SUDACHI_DICT_PATH='data/sudachi/system.dic'
export SUDACHI_RESOURCE_DIR='data/sudachi/resources'
cargo run
```

3. `POST /api/sqlite/search-text` を実行し、レスポンスの `query_analysis.analyzer` を確認
- `sudachi` なら Sudachi 解析を使用
- `fallback` なら簡易分割にフォールバック

### Sudachi を使っている場所

- クエリ検索時の埋め込み生成呼び出し: `src/m05_api/m05_api_search_text.rs`
- Seed時の埋め込み生成呼び出し: `src/m03_seed.rs`
- Sudachi 本体のトークン化実装: `src/m04_embedding.rs` の `try_sudachi_tokens`
