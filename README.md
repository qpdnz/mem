# AI コーディング向け ファイル命名規則

> **コンセプト：** ファイル名に「順序番号 + prefix + 責務」を埋め込み、AIと人間の両方が構造から処理フローを読み取れるようにする。

---

## 基本フォーマット

```
{順序番号}{prefix}-{責務名}.ts
```

例：
```
1in-validate.ts
2query-build.ts
3core-create.ts
```

> ⚠️ 順序番号はprefixのフェーズ順を示す。同じprefix内の複数ファイルは番号なしで並べてよい。

---

## Prefix 一覧

### `1in-` 系（入力処理）

| ファイル名         | 責務                                               | 副作用 |
| ------------------ | -------------------------------------------------- | ------ |
| `1in-validate.ts`  | スキーマ・型検証                                   | なし   |
| `1in-sanitize.ts`  | サニタイズ・正規化                                 | なし   |
| `1in-auth.ts`      | 認証・認可チェック                                 | なし   |
| `1in-guard.ts`     | 事前ビジネスルールチェック（重複確認等）           | なし   |
| `1in-formatter.ts` | 入力値（HTTPリクエスト）→ ドメインオブジェクト変換 | なし   |

---

### `2query-` 系（読み取り）

| ファイル名 | 責務 | 副作用 |
| ---------- | ---- | ------ |
**パターンA：生SQL（`$queryRaw` 等）— build/run 分離あり**

| ファイル名        | 責務                                    | 副作用 |
| ----------------- | --------------------------------------- | ------ |
| `2query-build.ts` | SQLクエリオブジェクト生成（実行しない） | なし   |
| `2query-run.ts`   | SQLクエリ実行（読み取り）               | なし   |
| `2query-map.ts`   | DB取得結果 → ドメインオブジェクト変換   | なし   |

> `2query-build.ts` だけテストすれば SQL の中身を検証できる。
> `2query-run.ts` は DB モックに差し替えやすい。

**パターンB：ORM（Prisma `findMany` 等）— fetch 一本**

| ファイル名        | 責務                                  | 副作用 |
| ----------------- | ------------------------------------- | ------ |
| `2query-fetch.ts` | ORMでデータ取得（生成〜実行を一括）   | なし   |
| `2query-map.ts`   | DB取得結果 → ドメインオブジェクト変換 | なし   |

**その他**

| ファイル名            | 責務                 | 副作用 |
| --------------------- | -------------------- | ------ |
| `2query-cache.ts`     | キャッシュ確認・取得 | なし   |
| `2query-aggregate.ts` | 複数テーブル結合取得 | なし   |

> **`2query-map` と `1in-formatter` の違い：**
> `1in-formatter` → HTTPリクエスト → ドメインオブジェクト
> `2query-map` → DB取得結果 → ドメインオブジェクト

---

### `3core-` 系（ビジネスロジック）

| ファイル名          | 責務                                      | 副作用 |
| ------------------- | ----------------------------------------- | ------ |
| `3core-create.ts`   | 生成ロジック                              | なし   |
| `3core-update.ts`   | 更新ロジック                              | なし   |
| `3core-delete.ts`   | 削除・無効化ロジック                      | なし   |
| `3core-calc.ts`     | 計算・集計ロジック                        | なし   |
| `3core-policy.ts`   | ポリシー判定（割引適用可否等）            | なし   |
| `3core-state.ts`    | 状態遷移ロジック                          | なし   |
| `3core-validate.ts` | ドメインルール検証（1in-validate とは別） | なし   |

> **`1in-validate` との違い：**
> `1in-validate` → 型・スキーマの検証（外側）
> `3core-validate` → ビジネスルールの検証（内側）

---

### `4cmd-` 系（書き込み）

| ファイル名            | 責務                        | 副作用   |
| --------------------- | --------------------------- | -------- |
| `4cmd-build.ts`       | INSERT/UPDATE/DELETE 文生成 | なし     |
| `4cmd-transaction.ts` | トランザクション制御        | **あり** |
| `4cmd-run.ts`         | 書き込み実行                | **あり** |

---

### `5out-` 系（出力処理）

| ファイル名           | 責務                          | 副作用   |
| -------------------- | ----------------------------- | -------- |
| `5out-formatter.ts`  | レスポンス形式へ変換          | なし     |
| `5out-emit-event.ts` | イベント発行（Kafka, SQS 等） | **あり** |
| `5out-notify.ts`     | 通知（メール・Slack 等）      | **あり** |
| `5out-log.ts`        | 監査ログ・アクセスログ        | **あり** |
| `5out-cache-set.ts`  | キャッシュ書き込み            | **あり** |

---

## 副作用マップ

```
副作用なし    →  1in-* / 2query-* / 3core-* / 4cmd-build / 5out-formatter
副作用あり    →  4cmd-transaction / 4cmd-run / 5out-emit-event / 5out-notify / 5out-log / 5out-cache-set
```

---

## ファイル構成例：`record-expense`（経費記録）

```
features/record-expense/
  1in-validate.ts       ← 金額・日付・カテゴリ等のスキーマ検証
  1in-sanitize.ts       ← 金額の丸め・文字列トリム等
  1in-auth.ts           ← 本人かどうかの確認
  1in-guard.ts          ← 上限金額チェック・月次申請上限チェック
  2query-fetch.ts       ← 経費カテゴリ・為替レート等の参照データ取得
  2query-map.ts         ← DB結果 → ドメインオブジェクト
  3core-create.ts       ← 経費レコード生成
  3core-calc.ts         ← 外貨→円換算・消費税計算
  3core-policy.ts       ← 申請可否ポリシー判定（役職別上限等）
  4cmd-build.ts
  4cmd-transaction.ts
  4cmd-run.ts
  5out-formatter.ts
  5out-notify.ts        ← 上長への通知
```

---

## ファイル構成例：`edit-expense`（経費編集）

```
features/edit-expense/
  1in-validate.ts       ← 変更内容のスキーマ検証
  1in-auth.ts           ← 本人 or 経理担当者のみ編集可
  1in-guard.ts          ← 承認済みレコードは編集不可
  2query-fetch.ts       ← 既存の経費レコード取得
  2query-map.ts
  3core-update.ts       ← 変更差分の適用
  3core-calc.ts         ← 再計算（金額・税額）
  4cmd-build.ts
  4cmd-transaction.ts
  4cmd-run.ts
  5out-formatter.ts
```

---

## ファイル構成例：`delete-expense`（経費削除）

```
features/delete-expense/
  1in-validate.ts
  1in-auth.ts           ← 本人 or 経理担当者のみ削除可
  1in-guard.ts          ← 承認済み・精算済みは削除不可
  2query-fetch.ts       ← 削除対象レコードの存在確認
  2query-map.ts
  3core-delete.ts       ← 論理削除（物理削除はしない）
  4cmd-build.ts
  4cmd-transaction.ts
  4cmd-run.ts
  5out-formatter.ts
```

---

## 他の設計手法との比較：`record-expense`

同じ「経費記録」ユースケースを各設計手法で実装した場合のファイル構成比較。

### この命名規則

```
features/record-expense/
  1in-validate.ts
  1in-sanitize.ts
  1in-auth.ts
  1in-guard.ts
  2query-fetch.ts
  2query-map.ts
  3core-create.ts
  3core-calc.ts
  3core-policy.ts
  4cmd-build.ts
  4cmd-transaction.ts
  4cmd-run.ts
  5out-formatter.ts
  5out-notify.ts
```

**特徴：** ファイルを開かずに処理フローと順序が読める。同一featureに閉じている。

---

### MVC

```
controllers/
  expense.controller.ts     ← バリデーション・認証・レスポンス整形まで混在
services/
  expense.service.ts        ← ビジネスロジック・DB操作・通知まで混在
models/
  expense.model.ts          ← DBスキーマ定義（ORMモデル）。entity/VOの概念は持たない
```

**特徴：** ファイル数が少なくシンプル。ただし `service` が肥大化しやすく、処理の順序・責務がコードを読まないとわからない。entity / VO の概念がなくドメインルールが `service` に埋もれる。

---

### クリーンアーキテクチャ

```
presentation/
  expense.controller.ts
  expense.dto.ts                ← 入力値のスキーマ・型定義
application/
  use-cases/
    record-expense.usecase.ts   ← ここに全体の流れが集中
  ports/
    expense.repository.port.ts
domain/
  entities/
    expense.entity.ts           ← IDを持つ識別可能なオブジェクト
  value-objects/
    expense-amount.vo.ts        ← 金額（不変・等値性で比較）
    expense-category.vo.ts      ← カテゴリ（不変・等値性で比較）
  domain-services/
    expense.policy.ts           ← 申請可否ポリシー（役職別上限等、entity単体で表現できないルール）
infrastructure/
  expense.repository.ts         ← DB操作の実装
  expense.notifier.ts           ← 上長通知の実装
```

**特徴：** 依存の方向が明確でテストしやすい。ただしfeatureをまたいでファイルが散らばるため、`record-expense` に関係するファイルを探すのに複数ディレクトリを横断する必要がある。

---

### DDD（ドメイン駆動設計）

```
domain/
  expense/
    expense.aggregate.ts          ← 集約ルート（整合性境界）
    expense.entity.ts             ← 集約内の子エンティティ（例：領収書明細）
    value-objects/
      expense-amount.vo.ts        ← 金額
      expense-category.vo.ts      ← カテゴリ
      expense-status.vo.ts        ← ステータス（記録済・承認済・精算済等）
    expense.repository.ts         ← repositoryインターフェースのみ（実装はinfra）
    expense.domain-service.ts     ← 複数集約にまたがるドメインロジック
    expense.factory.ts            ← 経費レコード生成ロジック
    expense.specification.ts      ← 申請可否ルールのオブジェクト化
    events/
      expense-recorded.event.ts   ← ドメインイベント
application/
  expense/
    record-expense.command.ts     ← 入力データの型定義
    record-expense.handler.ts     ← ユースケース全体を orchestrate
infrastructure/
  expense/
    expense.prisma-repository.ts  ← repositoryの実装
    expense.notifier.ts           ← 通知の実装
presentation/
  expense/
    expense.controller.ts
    record-expense.request.ts     ← HTTPリクエストのDTO
    record-expense.response.ts    ← HTTPレスポンスのDTO
```

**特徴：** ドメインモデルが厚く、ビジネスルールの表現力が高い。ファイル数・ディレクトリ数が多く、小〜中規模には過剰になりやすい。

---

### フラット（NestJS的）

```
expense/
  expense.controller.ts     ← ルーティング・バリデーション
  expense.service.ts        ← ビジネスロジック・DB操作まで混在しやすい
  expense.repository.ts     ← DB操作
  expense.dto.ts            ← リクエスト/レスポンスのDTO
  expense.entity.ts         ← ORMエンティティ（DBスキーマ兼用が多い）
  expense.module.ts         ← DIコンテナ設定
```

**特徴：** feature単位でまとまっていて見通しがよい。ファイル数が少ない分、各ファイルが複数責務を持ちやすく、`expense.service.ts` が肥大化する傾向がある。VO の概念は省略されることが多い。

---

### 比較まとめ

| 手法 | 処理順の可読性 | feature内への凝集 | ファイル数 | 向いている規模 |
|---|---|---|---|---|
| **この命名規則** | ◎ ファイル名で一目瞭然 | ◎ feature内に閉じる | 中 | 小〜大 |
| MVC | △ serviceを読まないとわからない | △ layer横断 | 少 | 小〜中 |
| クリーンアーキテクチャ | ○ usecase で把握できる | △ layer横断 | 多 | 中〜大 |
| DDD | ○ handler で把握できる | △ layer横断 | 多い | 大 |
| フラット | △ serviceを読まないとわからない | ◎ feature内に閉じる | 少 | 小〜中 |

---

## Prefix 処理順まとめ

| prefix    | 処理フェーズ         |
| --------- | -------------------- |
| `1in-`    | 入力・検証・変換     |
| `2query-` | 読み取り             |
| `3core-`  | ビジネスロジック     |
| `4cmd-`   | 書き込み             |
| `5out-`   | 出力・通知・イベント |

---

## 設計原則

1. **ファイル名だけで責務がわかる** — コードを開かなくても処理内容が推測できる
2. **先頭の数字が順序を表す** — 1→2→3→4→5 の流れで読む。ファイルソートと一致する
3. **副作用の可視化** — `4cmd-transaction` 以降は副作用ありと覚える
4. **AIへの文脈最大化** — エージェントが構造から「次に何が必要か」を推論できる
5. **featureをまたいでprefixの意味を統一** — どのfeatureを見ても同じルールで読める
