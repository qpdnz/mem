---
name: refactor-planner
description: "General refactor planning and implementation skill. Use when Codex needs to inspect or change a codebase for responsibility boundaries, module naming, generated-code boundaries, helper/util overuse, dependency direction, or project-specific conventions. Prefer project-local rules when present; otherwise apply generic responsibility boundaries."
---

# Refactor Planner

コードを編集する前に、既存設計へ沿ったリファクタ方針を短く固める。
目的は、場当たり的な修正ではなく、データ、処理、入出力、表示、登録、生成物の境界を明確にしてから変更すること。

## Rule Discovery

1. まずプロジェクト入口ルールを探す。例: `AGENTS.md`、`README.md`、`.rule/**`、`docs/**`、config、task runner、build script。
2. `.notes/**` は探索・確認・参照・編集・コミットしない。
3. naming / module / layer / responsibility ルールがある場合は、それを正本にする。
4. プロジェクト固有ルールが無い場合だけ、このスキルの汎用境界を使う。
5. 生成物、asset、lockfile は、依存関係の確認に必要な場合だけ読む。値が誤っている場合は、生成元や設定を優先して直す。

## Intake

1. ユーザーが対象ファイル、機能、plan、diff を指定した場合はそこを優先する。
2. 対象未指定なら、`.notes/**` を除外して `git status`、`git diff --name-only`、関連 file 一覧を確認する。
3. ユーザーが「実装して」「直して」「進めて」と言っている場合は、必要最小限の方針確認後に変更へ進む。
4. ユーザーが「案だけ」「調査だけ」「レビューだけ」「まだ実装しない」と明示した場合は、コード変更せず具体案を書く。

## Generic Boundaries

プロジェクト固有の layer / role ルールが無い場合は、次の境界で分類する。

- Data: 保存データ、設定、DTO、schema。原則 field-only にする。
- Calculate: 判定、比較、数値計算、派生値。
- Validate: invariant、入力検証、診断。
- Format: 表示文字列、ログ文字列、label 整形。
- Factory: 生成、正規化、補正、組み立て。
- Operation: フレームワーク非依存の状態操作。
- Adapter: UI、I/O、外部 API、フレームワーク固有型との変換。
- Registration: 起動設定、依存注入、handler、plugin、route、job 登録。
- Generated: generator の出力。手書き runtime logic を混ぜない。

既存プロジェクトに別名の role / prefix がある場合は、同じ意味の境界として扱う。新しい role 名は最後の選択肢にする。

## Audit Checklist

### Responsibility

- Data 型に計算、fallback、I/O、表示、外部 API 変換が入っていないか。
- Adapter が domain logic や状態遷移を所有していないか。
- Registration が生成、計算、状態操作を持っていないか。
- Generated output を直接編集して問題を隠していないか。
- UI / I/O / 永続化の都合が core logic に漏れていないか。

### Naming And Modules

- ファイル名、module 名、主役型名が既存ルールと一致しているか。
- `manager`、`helper`、`util`、`misc` など曖昧な責務名で境界をごまかしていないか。
- 既存 role / layer で表せる責務に、新しい命名系を増やしていないか。
- 公開 API と private helper の境界が読み手に分かるか。

### Helper Overuse

`helper`、`util`、`internal`、`sub` などは、親 module の局所的な分岐だけに使う。

危険信号:

- 複数 module や別 feature から直接呼ばれている。
- 計算、検証、整形、状態操作がまとまっている。
- private method 代替として大量の関数が置かれている。
- 親 module を小さく見せるために処理本体を逃がしている。
- 新しい型や責務境界を helper 側が所有している。

判断基準:

- 親 module 入口からだけ呼ばれる局所処理なら継続可。
- core logic なら Calculate / Validate / Format / Factory / Operation へ切り出す。
- 複数 module から使うなら、責務を表す公開 module 関数として分離する。

## Report Format

案だけを求められた場合は、この順で短く具体的に書く。

1. **結論**: 優先して直す責務崩れを 1-3 件に絞る。
2. **既存ルール適合**: project-local rule に合うか、無い場合は汎用境界で分類する。
3. **責務分離案**: 移動元、移動先、関数・型の単位、依存の切り方を書く。
4. **helper 監査**: 継続可 / 分離すべき / 新 role 検討のどれかに分類する。
5. **新 role 候補**: 必要な場合だけ、既存名で表せない理由とルール追記案を書く。
6. **実施順**: 破壊範囲が小さい順に、コミット単位へ切れる作業へ分ける。
7. **検証**: project-local command を優先し、なければ format、type check、test、runtime 確認から必要なものを選ぶ。

## Implementation Mode

修正開始が許可されている場合は、長い案だけで止まらず進める。

1. 方針を 1-3 行で整理する。
2. 関係ファイルを `.notes/**` 除外で確認する。
3. project-local naming / module / layer rule を守って編集する。
4. 変更後は、プロジェクトが指定する format / lint / test / run command を必要範囲で実行する。
5. 最終報告では、実装内容、検証結果、残リスクだけを短く書く。

## Search Hints

PowerShell:

```powershell
git status --short -- . ':(exclude).notes/**'
git diff --name-only -- . ':(exclude).notes/**'
rg --files -g '!target/**' -g '!dist/**' -g '!build/**' -g '!auto_generated/**' -g '!.notes/**'
rg -n "helper|util|internal|sub|pub\\s+fn|function\\s+|class\\s+" -g '!target/**' -g '!dist/**' -g '!build/**' -g '!auto_generated/**' -g '!.notes/**'
```
